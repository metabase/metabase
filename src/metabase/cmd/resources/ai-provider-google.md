### Open models from Model Garden

You can also run Metabot on an open model, like GLM or Llama, that you deployed from [Model Garden](https://cloud.google.com/model-garden). Metabase talks to the endpoint the deployment created through its OpenAI-compatible Chat Completions API, with the credentials above, and finds a dedicated endpoint's own DNS name for you.

Select the endpoint with the `MB_LLM_METABOT_PROVIDER` environment variable, set to `google/endpoints/` followed by the endpoint's ID, for example `MB_LLM_METABOT_PROVIDER=google/endpoints/1234567890123456789`. The connection's **Location** must be the region you deployed to. The model picker in **Admin > AI** doesn't list endpoints. Saving the Google connection there checks one of the models above, and unless `MB_LLM_METABOT_PROVIDER` is set, it also switches Metabot to that model.

The credentials need `aiplatform.endpoints.get` to look up the endpoint and `aiplatform.endpoints.predict` to run it.

Metabot calls tools and sends long prompts, so deploy the model with tool calling turned on (for vLLM, `--enable-auto-tool-choice` and a `--tool-call-parser` that matches the model) and a context length of at least 16,384 tokens, the minimum Metabase also requires of a vLLM connection. Metabase doesn't check either one when you connect.
