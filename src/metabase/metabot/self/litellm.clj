(ns metabase.metabot.self.litellm
  "LiteLLM Proxy / Chat Completions adapter, for a self-hosted LiteLLM gateway.

  The base URL is required and the API key is optional: a proxy started without a master key needs none.
  There is no model allow-list, because the proxy serves whichever model aliases its operator configured,
  so the picker lists the proxy's `/models` catalog as it is. The proxy serves the Chat Completions API
  both at the root and under `/v1`, so the base URL works with or without a `/v1` suffix.

  https://docs.litellm.ai/docs/proxy/quick_start
  https://docs.litellm.ai/docs/proxy/virtual_keys"
  (:require
   [clojure.string :as str]
   [metabase.llm.settings :as llm]
   [metabase.metabot.self.adapter :as adapter]
   [metabase.metabot.self.core :as core]
   [metabase.metabot.self.openai.chat-completions :as chat-completions]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu])
  (:import
   (com.fasterxml.jackson.core JsonProcessingException)
   (java.io IOException)
   (java.net SocketTimeoutException)))

(set! *warn-on-reflection* true)

(defn- missing-base-url-ex []
  (ex-info (tru "No LiteLLM base URL is set")
           {:api-error  true
            :error-code :base-url-missing}))

(defn- missing-model-ex []
  (ex-info (tru "No LiteLLM model is set")
           {:api-error  true
            :error-code :model-missing}))

(defn- litellm-auth
  "LiteLLM's `:auth`. A proxy needs a base URL but not a key — one started without a master key is a
  complete configuration — so the map is never nil and [[core/resolve-auth]] cannot reach its
  `missing-api-key-ex` branch."
  [{:keys [slug display-name]} {:keys [credentials ai-proxy?]}]
  (let [base-url (not-empty (:base-url credentials))
        api-key  (not-empty (:api-key credentials))]
    (when-not base-url
      (throw (missing-base-url-ex)))
    (core/resolve-auth slug display-name
                       (cond-> {:url base-url}
                         api-key (assoc :headers {"Authorization" (str "Bearer " api-key)}))
                       ai-proxy?)))

