(ns metabase.metabot.self.vllm
  "vLLM / Chat Completions adapter for self-hosted, OpenAI-compatible inference servers.

  The base URL is required and the API key is optional, and there is no model whitelist — the
  operator serves whatever they loaded, so [[preflight!]] exercises the agent-loop contract at
  configuration time instead.

  https://docs.vllm.ai/en/latest/serving/openai_compatible_server.html"
  (:require
   [clojure.string :as str]
   [metabase.llm.settings :as llm]
   [metabase.metabot.self.core :as core]
   [metabase.metabot.self.debug :as debug]
   [metabase.metabot.self.openai.chat-completions :as chat-completions]
   [metabase.settings.core :as setting]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.o11y :refer [with-span]])
  (:import
   (java.io IOException)
   (java.net SocketTimeoutException)
   (java.util.concurrent ExecutionException)))

(set! *warn-on-reflection* true)

(def ^:private min-context-length
  "Smallest `max_model_len` [[preflight!]] will accept. A product floor, not a measurement."
  16384)

(defn- ai-proxy-unsupported-ex []
  (ex-info (tru "AI proxy is not supported for vLLM")
           {:api-error  true
            :error-code :proxy-unsupported}))

(defn- missing-base-url-ex []
  (ex-info (tru "No vLLM base URL is set")
           {:api-error  true
            :error-code :base-url-missing}))

(defn- missing-model-ex []
  (ex-info (tru "No vLLM model is set")
           {:api-error  true
            :error-code :model-missing}))

(defn- vllm-error-msg
  "Canonical, status-specific vLLM error message."
  [res]
  (let [status (long (:status res 0))]
    (case status
      400 (tru "vLLM rejected the request — usually an unsupported schema, or a model that cannot compile the tool grammar")
      401 (tru "vLLM API key expired or invalid — check the key your server was started with via --api-key")
      404 (tru "vLLM API endpoint was not found — the base URL should end in /v1")
      429 (tru "The vLLM server''s request queue is full — reduce concurrent load, or restart it with a larger --max-num-seqs")
      500 (tru "vLLM returned an internal server error")
      (tru "vLLM API error (HTTP {0})" status))))

(defn- vllm-auth
  "Auth map for a vLLM request. The map is never nil, so `core/resolve-auth` cannot reach its
  `missing-api-key-ex` branch — a keyless server is a complete configuration."
  [credentials ai-proxy?]
  (when ai-proxy?
    (throw (ai-proxy-unsupported-ex)))
  (let [base-url (or (not-empty (:base-url credentials))
                     (not-empty (llm/llm-vllm-api-base-url)))
        api-key  (or (not-empty (:api-key credentials))
                     (not-empty (llm/llm-vllm-api-key)))]
    (when-not base-url
      (throw (missing-base-url-ex)))
    (core/resolve-auth "vllm" "vLLM"
                       (cond-> {:url base-url}
                         api-key (assoc :headers {"Authorization" (str "Bearer " api-key)}))
                       ai-proxy?)))

(defn- inference-timeouts
  "Timeouts for a generation request."
  []
  {:socket-timeout     (llm/llm-vllm-request-timeout-ms)
   :connection-timeout (llm/llm-connection-timeout-ms)})

(defn- control-timeouts
  "Timeouts for the non-generating `/models` call, on the shared (much shorter) request budget."
  []
  {:socket-timeout     (llm/llm-request-timeout-ms)
   :connection-timeout (llm/llm-connection-timeout-ms)})

(def ^:private probe-timeout-ceiling-ms
  "Upper bound on a single preflight probe, which blocks the admin behind a spinner."
  120000)

(defn- probe-timeouts
  "Timeouts for a preflight probe. An operator who lowers `llm-vllm-request-timeout-ms` below the
  ceiling gets their own value."
  []
  {:socket-timeout     (min (llm/llm-vllm-request-timeout-ms) probe-timeout-ceiling-ms)
   :connection-timeout (llm/llm-connection-timeout-ms)})

;;; ------------------------------------------------ Model listing -----------------------------------------------

