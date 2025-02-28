# bedrock-access-gateway-infra

CDK project to generate deployment templates for Bedrock Access Gateway

## Usage

### Prerequisites

- Node.js and npm installed

### Steps

1. Install dependencies:

   ```bash
   cd infra
   npm install
   ```

2. Generate deployment templates:

   ```bash
   chmod +x generate-template.sh
   ./generate-template.sh
   ```

3. Output:
   - Templates will be generated in the `output/` directory
   - `BedrockProxy.template` - Lambda-based deployment
   - `BedrockProxyFargate.template` - Fargate-based deployment

### Deployment

After generating the templates, you can deploy them using AWS CloudFormation console or AWS CLI.
