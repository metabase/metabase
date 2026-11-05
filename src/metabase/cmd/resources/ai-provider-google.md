### Connect an open model from Model Garden

You can also run Metabot on an open model, like GLM or Llama, that you deployed from [Model Garden](https://cloud.google.com/model-garden). Metabase talks to the endpoint the deployment created through its OpenAI-compatible Chat Completions API, with the credentials above, and finds a dedicated endpoint's own DNS name for you.

To connect it, add a Google Gemini Enterprise provider in **Admin > AI**, enter the endpoint's ID in **Model Garden endpoint ID**, and set **Location** to the region you deployed to. That connection serves the endpoint instead of the models above: connecting checks the endpoint, and the model picker offers the endpoint as the connection's only model. To use the models above too, add a second Google Gemini Enterprise provider without an endpoint ID, and pick between them in the model picker.

If you configure the Google connection with environment variables, it has no endpoint ID. Set `MB_LLM_METABOT_PROVIDER` to `google/endpoints/` followed by the endpoint's ID instead.

The credentials need `aiplatform.endpoints.get` to look up the endpoint and `aiplatform.endpoints.predict` to run it.

Metabot calls tools and sends long prompts, so deploy the model with tool calling turned on (for vLLM, `--enable-auto-tool-choice` and a `--tool-call-parser` that matches the model) and a context length of at least 16,384 tokens, the minimum Metabase also requires of a vLLM connection. Metabase doesn't check either one when you connect.