(defn- list-all-models
  "Fetch the served model catalog, which doubles as the credential round-trip behind the admin
  Connect button."
  [auth]
  (try
    (let [res (core/request auth (merge {:method  :get
                                         :url     "/models"
                                         :as      :json
                                         :headers {"Content-Type" "application/json"}}
                                        (control-timeouts)))]
      (get-in res [:body :data]))
    (catch Exception e
      (core/rethrow-api-error! "vllm" vllm-error-msg e))))

;;; -------------------------------------------------- Preflight -------------------------------------------------

(def ^:private probe-tool
  {:type     "function"
   :function {:name        "record_table_name"
              :description "Record the name of the table the user mentioned."
              :parameters  {:type                 "object"
                            :properties           {:table_name {:type        "string"
                                                                :description "The table name the user mentioned."}}
                            :required             ["table_name"]
                            :additionalProperties false}}})

(def ^:private probe-messages
  [{:role "user" :content "Record the table name: orders"}])

(def ^:private probe-max-tokens
  "Generation ceiling for a preflight probe. High enough to clear a reasoning model's thinking, which
  is billed against it: a probe that stops at `length` before the tool call looks identical to a
  server that will not call tools at all."
  2048)

(def ^:private forced-tool-call-token-floor
  "Smallest `max_tokens` a forced tool call is given, regardless of what the caller asked for — below
  it a reasoning model spends the budget thinking and emits no tool call. Equal to
  [[probe-max-tokens]], which [[preflight!]] already proves the served model can clear."
  probe-max-tokens)

(def ^:private reasoning-model-token-floor
  "Smallest `max_tokens` any request gets once [[preflight!]] has observed the served model reasoning.
  Chat Completions bills thinking, answer, and tool call against one budget. Mirrors
  `claude-request-body`."
  16384)

(def ^:private default-temperature
  "Sampling temperature for a caller that supplies none. vLLM's own default is 1.0, which is wrong for
  the tool-calling and SQL-generation work the agent loop does. The hosted providers pick a sane
  default server-side; a self-hosted server does not, so the adapter supplies one."
  0.3)

(defn- preflight-ex
  "A preflight failure, tagged so `metabase.metabot.api` surfaces the message verbatim, not as a 500."
  [msg]
  (ex-info msg {:api-error   true
                :status-code 400
                :error-code  :vllm-preflight-failed}))

(defn- probe-chat!
  "Run one non-streaming Chat Completions turn against `model` and return the first choice. The
  `finish_reason` is part of the return value because a generation truncated at
  [[probe-max-tokens]] and a server that will not call tools both produce empty `tool_calls`."
  [auth model tool-choice]
  (let [res (core/request auth (merge {:method  :post
                                       :url     "/chat/completions"
                                       :as      :json
                                       :headers {"Content-Type" "application/json"}
                                       :body    (json/encode {:model       model
                                                              :messages    probe-messages
                                                              :tools       [probe-tool]
                                                              :tool_choice tool-choice
                                                              :temperature 0
                                                              :max_tokens  probe-max-tokens})}
                                      (probe-timeouts)))]
    (get-in res [:body :choices 0])))

(defn- check-context-budget!
  [{:keys [id max_model_len]}]
  (when (and max_model_len (< (long max_model_len) min-context-length))
    (throw (preflight-ex
            (tru "{0} is served with a {1} token context window, which is too small for Metabot — it needs at least {2}. Restart vLLM with a larger --max-model-len."
                 (str id) (str max_model_len) (str min-context-length))))))

