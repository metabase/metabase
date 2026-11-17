### What connecting checks

When you connect, Metabase sends the model a few short test requests. The model has to call a tool, call a tool when the request requires one (`tool_choice` set to `required`), and return its reasoning separately from its answer. If the server's `/models` list gives the model's context window, as `max_model_len` or `context_length`, it has to be at least 16,384 tokens. If a check fails, Metabase doesn't save the connection and tells you which check failed.

The checks only test what Metabot needs to run. Metabase doesn't benchmark these models, so how well Metabot works depends on the model you choose. Models that need their reasoning sent back with every request can fail partway through a conversation, because Metabase doesn't send it back to them.

### Servers this connection has been tried with

- xAI, `https://api.x.ai/v1`, with `grok-4.3`: connects, and Metabot answers questions on it.
- OpenRouter, `https://openrouter.ai/api/v1`, with `anthropic/claude-haiku-4.5`: passed the checks when tried. OpenRouter sends each request to one of the providers that serve a model, so a model can pass the checks on one try and fail them on the next, as `openai/gpt-oss-120b` did.
- DeepSeek, `https://api.deepseek.com/v1`, with `deepseek-v4-pro`: doesn't connect. In thinking mode, DeepSeek rejects requests that require a tool call, so the forced tool call check fails.

### API base URL examples

Enter the URL that comes before `/chat/completions`. These examples show the format, and weren't tried:

- Scaleway: `https://api.scaleway.ai/v1`
- A vLLM, llama.cpp, or LM Studio server: `http://<host>:<port>/v1`

On a self-hosted Metabase, a server on your private network or on the same machine as Metabase needs [`MB_LLM_ALLOWED_NETWORKS`](../configuring-metabase/environment-variables.md#mb_llm_allowed_networks).

### Set the model with environment variables

If you configure this connection with environment variables, it has no **Model ID**. Set `MB_LLM_METABOT_PROVIDER` to `openai-compatible/` followed by the model ID instead, like `openai-compatible/gpt-oss-120b`.
