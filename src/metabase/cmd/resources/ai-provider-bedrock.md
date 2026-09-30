### IAM permissions for Bedrock

Metabase talks to Bedrock through the mantle endpoint, `https://bedrock-mantle.{region}.api.aws`, not through `bedrock-runtime`. Mantle is a separate IAM namespace with its own actions, so a policy written against the `bedrock` prefix won't grant access. Metabase lists models and runs conversations, so it needs `bedrock-mantle:ListModels` and `bedrock-mantle:CreateInference`.

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

The table above lists the models Metabase can use. The **Models** card only offers the ones Bedrock serves in the connection's region, so what you can pick depends on the region. The mantle catalog has no cross-region inference profiles, so a model that isn't served in your region can't be reached from that region at all.

If the model list is empty or shorter than you expect after connecting:

- **Check the region**: the **Region** dropdown lists every AWS region, including regions where Bedrock serves none of these models. The [AWS model cards](https://docs.aws.amazon.com/bedrock/latest/userguide/model-cards.html) show where each model is available. For example, the GPT models are only served in US regions.
- **Check your account's data retention setting**: Bedrock marks a model unavailable when your account's data retention mode doesn't meet what that model requires. For example, [Claude Fable 5](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-fable-5.html) requires the `aws_review` data retention mode.