(def ^:private provider
  "LiteLLM's descriptor. No `:supports-ai-proxy?`, so [[adapter/request!]] refuses a proxied request: the Metabase
  AI proxy fronts hosted providers, and a LiteLLM proxy is reached directly at the address the admin set."
  (adapter/provider
   {:slug         "litellm"
    :display-name "LiteLLM"
    :auth         litellm-auth
    :errors       {400 #(tru "LiteLLM rejected the request — usually a model name the proxy does not know, or a model that cannot produce the requested tool call or JSON schema")
                   401 #(tru "LiteLLM API key expired or invalid — check the virtual key or the master key of your proxy")
                   404 #(tru "LiteLLM API endpoint was not found — check the base URL")
                   429 #(tru "LiteLLM is rate limiting this request — a budget or rate limit on the key, or on the upstream model, may apply")
                   500 #(tru "LiteLLM returned an internal server error")}}))

;;; ------------------------------------------------ Model listing -----------------------------------------------

(defn- list-models-io-ex
  "The LiteLLM error for a transport failure while fetching the model catalog — the request behind the admin
  Connect button. Tagged `:status-code 400` so a mistyped base URL surfaces this message rather than the 500
  `core/rethrow-api-error!`'s untagged no-response branch would produce."
  [^IOException e base-url]
  (if (instance? SocketTimeoutException e)
    (ex-info (tru "The LiteLLM proxy at {0} did not respond within {1}ms. Check that it is running and not overloaded."
                  (str base-url) (str (llm/llm-request-timeout-ms)))
             {:api-error   true
              :status-code 400
              :error-code  :litellm-timeout}
             e)
    (ex-info (tru "Could not reach the LiteLLM proxy at {0}. Check that it is running and that the base URL is correct."
                  (str base-url))
             {:api-error   true
              :status-code 400
              :error-code  :litellm-unreachable}
             e)))

(mu/defn list-models :- adapter/ModelListing
  "List the models the connection's LiteLLM proxy serves. Pass-through: the names are the aliases in the
  proxy's own configuration, so there is nothing to whitelist, and `display_name` is the served id.

  The catalog doubles as the credential round trip behind the admin Connect button. A 2xx whose body is not a
  recognizable catalog fails closed through [[chat-completions/models-catalog]], naming the base URL — the
  likeliest cause for a provider whose address the admin types.
  `:ai-proxy?` is not supported for LiteLLM and throws when true."
  ([] (list-models {}))
  ([{:keys [credentials ai-proxy?]} :- adapter/ListOpts]
   ;; The URL off the request credentials, not the setting: a connect verifies them before they are saved.
   (let [base-url (:base-url credentials)
         detail   (tru "Check that {0} is a LiteLLM proxy''s OpenAI-compatible API." (str base-url))]
     (try
       (let [res (adapter/request! provider {:credentials credentials
                                             :ai-proxy?   ai-proxy?
                                             :method      :get
                                             :path        "/models"
                                             :as          :json})]
         {:models (into []
                        (comp (map :id)
                              (filter string?)
                              (map (fn [id] {:id id :display_name id})))
                        (chat-completions/models-catalog "LiteLLM" res {:detail detail}))})
       ;; Ordered ahead of the `IOException` catch, which Jackson's parse error is one of: a 2xx whose
       ;; body is not JSON means the server answered, so the address is wrong rather than unreachable.
       (catch JsonProcessingException e
         (throw (chat-completions/malformed-catalog-ex "LiteLLM" detail e)))
       ;; Ordered ahead of the generic catch, which a non-2xx still reaches as an `ExceptionInfo`.
       (catch IOException e
         (throw (list-models-io-ex e base-url)))
       (catch Exception e
         (adapter/rethrow! provider e))))))

;;; --------------------------------------------------- Requests -------------------------------------------------

(mu/defn litellm-request-body
  "Build the Chat Completions request body for an LLM request.

  Matches what [[chat-completions/request-body]] emits, except that no `temperature` is sent. The proxy routes
  to whichever upstream the model alias names, and some upstreams reject an explicit temperature, so the
  upstream's own default rules. A `max_tokens` is sent only when the caller names one: a model alias can sit on
  an upstream whose output limit is below the chat cap."
  [opts :- core/LLMRequestOpts]
  (chat-completions/request-body (dissoc opts :temperature)))

(mu/defn litellm-raw
  "Perform a streaming request to a LiteLLM proxy's Chat Completions API.
  Opts map takes `:credentials` (`{:base-url ... :api-key ...}`) from the connection serving this request,
  and throws without a base URL. A blank `:model` throws too, since the proxy has no default model.
  `:ai-proxy?` is not supported for LiteLLM and throws when true."
  [{:keys [model] :as opts} :- core/LLMRequestOpts]
  (when (str/blank? model)
    (throw (missing-model-ex)))
  (adapter/stream! provider opts
                   {:path "/chat/completions"
                    :body (litellm-request-body opts)}))

(defn litellm->aisdk-chunks-xf
  "Translates LiteLLM Chat Completions streaming chunks into AI SDK v5 protocol chunks.

  The proxy normalizes every upstream's stream to the Chat Completions dialect, `finish_reason` values
  included, so the base stop-reason table applies. An upstream that reasons surfaces it as
  `delta.reasoning_content`, which is forwarded as reasoning chunks. The branch is self-gating — the field is
  present only when the served model reasons — so nothing here needs to know which model is behind the alias."
  []
  (chat-completions/chat-completions->aisdk-chunks-xf chat-completions/stop-reasons
                                                      {:forward-reasoning? true}))

(defn litellm
  "Call a LiteLLM proxy's Chat Completions API, return AISDK stream."
  [& args]
  (let [raw (apply litellm-raw args)]
    (eduction (litellm->aisdk-chunks-xf) raw)))
