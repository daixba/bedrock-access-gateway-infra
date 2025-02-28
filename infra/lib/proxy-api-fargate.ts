import { Construct } from 'constructs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Aws, Duration } from 'aws-cdk-lib';
import {
  ContainerImage,
  CpuArchitecture,
  OperatingSystemFamily,
} from 'aws-cdk-lib/aws-ecs';

export interface ProxyApiProps {
  vpc: ec2.IVpc;
  defaultModelId: string;
  apiKeySecret: secretsmanager.ISecret;
}

export class ProxyApiFargate extends Construct {
  readonly lb: elbv2.ApplicationLoadBalancer;
  constructor(scope: Construct, id: string, props: ProxyApiProps) {
    super(scope, id);

    const execRole = new iam.Role(this, 'ExecRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    execRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'ecr:GetAuthorizationToken',
          'ecr:BatchCheckLayerAvailability',
          'ecr:GetDownloadUrlForLayer',
          'ecr:BatchGetImage',
          'logs:CreateLogStream',
          'logs:PutLogEvents',
        ],
        resources: ['*'],
      }),
    );

    const taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    taskRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock:ListFoundationModels',
          'bedrock:ListInferenceProfiles',
        ],
        resources: ['*'],
      }),
    );
    taskRole.addToPolicy(
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

    props.apiKeySecret.grantRead(execRole);

    const repoName: string = 'bedrock-proxy-api-ecs';
    // Replace this if you want.
    // Make sure the repo exists in ECR.
    const repoArn: string = `arn:aws:ecr:${Aws.REGION}:366590864501:repository/${repoName}`;

    const repo = ecr.Repository.fromRepositoryAttributes(this, 'ApiRepo', {
      repositoryArn: repoArn,
      repositoryName: repoName,
    });

    const cluster = new ecs.Cluster(this, 'BedrockCluster', {
      vpc: props.vpc,
      enableFargateCapacityProviders: true,
    });

    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDef', {
      cpu: 1024,
      memoryLimitMiB: 2048,
      executionRole: execRole,
      taskRole: taskRole,
      runtimePlatform: {
        cpuArchitecture: CpuArchitecture.ARM64,
        operatingSystemFamily: OperatingSystemFamily.LINUX,
      },
    });

    taskDefinition.addContainer('proxy-api', {
      environment: {
        DEBUG: 'false',
        DEFAULT_MODEL: props.defaultModelId,
        DEFAULT_EMBEDDING_MODEL: 'cohere.embed-multilingual-v3',
        ENABLE_CROSS_REGION_INFERENCE: 'true',
      },
      secrets: {
        API_KEY: ecs.Secret.fromSecretsManager(props.apiKeySecret, 'api_key'),
      },
      image: ContainerImage.fromEcrRepository(repo),
      portMappings: [
        {
          containerPort: 80,
          hostPort: 80,
        },
      ],
      // logging: LogDrivers.awsLogs({
      //   streamPrefix: "proxy",
      //   logRetention: 14,
      // }),
    });

    const apiSvc = new ecs.FargateService(this, 'ApiService', {
      cluster,
      taskDefinition,
      capacityProviderStrategies: [
        {
          capacityProvider: 'FARGATE',
          weight: 1,
        },
      ],
      assignPublicIp: true,
      desiredCount: 1,
    });

    this.lb = new elbv2.ApplicationLoadBalancer(this, 'ALB', {
      vpc: props.vpc,
      internetFacing: true,
      idleTimeout: Duration.minutes(10),
    });

    const listener = this.lb.addListener('Listener', { port: 80 });
    listener.addTargets('Targets', {
      targets: [apiSvc],
      healthCheck: {
        enabled: true,
        path: '/health',
        timeout: Duration.seconds(30),
        interval: Duration.seconds(60),
      },
      port: 80,
    });
  }
}
