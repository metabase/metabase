---
title: Supported AI providers
summary: The AI providers Metabase can connect to, the credentials each one needs, and the models each one offers.
---

# Supported AI providers

_This documentation was generated from source by running:_

```
clojure -M:ee:doc ai-providers-documentation
```

To power [Metabot](./metabot.md), you can connect Metabase to one of the providers below with your own credentials, or let Metabase manage the AI for you. For how to set up a connection, check out [AI settings](./settings.md).

You set up a provider in **Admin > AI**. If you self-host Metabase, you can set a provider's credentials with environment variables instead; each credential below lists the variable that sets it. You don't have to use environment variables. On Metabase Cloud, [contact support](https://www.metabase.com/help-premium) if you want environment variables set for your instance.

If you want Metabase to support a provider or model that isn't listed here, let us know by submitting a [feature request](../troubleshooting-guide/requesting-new-features.md).

## Anthropic

- Provider key: `anthropic`
- Default model: `claude-sonnet-4-6`
- Model for short tasks like naming a conversation: `claude-haiku-4-5-20251001`

Supported models:

| Model             | Model ID                     | Context window (tokens) |
| ----------------- | ---------------------------- | ----------------------- |
| Claude Fable 5    | `claude-fable-5`             | 1,000,000               |
| Claude Haiku 4.5  | `claude-haiku-4-5-20251001`  | 200,000                 |
| Claude Opus 4.1   | `claude-opus-4-1-20250805`   | 200,000                 |
| Claude Opus 4.5   | `claude-opus-4-5-20251101`   | 200,000                 |
| Claude Opus 4.6   | `claude-opus-4-6`            | 1,000,000               |
| Claude Opus 4.7   | `claude-opus-4-7`            | 1,000,000               |
| Claude Opus 4.8   | `claude-opus-4-8`            | 1,000,000               |
| Claude Opus 5     | `claude-opus-5`              | 1,000,000               |
| Claude Sonnet 4.5 | `claude-sonnet-4-5-20250929` | 200,000                 |
| Claude Sonnet 4.6 | `claude-sonnet-4-6`          | 1,000,000               |
| Claude Sonnet 5   | `claude-sonnet-5`            | 1,000,000               |

Credentials:

- **API key** (required). [Where do I find this?](https://console.anthropic.com/settings/keys) You can also set it with the environment variable `MB_LLM_ANTHROPIC_API_KEY`.
- **API base URL** (advanced). Defaults to `https://api.anthropic.com`. You can also set it with the environment variable `MB_LLM_ANTHROPIC_API_BASE_URL`.

## OpenAI

- Provider key: `openai`
- Default model: `gpt-5.4`
- Model for short tasks like naming a conversation: `gpt-5.4-mini`

Supported models:

| Model         | Model ID        | Context window (tokens) |
| ------------- | --------------- | ----------------------- |
| GPT-5.4       | `gpt-5.4`       | 922,000                 |
| GPT-5.4 Mini  | `gpt-5.4-mini`  | 272,000                 |
| GPT-5.4 Pro   | `gpt-5.4-pro`   | 922,000                 |
| GPT-5.5       | `gpt-5.5`       | 922,000                 |
| GPT-5.5 Pro   | `gpt-5.5-pro`   | 922,000                 |
| GPT-5.6 Luna  | `gpt-5.6-luna`  | 922,000                 |
| GPT-5.6 Sol   | `gpt-5.6-sol`   | 922,000                 |
| GPT-5.6 Terra | `gpt-5.6-terra` | 922,000                 |

Credentials:

- **API key** (required). [Where do I find this?](https://platform.openai.com/api-keys) You can also set it with the environment variable `MB_LLM_OPENAI_API_KEY`.
- **API base URL** (advanced). Defaults to `https://api.openai.com`. You can also set it with the environment variable `MB_LLM_OPENAI_API_BASE_URL`.

## OpenRouter

- Provider key: `openrouter`
- Default model: `anthropic/claude-sonnet-4.6`
- Model for short tasks like naming a conversation: `anthropic/claude-haiku-4.5`

Supported models:

| Model                  | Model ID                          | Context window (tokens) |
| ---------------------- | --------------------------------- | ----------------------- |
| Claude Fable 5         | `anthropic/claude-fable-5`        | 1,000,000               |
| Claude Haiku 4.5       | `anthropic/claude-haiku-4.5`      | 200,000                 |
| Claude Opus 4.1        | `anthropic/claude-opus-4.1`       | 200,000                 |
| Claude Opus 4.5        | `anthropic/claude-opus-4.5`       | 200,000                 |
| Claude Opus 4.6        | `anthropic/claude-opus-4.6`       | 1,000,000               |
| Claude Opus 4.7        | `anthropic/claude-opus-4.7`       | 1,000,000               |
| Claude Opus 4.8        | `anthropic/claude-opus-4.8`       | 1,000,000               |
| Claude Opus 5          | `anthropic/claude-opus-5`         | 1,000,000               |
| Claude Sonnet 4.5      | `anthropic/claude-sonnet-4.5`     | 1,000,000               |
| Claude Sonnet 4.6      | `anthropic/claude-sonnet-4.6`     | 1,000,000               |
| Claude Sonnet 5        | `anthropic/claude-sonnet-5`       | 1,000,000               |
| DeepSeek V4 Flash 0731 | `deepseek/deepseek-v4-flash-0731` | 1,048,576               |
| DeepSeek V4 Pro 0423   | `deepseek/deepseek-v4-pro`        | 1,048,576               |
| DeepSeek V4 Pro 0813   | `deepseek/deepseek-v4-pro-0813`   | 1,048,575               |
| Mistral Medium 3.5     | `mistralai/mistral-medium-3-5`    | 262,144                 |
| Kimi K3                | `moonshotai/kimi-k3`              | 1,048,576               |
| GPT-5.4                | `openai/gpt-5.4`                  | 922,000                 |
| GPT-5.4 Mini           | `openai/gpt-5.4-mini`             | 272,000                 |
| GPT-5.4 Pro            | `openai/gpt-5.4-pro`              | 922,000                 |
| GPT-5.5                | `openai/gpt-5.5`                  | 922,000                 |
| GPT-5.5 Pro            | `openai/gpt-5.5-pro`              | 922,000                 |
| GPT-5.6 Luna           | `openai/gpt-5.6-luna`             | 922,000                 |
| GPT-5.6 Sol            | `openai/gpt-5.6-sol`              | 922,000                 |
| GPT-5.6 Terra          | `openai/gpt-5.6-terra`            | 922,000                 |
| Qwen3.8 Max            | `qwen/qwen3.8-max`                | 1,000,000               |
| GLM-5.2                | `z-ai/glm-5.2`                    | 1,048,576               |

Credentials:

- **API key** (required). [Where do I find this?](https://openrouter.ai/keys) You can also set it with the environment variable `MB_LLM_OPENROUTER_API_KEY`.
- **API base URL** (advanced). Defaults to `https://openrouter.ai/api`. You can also set it with the environment variable `MB_LLM_OPENROUTER_API_BASE_URL`.

## Mistral

- Provider key: `mistral`
- Default model: `mistral-medium-3-5`
- Model for short tasks like naming a conversation: `mistral-medium-3-5`

Supported models:

| Model              | Model ID             | Context window (tokens) |
| ------------------ | -------------------- | ----------------------- |
| Mistral Medium 3.5 | `mistral-medium-3-5` | 262,144                 |

Credentials:

- **API key** (required). [Where do I find this?](https://console.mistral.ai/api-keys) You can also set it with the environment variable `MB_LLM_MISTRAL_API_KEY`.
- **API base URL** (advanced). Defaults to `https://api.mistral.ai/v1`. You can also set it with the environment variable `MB_LLM_MISTRAL_API_BASE_URL`.

## Z.AI

- Provider key: `zai`
- Default model: `glm-5.2`
- Model for short tasks like naming a conversation: `glm-5.2`

Supported models:

| Model   | Model ID  | Context window (tokens) |
| ------- | --------- | ----------------------- |
| GLM-5.2 | `glm-5.2` | 1,048,576               |

Credentials:

- **API key** (required). [Where do I find this?](https://z.ai/manage-apikey/apikey-list) You can also set it with the environment variable `MB_LLM_ZAI_API_KEY`.
- **API base URL** (advanced). Defaults to `https://api.z.ai/api/paas/v4`. You can also set it with the environment variable `MB_LLM_ZAI_API_BASE_URL`.

## Moonshot AI

- Provider key: `moonshot`
- Default model: `kimi-k3`
- Model for short tasks like naming a conversation: `kimi-k3`

Supported models:

| Model     | Model ID    | Context window (tokens) |
| --------- | ----------- | ----------------------- |
| Kimi K2.6 | `kimi-k2.6` | 262,144                 |
| Kimi K3   | `kimi-k3`   | 1,048,576               |

Credentials:

- **API key** (required). [Where do I find this?](https://platform.kimi.ai/console/api-keys) You can also set it with the environment variable `MB_LLM_MOONSHOT_API_KEY`.
- **API base URL** (advanced). Point this at the .cn platform to use it instead; keys are not interchangeable between the two. Defaults to `https://api.moonshot.ai/v1`. You can also set it with the environment variable `MB_LLM_MOONSHOT_API_BASE_URL`.

## DeepSeek

- Provider key: `deepseek`
- Default model: `deepseek-v4-pro`
- Model for short tasks like naming a conversation: `deepseek-v4-flash`

Supported models:

| Model             | Model ID            |
| ----------------- | ------------------- |
| DeepSeek V4 Flash | `deepseek-v4-flash` |
| DeepSeek V4 Pro   | `deepseek-v4-pro`   |

Credentials:

- **API key** (required). [Where do I find this?](https://platform.deepseek.com/api_keys) You can also set it with the environment variable `MB_LLM_DEEPSEEK_API_KEY`.
- **API base URL** (advanced). The root both surfaces hang off; leave off any /anthropic or /v1 path. Defaults to `https://api.deepseek.com`. You can also set it with the environment variable `MB_LLM_DEEPSEEK_API_BASE_URL`.

## Google Gemini Enterprise

- Provider key: `google`
- Default model: `google/gemini-3.5-flash`

Supported models:

| Model             | Model ID                              |
| ----------------- | ------------------------------------- |
| Claude Fable 5    | `anthropic/claude-fable-5`            |
| Claude Haiku 4.5  | `anthropic/claude-haiku-4-5@20251001` |
| Claude Opus 4.6   | `anthropic/claude-opus-4-6`           |
| Claude Opus 5     | `anthropic/claude-opus-5`             |
| Claude Sonnet 4.6 | `anthropic/claude-sonnet-4-6`         |
| Claude Sonnet 5   | `anthropic/claude-sonnet-5`           |
| Gemini 3.5 Flash  | `google/gemini-3.5-flash`             |
| Gemini 3.6 Flash  | `google/gemini-3.6-flash`             |
| Gemini 3.7 Flash  | `google/gemini-3.7-flash`             |

Credentials:

- **Project ID**. The Google Cloud project to use. Optional if the service account key provides it. [Where do I find this?](https://docs.cloud.google.com/resource-manager/docs/creating-managing-projects) You can also set it with the environment variable `MB_LLM_GOOGLE_PROJECT_ID`.
- **Location**. Optional. Defaults to global. You can also set it with the environment variable `MB_LLM_GOOGLE_LOCATION`.
- **Authentication method** (required). Authenticate with a service account key or an OAuth access token. One of: `Service account key`, `OAuth token`. Defaults to `Service account key`.
- **Service account key file**. Only when **Authentication method** is **Service account key**. Upload a service account key file to authenticate with. [Where do I find this?](https://docs.cloud.google.com/iam/docs/keys-create-delete) You can also set it with the environment variable `MB_LLM_GOOGLE_SERVICE_ACCOUNT_KEY`.
- **OAuth access token**. Only when **Authentication method** is **OAuth token**. A short-lived token, e.g. the output of gcloud auth print-access-token. Useful for testing. You can also set it with the environment variable `MB_LLM_GOOGLE_OAUTH_ACCESS_TOKEN`.
- **API base URL** (advanced). Derived from the location when left at the global host. Defaults to `https://aiplatform.googleapis.com`. You can also set it with the environment variable `MB_LLM_GOOGLE_API_BASE_URL`.

Google Gemini Enterprise needs either **Service account key file**, or **OAuth access token** and **Project ID**.

## Microsoft Azure

- Provider key: `azure`

Supported models:

Whichever model your deployment serves. Microsoft Azure serves the deployments you create, not a fixed catalog, so there's no list to pick from — Metabase works out the model from **Model provider** and **Deployment name** instead.

Credentials:

- **API key** (required). [Where do I find this?](https://ai.azure.com) You can also set it with the environment variable `MB_LLM_AZURE_API_KEY`.
- **API base URL** (required). You can also set it with the environment variable `MB_LLM_AZURE_API_BASE_URL`.
- **Model provider** (required). Whether your deployment serves an Anthropic or an OpenAI model. One of: `OpenAI`, `Anthropic`. Defaults to `OpenAI`. You can also set it with the environment variable `MB_LLM_AZURE_MODEL_FAMILY`.
- **Deployment name** (required). The name of the model deployment on your Azure resource. We recommend naming deployments after the model they serve. You can also set it with the environment variable `MB_LLM_AZURE_DEPLOYMENT_NAME`.

## Amazon Bedrock

- Provider key: `bedrock`
- Default model: `anthropic.claude-opus-4-8`
- Model for short tasks like naming a conversation: `anthropic.claude-haiku-4-5`

Supported models:

| Model                | Model ID                     | Context window (tokens) |
| -------------------- | ---------------------------- | ----------------------- |
| Claude Fable 5       | `anthropic.claude-fable-5`   | 1,000,000               |
| Claude Haiku 4.5     | `anthropic.claude-haiku-4-5` | 200,000                 |
| Claude Opus 4.7      | `anthropic.claude-opus-4-7`  | 1,000,000               |
| Claude Opus 4.8      | `anthropic.claude-opus-4-8`  | 1,000,000               |
| Claude Opus 5        | `anthropic.claude-opus-5`    | 1,000,000               |
| Claude Sonnet 5      | `anthropic.claude-sonnet-5`  | 1,000,000               |
| GPT-5.4              | `openai.gpt-5.4`             | 272,000                 |
| GPT-5.4 (2026-03-05) | `openai.gpt-5.4-2026-03-05`  | 272,000                 |
| GPT-5.5              | `openai.gpt-5.5`             | 272,000                 |
| GPT-5.5 (2026-04-23) | `openai.gpt-5.5-2026-04-23`  | 272,000                 |

Credentials:

- **Access key ID**. Only together with **Secret access key**. Leave the keys blank to authenticate with the AWS default credentials chain (IRSA, EKS Pod Identity, or instance profile). On Metabase Cloud, Bedrock always authenticates with your own AWS keys. [Where do I find this?](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html) You can also set it with the environment variable `MB_LLM_BEDROCK_ACCESS_KEY_ID`.
- **Secret access key**. Only together with **Access key ID**. Required on Metabase Cloud. You can also set it with the environment variable `MB_LLM_BEDROCK_SECRET_ACCESS_KEY`.
- **Region**. Pick one from the dropdown in **Admin > AI**. Defaults to `us-east-1`. You can also set it with the environment variable `MB_LLM_BEDROCK_REGION`.
- **Session token** (advanced). Only together with **Access key ID** and **Secret access key**. Only needed for temporary credentials. You can also set it with the environment variable `MB_LLM_BEDROCK_SESSION_TOKEN`.

## vLLM

- Provider key: `vllm`

Supported models:

Metabase lists whichever models your vLLM server is serving, so what you can pick depends on how you started it.

Credentials:

- **API base URL** (required). Your server's OpenAI-compatible API. It should end in /v1. You can also set it with the environment variable `MB_LLM_VLLM_API_BASE_URL`.
- **API key**. Only needed if you started your server with --api-key. You can also set it with the environment variable `MB_LLM_VLLM_API_KEY`.

## Metabase AI service

- Provider key: `metabase`
- Default model: `anthropic/claude-sonnet-4-6`
- Managed by Metabase, so there's nothing to configure. You can only connect one.

Supported models:

| Model             | Model ID                      |
| ----------------- | ----------------------------- |
| Claude Sonnet 4.6 | `anthropic/claude-sonnet-4-6` |

On Metabase Cloud, you can have Metabase manage the AI for you. Metabase selects benchmarked, cost-effective models, so this is a good option if you don't have a preferred AI provider, or if you want to manage your AI costs through Metabase. You'll be charged based on token usage, on top of your Metabase Cloud subscription. See [Pricing](https://www.metabase.com/pricing).

Metabase authenticates this connection with your instance's license token, so there's no API key to enter.

For how to connect and disconnect, see [AI settings](./settings.md#metabase-ai-service).
