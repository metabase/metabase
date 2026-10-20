(ns metabase.metabot.self.litellm
  "LiteLLM Proxy / Chat Completions adapter, for a self-hosted LiteLLM gateway.

  The base URL is necessary. The API key is optional, because a proxy that starts without a master key does
  not need one. There is no model allow-list. The proxy serves the model aliases that its operator sets, so
  the picker shows the `/models` catalog of the proxy as it is. The proxy serves the Chat Completions API at
  the root and at `/v1`, so the base URL can have a `/v1` suffix or not.

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
  "The `:auth` for LiteLLM. A proxy needs a base URL, but not a key. A proxy without a master key is a
  complete configuration. Thus the map is never nil, and [[core/resolve-auth]] cannot get to its
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
  "The descriptor for LiteLLM. It has no `:supports-ai-proxy?`, so [[adapter/request!]] refuses a proxied
  request. The Metabase AI proxy is for hosted providers. Metabase connects to a LiteLLM proxy directly, at
  the address that the admin sets."
  (adapter/provider
   {:slug         "litellm"
    :display-name "LiteLLM"
    :auth         litellm-auth
    :errors       {400 #(tru "LiteLLM rejected the request. Usually the proxy does not know the model name, or the model cannot make the requested tool call or JSON schema")
                   401 #(tru "LiteLLM API key expired or invalid. Check the virtual key or the master key of your proxy")
                   404 #(tru "LiteLLM API endpoint was not found. Check the base URL")
                   429 #(tru "LiteLLM is rate limiting this request. A budget or rate limit on the key, or on the upstream model, can apply")
                   500 #(tru "LiteLLM returned an internal server error")}}))

;;; ------------------------------------------------ Model listing -----------------------------------------------

(defn- list-models-io-ex
  "The LiteLLM error for a transport failure when Metabase gets the model catalog. The admin Connect button
  sends this request. The error has `:status-code 400`, so an incorrect base URL shows this message. Without
  the tag, the no-response branch of `core/rethrow-api-error!` gives a 500."
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
  "List the models that the LiteLLM proxy of the connection serves. The names are the aliases in the proxy
  configuration, so there is no whitelist. The `display_name` is the served id.

  The catalog request is also the credential check for the admin Connect button. If a 2xx body is not a
  catalog, [[chat-completions/models-catalog]] fails closed and names the base URL. The admin types that
  address, so it is the most probable cause.

  The connect and edit paths set `:probe?`. Then the result has `:connection-info` `:probed-model`, the model
  that a new connection starts on. vLLM and Ollama do the same. The order is:

  1. The requested model.
  2. The `:proposed-model`, if the proxy still serves it.
  3. The first model in the catalog.

  No generation request is sent. The catalog request already checks the credentials, and Metabase cannot
  check each upstream behind the proxy.

  LiteLLM does not support `:ai-proxy?`. A true value throws."
  ([] (list-models {}))
  ([{:keys [credentials ai-proxy? model proposed-model probe?]} :- adapter/ListOpts]
   ;; Use the URL from the request credentials, not from the setting. A connect checks them before it saves them.
   (let [base-url (:base-url credentials)
         detail   (tru "Check that {0} is a LiteLLM proxy''s OpenAI-compatible API." (str base-url))]
     (try
       (let [res    (adapter/request! provider {:credentials credentials
                                                :ai-proxy?   ai-proxy?
                                                :method      :get
                                                :path        "/models"
                                                :as          :json})
             models (into []
                          (comp (map :id)
                                (filter string?)
                                (map (fn [id] {:id id :display_name id})))
                          (chat-completions/models-catalog "LiteLLM" res {:detail detail}))
             served (into #{} (map :id) models)
             probed (when probe?
                      (or (not-empty model)
                          (served proposed-model)
                          (:id (first models))))]
         (cond-> {:models models}
           probed (assoc :connection-info {:probed-model probed})))
       ;; This catch must come before the `IOException` catch, because a Jackson parse error is an
       ;; `IOException`. A 2xx body that is not JSON shows that the server answered. Thus the address is
       ;; incorrect, but the server is not unreachable.
       (catch JsonProcessingException e
         (throw (chat-completions/malformed-catalog-ex "LiteLLM" detail e)))
       ;; This catch must come before the generic catch. A non-2xx response gets to the generic catch as an
       ;; `ExceptionInfo`.
       (catch IOException e
         (throw (list-models-io-ex e base-url)))
       (catch Exception e
         (adapter/rethrow! provider e))))))

;;; --------------------------------------------------- Requests -------------------------------------------------

(defn- thinking-message
  "Make the assistant message that replays one coalesced in-turn :reasoning part. Return nil to drop the part.

  When extended thinking is on, an Anthropic model rejects a tool result if the assistant turn does not have
  its thinking block. LiteLLM sends that block as `thinking_blocks` on the assistant message
  (https://docs.litellm.ai/docs/reasoning_content#tool-calling-with-thinking).

  This function replays only a signed block. Anthropic verifies the signature. Reasoning from other upstreams
  has no signature, so it is dropped, as in the generic dialect. [[chat-completions/parts->cc-messages]] merges
  the message into the assistant message of the same round."
  [{:keys [text provider-metadata]}]
  (when-let [signature (get-in provider-metadata [:anthropic :signature])]
    {:role            "assistant"
     :content         ""
     :thinking_blocks [{:type "thinking" :thinking (or text "") :signature signature}]}))

(mu/defn litellm-request-body
  "Build the Chat Completions request body for an LLM request.

  The body is the same as the body from [[chat-completions/request-body]], with these differences:

  - The body has no `temperature`. The proxy sends the request to the upstream that the model alias names.
    Some upstreams reject an explicit temperature, so the default of the upstream applies.
  - Signed thinking blocks go back with their assistant message (see [[thinking-message]]). When `:reasoning?`
    is false, the hook is nil, and the body has no :reasoning parts. This agrees with `LLMRequestOpts`.

  The body has a `max_tokens` only when the caller gives one. A model alias can be on an upstream whose output
  limit is less than the chat cap."
  [{:keys [reasoning?] :or {reasoning? true} :as opts} :- core/LLMRequestOpts]
  (chat-completions/request-body (dissoc opts :temperature)
                                 (when reasoning? {:reasoning-part->message thinking-message})))

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

(defn- lift-thinking-signature
  "Copy the signature of an Anthropic thinking block from `delta.thinking_blocks` to `:reasoning_metadata`,
  with the `:anthropic` namespace. The shared xf puts it in the provider metadata of the reasoning part.
  [[thinking-message]] reads it there for the replay. LiteLLM usually streams the signature in a separate delta
  at the end of the block. A delta without a signature does not change."
  [event]
  (if-let [signature (some #(not-empty (:signature %))
                           (get-in event [:choices 0 :delta :thinking_blocks]))]
    (assoc-in event [:choices 0 :delta :reasoning_metadata] {:anthropic {:signature signature}})
    event))

(defn litellm->aisdk-chunks-xf
  "Translates LiteLLM Chat Completions streaming chunks into AI SDK v5 protocol chunks.

  The proxy changes the stream of each upstream to the Chat Completions dialect, with the `finish_reason`
  values. Thus the base stop-reason table applies. An upstream that reasons sends its reasoning in
  `delta.reasoning_content`, and this xf sends it on as reasoning chunks. The field is there only when the
  served model reasons. Thus this xf does not need to know the model behind the alias. The xf keeps the
  thinking signature of an Anthropic upstream for the replay (see [[lift-thinking-signature]])."
  []
  (comp (map lift-thinking-signature)
        (chat-completions/chat-completions->aisdk-chunks-xf chat-completions/stop-reasons
                                                            {:forward-reasoning? true})))

(defn litellm
  "Call a LiteLLM proxy's Chat Completions API, return AISDK stream."
  [& args]
  (let [raw (apply litellm-raw args)]
    (eduction (litellm->aisdk-chunks-xf) raw)))