(defn- check-tool-calling!
  "Check that the server was started with `--enable-auto-tool-choice` and a `--tool-call-parser` whose
  sentinels match this model. A wrong-but-valid parser name errors at no layer — the call stays in
  `content` as prose and Metabot chats without ever acting.

  Returns whether the model emitted reasoning, the only signal anywhere that it is a reasoning model."
  [auth model]
  (let [{:keys [message finish_reason]} (probe-chat! auth model "auto")
        content    (str (:content message))
        ;; `reasoning` since vLLM 0.26; `reasoning_content` is the deprecated spelling older builds
        ;; and other OpenAI-compatible servers still use.
        reasoning  (str (or (:reasoning message) (:reasoning_content message)))
        tool-calls (:tool_calls message)
        truncated? (= "length" finish_reason)]
    (cond
      (str/includes? content "<think>")
      (throw (preflight-ex
              (tru "{0} streamed its reasoning as chat text. Restart vLLM with --reasoning-parser so thinking doesn''t appear inside Metabot''s answers."
                   (str model))))

      (seq tool-calls)
      (let [arguments (get-in (first tool-calls) [:function :arguments])]
        (when-not (try
                    (map? (json/decode+kw (str arguments)))
                    (catch Exception _ false))
          (throw (preflight-ex
                  (if truncated?
                    (tru "{0} reached the {1} token connection-test ceiling partway through a tool call. A model that generates this much before calling a tool is too slow to drive Metabot."
                         (str model) (str probe-max-tokens))
                    (tru "The vLLM server returned a tool call whose arguments are not valid JSON. The --tool-call-parser most likely does not match {0}''s output format."
                         (str model))))))
        (not (str/blank? reasoning)))

      (and truncated? (not (str/blank? reasoning)))
      (throw (preflight-ex
              (tru "{0} spent the entire {1} token connection-test budget reasoning without calling a tool. A model that thinks this long about a trivial prompt is too slow to drive Metabot."
                   (str model) (str probe-max-tokens))))

      :else
      (throw (preflight-ex
              (tru "The vLLM server answered with text instead of calling a tool. Restart it with --enable-auto-tool-choice and a --tool-call-parser matching {0}''s output format."
                   (str model)))))))

(defn- check-structured-output!
  "Check that guided decoding works. A different failure from [[check-tool-calling!]]: a model whose
  grammar the server cannot compile chats fine but breaks titling and the whole `sql` profile."
  [auth model]
  (let [{:keys [message finish_reason]} (probe-chat! auth model "required")]
    (when (empty? (:tool_calls message))
      (throw (preflight-ex
              (if (= "length" finish_reason)
                (tru "{0} reached the {1} token connection-test ceiling without producing a forced tool call. Metabot needs structured output support for conversation titles and SQL generation."
                     (str model) (str probe-max-tokens))
                (tru "The vLLM server did not honor a forced tool call. Metabot needs structured output support for conversation titles and SQL generation.")))))))

(defn- no-models-ex []
  (preflight-ex (tru "The vLLM server is reachable but is not serving any models.")))

(defn- connect-candidates
  "Catalog entries eligible to be adopted when the connect path picks a model for the admin.

  Skips LoRA adapters, whose `parent` names the base model they adapt. Nothing in the catalog
  distinguishes an embedding or reranker deployment, so a multi-model server can still be adopted
  from wrongly — the admin re-picks from the dropdown."
  [entries]
  (or (seq (remove :parent entries)) entries))

