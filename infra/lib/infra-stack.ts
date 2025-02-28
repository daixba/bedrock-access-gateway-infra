import * as cdk from 'aws-cdk-lib';
import { CfnParameter, CfnOutput, Fn } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { ProxyApiLambda } from './proxy-api-lambda';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { ProxyApiFargate } from './proxy-api-fargate';

export enum RunType {
  Lambda,
  Fargate,
}

export interface MainProps extends cdk.StackProps {
  runType: RunType;
}

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MainProps) {
    super(scope, id, props);

    const apiKeySecretArn = new CfnParameter(this, 'ApiKeySecretArn', {
      description:
        'The secret ARN in Secrets Manager used to store the API Key',
      type: 'String',
      allowedPattern: '^arn:aws:secretsmanager:.*$',
    });

    const defaultModelId = new CfnParameter(this, 'DefaultModelId', {
      description:
        'The default model ID, please make sure the model ID is supported in the current region',
      default: 'anthropic.claude-3-sonnet-20240229-v1:0',
      type: 'String',
    });

    this.templateOptions.description = `Bedrock Access Gateway - OpenAI-compatible RESTful APIs for Amazon Bedrock`;

    const vpc = new ec2.Vpc(this, 'VPC', {
      ipAddresses: ec2.IpAddresses.cidr('10.250.0.0/16'),
      enableDnsHostnames: true,
      enableDnsSupport: true,
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
      ],
      maxAzs: 2,
      natGateways: 0,
      restrictDefaultSecurityGroup: false,
    });

    let proxyStack;

    const apiKeySecret = secretsmanager.Secret.fromSecretCompleteArn(
      this,
      'ApiKeySecret',
      apiKeySecretArn.valueAsString,
    );

    const defaultParams = {
      vpc: vpc,
      defaultModelId: defaultModelId.valueAsString,
      apiKeySecret: apiKeySecret,
    };

    if (props.runType === RunType.Lambda) {
      proxyStack = new ProxyApiLambda(this, 'Proxy', { ...defaultParams });
    } else {
      proxyStack = new ProxyApiFargate(this, 'Proxy', {
        ...defaultParams,
      });
    }

    new CfnOutput(this, 'APIBaseUrl', {
      description: 'Proxy API Base URL (OPENAI_API_BASE)',
      value: Fn.join('', [
        'http://',
        proxyStack.lb.loadBalancerDnsName,
        '/api/v1',
      ]),
    });
  }
}
