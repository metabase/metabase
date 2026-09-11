### Open models from Model Garden

You can also run Metabot on an open model, like GLM or Llama, that you deployed from [Model Garden](https://cloud.google.com/model-garden). Metabase talks to the endpoint the deployment created through its OpenAI-compatible Chat Completions API, with the credentials above, and finds a dedicated endpoint's own DNS name for you.

The model ID is `endpoints/` followed by the endpoint's ID, for example `endpoints/1234567890123456789`, and the connection's **Location** must be the region you deployed to. The model picker in **Admin > AI** lists only the models above, so select an endpoint with the `MB_LLM_METABOT_PROVIDER` environment variable, for example `MB_LLM_METABOT_PROVIDER=google/endpoints/1234567890123456789`.