(defn- probe-target
  "The catalog entry [[preflight!]] will probe.

  A requested model is the only acceptable target: falling back to another served model would pass
  every check and then persist a provider string naming a model the server does not have. The
  fallback is for the connect path, which supplies no model because the served name is knowable
  only from this catalog."
  [entries requested-model]
  (if requested-model
    (or (u/seek #(= requested-model (:id %)) entries)
        (throw (if (seq entries)
                 (preflight-ex (tru "The vLLM server is not serving {0}. It is serving: {1}."
                                    (str requested-model) (str/join ", " (map :id entries))))
                 (no-models-ex))))
    (or (first (connect-candidates entries))
        (throw (no-models-ex)))))

(defn- await-probe!
  "Deref a probe future, unwrapping the `ExecutionException` so the preflight's own `ex-info` reaches
  the caller with its `:api-error` tag intact."
  [fut]
  (try
    @fut
    (catch ExecutionException e
      (throw (or (ex-cause e) e)))))

(defn- preflight!
  "Exercise the contract the agent loop depends on, against the model that will actually be used, and
  return that model's id. The connect path must adopt exactly this value rather than re-deriving it
  from the listing, which agrees only while `decorate-provider-models` leaves vLLM's order alone.

  The probes run concurrently; deref order fixes the verdict, tool calling being the more actionable
  diagnosis when a server fails both. The loser is cancelled rather than left generating against the
  operator's server long after anyone is listening.

  On success, records whether the probed model reasons in `llm-vllm-model-reasoning?` — only the
  probe can answer that, and the answer drives which renderer the frontend picks."
  [auth entries requested-model]
  (let [entry (probe-target entries requested-model)
        model (:id entry)]
    (check-context-budget! entry)
    (try
      (let [tool-calling (future (check-tool-calling! auth model))
            structured   (future (check-structured-output! auth model))]
        (try
          (let [reasoning? (await-probe! tool-calling)]
            (await-probe! structured)
            (setting/set! :llm-vllm-model-reasoning? (boolean reasoning?)))
          (finally
            (future-cancel tool-calling)
            (future-cancel structured))))
      (catch SocketTimeoutException _
        (throw (preflight-ex
                (tru "The vLLM server did not answer the connection test within {0}ms. Check that it is not overloaded — a server this slow to answer a trivial prompt cannot drive Metabot."
                     (str (:socket-timeout (probe-timeouts)))))))
      (catch Exception e
        (core/rethrow-api-error! "vllm" vllm-error-msg e)))
    model))

(defn list-models
  "List the models the configured vLLM server is serving. Pass-through: there is nothing to
  whitelist, and `display_name` falls back to the served id.

  `:probe?` additionally runs [[preflight!]] and returns the model it probed as `:probed-model`, for
  the connect path to adopt. Reserved for the `PUT` settings path — a tool-call probe on every `GET`
  would stall the admin model dropdown behind a full prefill."
  ([] (list-models {}))
  ([{:keys [credentials ai-proxy? model probe?]}]
   (let [auth         (vllm-auth credentials ai-proxy?)
         entries      (list-all-models auth)
         probed-model (when probe?
                        (preflight! auth entries model))]
     (cond-> {:models (mapv (fn [{:keys [id] :as entry}]
                              {:id id :display_name (or (:name entry) id)})
                            entries)}
       probed-model (assoc :probed-model probed-model)))))

;;; --------------------------------------------------- Requests -------------------------------------------------

(mu/defn vllm-request-body
  "Build the Chat Completions request body for an LLM request.

  Matches what [[chat-completions/request-body]] emits, except that `max_tokens` is always sent —
  without a ceiling vLLM falls back to the remaining context window, so one looping small model
  consumes the whole budget in a single call — and is raised to
  [[forced-tool-call-token-floor]] or [[reasoning-model-token-floor]] where either applies, and
  `temperature` falls back to [[default-temperature]]. All three stay adapter-local rather than
  moving into the shared builder, which would also change Z.AI, Mistral, and OpenRouter."
  [{:keys [max-tokens temperature schema tool_choice] :as opts} :- core/LLMRequestOpts]
  (let [forced? (or (some? schema) (= "required" (some-> tool_choice name)))]
    (assoc (chat-completions/request-body (cond-> opts
                                            (nil? temperature) (assoc :temperature default-temperature)))
           :max_tokens (cond-> (or max-tokens (llm/llm-max-tokens))
                         forced?                         (max forced-tool-call-token-floor)
                         (llm/llm-vllm-model-reasoning?) (max reasoning-model-token-floor)))))

(defn- stream-io-ex
  "The vLLM error for a transport failure while *consuming* a response stream. Carries no `:status`,
  which is what makes it non-retryable: on a self-hosted server a stalled or severed response means
  \"too slow\" or \"it died\", not \"transient\", and a retry replays a full cold prefill."
  [^IOException e timeout-ms]
  (if (instance? SocketTimeoutException e)
    (ex-info (tru "The vLLM server stopped responding after {0}ms. Raise the vLLM request timeout, or serve a faster model."
                  (str timeout-ms))
             {:api-error  true
              :error-code :vllm-timeout}
             e)
    (ex-info (tru "The connection to the vLLM server was interrupted before the response finished.")
             {:api-error  true
              :error-code :vllm-stream-interrupted}
             e)))

(defn- request-io-ex
  "The vLLM error for a transport failure while *establishing* a request. `core/rethrow-api-error!`
  would render these as \"vllm API request failed: Read timed out\", naming neither the server's
  slowness nor the setting that governs it."
  [^IOException e base-url timeout-ms]
  (if (instance? SocketTimeoutException e)
    (ex-info (tru "The vLLM server did not respond within {0}ms. Check that it is not overloaded, or raise the vLLM request timeout."
                  (str timeout-ms))
             {:api-error  true
              :error-code :vllm-timeout}
             e)
    (ex-info (tru "Could not reach the vLLM server at {0}. Check that it is running and that the base URL is correct."
                  (str base-url))
             {:api-error  true
              :error-code :vllm-unreachable}
             e)))

(defn- io-guarded
  "Wrap a stream reducible so a transport failure while consuming it surfaces as [[stream-io-ex]]
  rather than a raw `IOException`. The adapter's own `try` covers only establishing the request."
  [reducible timeout-ms]
  (reify clojure.lang.IReduceInit
    (reduce [_ rf init]
      (try
        (.reduce ^clojure.lang.IReduceInit reducible rf init)
        (catch IOException e
          (throw (stream-io-ex e timeout-ms)))))))

(mu/defn vllm-raw
  "Perform a streaming request to a vLLM server's Chat Completions API.
  `:ai-proxy?` is not supported for vLLM and throws when true."
  [{:keys [model tools ai-proxy?] :as opts} :- core/LLMRequestOpts]
  (when ai-proxy?
    (throw (ai-proxy-unsupported-ex)))
  (when (str/blank? model)
    (throw (missing-model-ex)))
  (let [req        (vllm-request-body opts)
        timeout-ms (llm/llm-vllm-request-timeout-ms)]
    (log/debug "vLLM request" {:model model :msg-count (count (:messages req)) :tools (count (or tools []))})
    (with-span :info {:name       :metabot.vllm/request
                      :model      model
                      :msg-count  (count (:messages req))
                      :tool-count (count (or tools []))}
      (try
        (let [auth     (vllm-auth nil ai-proxy?)
              response (core/request auth
                                     (merge {:method  :post
                                             :url     "/chat/completions"
                                             :as      :stream
                                             :headers {"Content-Type" "application/json"}
                                             :body    (json/encode req)}
                                            (inference-timeouts)))]
          (-> (core/sse-reducible (:body response))
              (debug/capture-stream {:provider "vllm"
                                     :model    model
                                     :url      "/chat/completions"
                                     :request  req})
              (io-guarded timeout-ms)))
        ;; Ordered: clj-http raises an `IOException` only when there is no response at all, so this
        ;; cannot swallow one `vllm-error-msg` would have translated.
        (catch IOException e
          (throw (request-io-ex e (llm/llm-vllm-api-base-url) timeout-ms)))
        (catch Exception e
          (core/rethrow-api-error! "vllm" vllm-error-msg e))))))

(defn vllm->aisdk-chunks-xf
  "Translates vLLM Chat Completions streaming chunks into AI SDK v5 protocol chunks.

  A model started with `--reasoning-parser` routes thinking to `delta.reasoning` and its answer back
  to `delta.content`; both are forwarded. The branch is self-gating — the field is present only when
  the served model reasons — so nothing here needs to know which model is loaded.

  vLLM adds no `finish_reason` beyond OpenAI's, so it takes the base stop-reason table."
  []
  (chat-completions/chat-completions->aisdk-chunks-xf chat-completions/stop-reasons
                                                      {:forward-reasoning? true}))

(defn vllm
  "Call a vLLM server's Chat Completions API, return AISDK stream."
  [& args]
  (let [raw (apply vllm-raw args)]
    (eduction (vllm->aisdk-chunks-xf) raw)))
