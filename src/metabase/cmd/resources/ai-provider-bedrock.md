### IAM permissions for Bedrock

Metabase talks to Bedrock through the mantle endpoint, `https://bedrock-mantle.{region}.api.aws`, unless the connection's **Model ID** sends it to `bedrock-runtime` (see [Use an inference profile](#use-an-inference-profile)). Mantle is a separate IAM namespace with its own actions, so a policy written against the `bedrock` prefix won't grant access. Metabase lists models and runs conversations, so it needs `bedrock-mantle:ListModels` and `bedrock-mantle:CreateInference`.

Here's a least-privilege policy that grants both:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["bedrock-mantle:ListModels", "bedrock-mantle:CreateInference"],
      "Resource": "arn:aws:bedrock-mantle:*:*:project/*"
    }
  ]
}
```

The AWS managed policy [AmazonBedrockMantleInferenceAccess](https://docs.aws.amazon.com/aws-managed-policy/latest/reference/AmazonBedrockMantleInferenceAccess.html) also covers both actions (along with permissions Metabase doesn't use).

If Metabase reports "AWS Bedrock credentials lack permission for this model or action", check that your policy uses the `bedrock-mantle` prefix.

### The Bedrock models you can pick depend on the region

The table above lists the models Metabase can use. The **Models** card only offers the ones Bedrock serves in the connection's region, so what you can pick depends on the region. The mantle catalog has no cross-region inference profiles, so to reach a model that isn't served in your region, [use an inference profile](#use-an-inference-profile).

If the model list is empty or shorter than you expect after connecting:

- **Check the region**: the **Region** dropdown lists every AWS region, including regions where Bedrock serves none of these models. The [AWS model cards](https://docs.aws.amazon.com/bedrock/latest/userguide/model-cards.html) show where each model is available. For example, the GPT models are only served in US regions.
- **Check your account's data retention setting**: Bedrock marks a model unavailable when your account's data retention mode doesn't meet what that model requires. For example, [Claude Fable 5](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-fable-5.html) requires the `aws_review` data retention mode.

### Use an inference profile

To use an [inference profile](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles.html), or a Claude model that isn't listed for your region, enter its ID or ARN in **Model ID**, like `eu.anthropic.claude-sonnet-4-6` or `us.anthropic.claude-haiku-4-5-20251001-v1:0`. That connection serves this model instead of the models above: connecting checks it by generating a single token, and the model picker offers it as the connection's only model. To use the models above too, add a second Amazon Bedrock provider without a model ID.

Metabase sends inference profile IDs, ARNs, and model IDs with a version suffix like `-v1:0` to `bedrock-runtime`, `https://bedrock-runtime.{region}.amazonaws.com`, instead of mantle. Through `bedrock-runtime`, Metabase only talks to Claude models, and it needs `bedrock:InvokeModelWithResponseStream` on the inference profile and on the foundation model in every region the profile routes to:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "bedrock:InvokeModelWithResponseStream",
      "Resource": [
        "arn:aws:bedrock:*:*:inference-profile/*",
        "arn:aws:bedrock:*:*:application-inference-profile/*",
        "arn:aws:bedrock:*::foundation-model/*"
      ]
    }
  ]
}
```

If you configure the Bedrock connection with environment variables, it has no model ID. Set `MB_LLM_METABOT_PROVIDER` to `bedrock/` followed by the ID instead, and set `MB_LLM_MINI_MODEL` the same way, since short tasks otherwise run on `anthropic.claude-haiku-4-5` through mantle.
