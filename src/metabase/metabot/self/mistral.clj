(ns metabase.metabot.self.mistral
  "Mistral / Chat Completions adapter.

  Mistral exposes an OpenAI-compatible Chat Completions API.

  https://docs.mistral.ai/api/"
  (:require
   [metabase.llm.settings :as llm]
   [metabase.metabot.self.core :as core]
   [metabase.metabot.self.debug :as debug]
   [metabase.metabot.self.openai.chat-completions :as chat-completions]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.o11y :refer [with-span]]))

(set! *warn-on-reflection* true)

(def ^:private default-model "mistral-medium-3-5")

(defn- ai-proxy-unsupported-ex []
  (ex-info (tru "AI proxy is not supported for Mistral")
           {:api-error  true
            :error-code :proxy-unsupported}))

(defn- mistral-error-msg
  "Canonical, status-specific Mistral error message."
  [res]
  (let [status (long (:status res 0))]
    (case status
      401 (tru "Mistral API key expired or invalid")
      404 (tru "Mistral API endpoint was not found — check the base URL")
      429 (tru "Mistral has rate limited us")
      500 (tru "Mistral returned an internal server error")
      (tru "Mistral API error (HTTP {0})" status))))

(def ^:private supported-models
  "Mistral models offered in the Metabot model picker, as a map of model id -> display name.
  `list-models` returns the intersection of this map with the `/models` catalog."
  {"mistral-medium-3-5" "Mistral Medium 3.5"})

(defn- whitelisted-id
  "The [[supported-models]] id a `/models` catalog entry resolves to, or nil when unsupported.
  Mistral models have a generic `:id` like `mistral-medium-latest` but `:aliases` contains version specific aliases
  like `mistral-medium-3-5` or `mistral-medium-2604`, so a whitelisted id is matched against the entry's own id and
  its aliases."
  [{:keys [id aliases]}]
  (some #(when (contains? supported-models %) %)
        (cons id aliases)))

(defn- list-all-models
  "Fetch the full Mistral model catalog (`GET /models`).
  `:ai-proxy?` is not supported for Mistral and throws when true."
  [{:keys [credentials ai-proxy?]}]
  (when ai-proxy?
    (throw (ai-proxy-unsupported-ex)))
  (try
    (let [auth (core/resolve-auth "mistral" "Mistral"
                                  (when-let [k (or (not-empty (:api-key credentials))
                                                   (not-empty (llm/llm-mistral-api-key)))]
                                    {:url     (llm/llm-mistral-api-base-url)
                                     :headers {"Authorization" (str "Bearer " k)}})
                                  ai-proxy?)
          res  (core/request auth {:method  :get
                                   :url     "/models"
                                   :as      :json
                                   :headers {"Content-Type" "application/json"}})]
      (get-in res [:body :data]))
    (catch Exception e
      (core/rethrow-api-error! "mistral" mistral-error-msg e))))

(defn list-models
  "List the Mistral models supported by this adapter (see [[supported-models]]).
  `:ai-proxy?` is not supported for Mistral and throws when true."
  ([] (list-models {}))
  ([opts]
   {:models (->> (list-all-models opts)
                 (keep whitelisted-id)
                 distinct
                 sort
                 (mapv (fn [id]
                         {:id id :display_name (supported-models id)})))}))

(mu/defn mistral-request-body
  "Build the Chat Completions request body for an LLM request.

  Mistral's Chat Completions dialect matches what [[chat-completions/request-body]] emits, except:

  - Mistral's strict request validation 422s (`Extra inputs are not permitted`) on `stream_options`; it is dropped
    here, and Mistral reports usage on the final streamed chunk without it.
  - Prompt caching is opt-in per request via `prompt_cache_key` (cache reads bill at 10% of the input price), so a
    `:prompt-cache-key` — the conversation id — is forwarded when present."
  [{:keys [model prompt-cache-key] :as opts
    :or   {model default-model}} :- core/LLMRequestOpts]
  (-> (chat-completions/request-body (assoc opts :model model))
      (dissoc :stream_options)
      (cond-> prompt-cache-key (assoc :prompt_cache_key prompt-cache-key))))

(mu/defn mistral-raw
  "Perform a streaming request to the Mistral Chat Completions API.
  `:ai-proxy?` is not supported for Mistral and throws when true."
  [{:keys [model tools ai-proxy?] :as opts
    :or   {model default-model}} :- core/LLMRequestOpts]
  (when ai-proxy?
    (throw (ai-proxy-unsupported-ex)))
  (let [req (mistral-request-body (assoc opts :model model))]
    (log/debug "Mistral request" {:model model :msg-count (count (:messages req)) :tools (count (or tools []))})
    (with-span :info {:name       :metabot.mistral/request
                      :model      model
                      :msg-count  (count (:messages req))
                      :tool-count (count (or tools []))}
      (try
        (let [api-key  (not-empty (llm/llm-mistral-api-key))
              auth     (core/resolve-auth "mistral" "Mistral"
                                          (when api-key
                                            {:url     (llm/llm-mistral-api-base-url)
                                             :headers {"Authorization" (str "Bearer " api-key)}})
                                          ai-proxy?)
              response (core/request auth
                                     {:method  :post
                                      :url     "/chat/completions"
                                      :as      :stream
                                      :headers {"Content-Type" "application/json"}
                                      :body    (json/encode req)})]
          (-> (core/sse-reducible (:body response))
              (debug/capture-stream {:provider "mistral"
                                     :model    model
                                     :url      "/chat/completions"
                                     :request  req})))
        (catch Exception e
          (core/rethrow-api-error! "mistral" mistral-error-msg e))))))

(defn mistral->aisdk-chunks-xf
  "Translates Mistral Chat Completions streaming chunks into AI SDK v5 protocol chunks."
  []
  (chat-completions/chat-completions->aisdk-chunks-xf))

(defn mistral
  "Call the Mistral Chat Completions API, return AISDK stream."
  [& args]
  (let [raw (apply mistral-raw args)]
    (eduction (mistral->aisdk-chunks-xf) raw)))
