import { Construct } from 'constructs';
import * as targets from 'aws-cdk-lib/aws-elasticloadbalancingv2-targets';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Architecture } from 'aws-cdk-lib/aws-lambda';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Duration, Aws } from 'aws-cdk-lib';

export interface ProxyApiProps {
  vpc: ec2.IVpc;
  defaultModelId: string;
  apiKeySecret: secretsmanager.ISecret;
}

export class ProxyApiLambda extends Construct {
  readonly lb: elbv2.ApplicationLoadBalancer;
  constructor(scope: Construct, id: string, props: ProxyApiProps) {
    super(scope, id);

    const repoName: string = 'bedrock-proxy-api';

    // Replace this if you want.
    // Make sure the repo exists in ECR.
    const repoArn: string = `arn:aws:ecr:${Aws.REGION}:366590864501:repository/${repoName}`;
    const repo = ecr.Repository.fromRepositoryAttributes(this, 'ApiRepo', {
      repositoryArn: repoArn,
      repositoryName: repoName,
    });

    const proxyApiFn = new lambda.DockerImageFunction(this, 'ApiHandler', {
      code: lambda.DockerImageCode.fromEcr(repo),
      architecture: Architecture.ARM_64,
      environment: {
        DEBUG: 'false',
        API_KEY_SECRET_ARN: props.apiKeySecret.secretArn,
        DEFAULT_MODEL: props.defaultModelId,
        DEFAULT_EMBEDDING_MODEL: 'cohere.embed-multilingual-v3',
        ENABLE_CROSS_REGION_INFERENCE: 'true',
      },

      timeout: Duration.seconds(600),
      memorySize: 1024,
      description: 'Bedrock Proxy API Handler',
    });
    proxyApiFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock:ListFoundationModels',
          'bedrock:ListInferenceProfiles',
        ],
        resources: ['*'],
      }),
    );
    proxyApiFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock:InvokeModel',
          'bedrock:InvokeModelWithResponseStream',
        ],
        resources: [
          'arn:aws:bedrock:*::foundation-model/*',
          'arn:aws:bedrock:*:*:inference-profile/*',
        ],
      }),
    );

    props.apiKeySecret.grantRead(proxyApiFn);

    this.lb = new elbv2.ApplicationLoadBalancer(this, 'ALB', {
      vpc: props.vpc,
      internetFacing: true,
    });

    const listener = this.lb.addListener('Listener', { port: 80 });
    listener.addTargets('Targets', {
      targets: [new targets.LambdaTarget(proxyApiFn)],
      healthCheck: {
        enabled: false,
      },
    });
  }
}
