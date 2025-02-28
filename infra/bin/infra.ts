#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { InfraStack, RunType } from '../lib/infra-stack';

const app = new cdk.App();

new InfraStack(app, "BedrockProxy", {
  synthesizer: new cdk.DefaultStackSynthesizer({
    generateBootstrapVersionRule: false,
  }),
  runType: RunType.Lambda,
});

new InfraStack(app, "BedrockProxyFargate", {
  synthesizer: new cdk.DefaultStackSynthesizer({
    generateBootstrapVersionRule: false,
  }),
  runType: RunType.Fargate,
});
