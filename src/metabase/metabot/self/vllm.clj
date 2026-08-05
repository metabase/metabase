(ns metabase.metabot.self.vllm
  "vLLM / Chat Completions adapter for self-hosted, OpenAI-compatible inference servers.

  Unlike the other adapters here the base URL is required and the API key is optional, and there is
  no model whitelist — the operator serves whatever they loaded. [[preflight!]] exercises the
  agent-loop contract at configuration time.

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
      429 (tru "vLLM has rate limited us")
      500 (tru "vLLM returned an internal server error")
      (tru "vLLM API error (HTTP {0})" status))))

(defn- vllm-auth
  "Auth map for a vLLM request. The base URL is required; the `Authorization` header is added only
  when a key is configured. The map is never nil, so `core/resolve-auth` cannot reach its
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
  "Timeouts for a preflight probe — between [[control-timeouts]] and [[inference-timeouts]]. An
  operator who lowers `llm-vllm-request-timeout-ms` below the ceiling gets their own value."
  []
  {:socket-timeout     (min (llm/llm-vllm-request-timeout-ms) probe-timeout-ceiling-ms)
   :connection-timeout (llm/llm-connection-timeout-ms)})

;;; ------------------------------------------------ Model listing -----------------------------------------------

(defn- list-all-models
  "Fetch the served model catalog (`GET /models`), which doubles as the credential round-trip behind
  the admin Connect button. `:ai-proxy?` is not supported for vLLM and throws when true."
  [{:keys [credentials ai-proxy?]}]
  (try
    (let [auth (vllm-auth credentials ai-proxy?)
          res  (core/request auth (merge {:method  :get
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
  "Generation ceiling for a preflight probe. A reasoning model's thinking counts against this budget
  and routinely runs several hundred tokens even on a trivial prompt, so the ceiling has to clear
  it: a probe that stops at `length` before the tool call looks identical to a server that will not
  call tools at all."
  2048)

(def ^:private forced-tool-call-token-floor
  "Smallest `max_tokens` a forced tool call is given, regardless of what the caller asked for. A
  reasoning model bills its thinking against this budget *before* emitting the tool call, so a
  smaller ceiling (conversation titling asks for 128) stops at `length` with no tool call at all.
  Equal to [[probe-max-tokens]], which [[preflight!]] already proves the served model can clear."
  probe-max-tokens)

(defn- preflight-ex
  "A preflight failure, tagged so `metabase.metabot.api`'s `provider-client-error?` surfaces the
  message to the admin verbatim rather than as a 500."
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
  "With `tool_choice \"auto\"` a tool call comes back only when the server was started with
  `--enable-auto-tool-choice` and a `--tool-call-parser` whose sentinel tokens match what this model
  emits. A wrong-but-valid parser name produces no error at any layer — the call stays in `content`
  as prose and Metabot chats without ever acting.

  Returns whether the model emitted reasoning, which is the only signal available anywhere that it
  is a reasoning model — the `/v1/models` catalog carries none."
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
  "`tool_choice \"required\"` drives guided decoding rather than the tool-call parser, so this covers
  a different failure than [[check-tool-calling!]]: a model whose grammar the server cannot compile
  chats fine but breaks conversation titling and the whole `sql` profile."
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

(defn- probe-target
  "The catalog entry [[preflight!]] will probe.

  A requested model is the only acceptable target: falling back to another served model would pass
  every check and then persist a provider string naming a model the server does not have. The
  fallback applies only to the connect path, which supplies no model because the served name is
  knowable only from this catalog."
  [entries requested-model]
  (if requested-model
    (or (u/seek #(= requested-model (:id %)) entries)
        (throw (if (seq entries)
                 (preflight-ex (tru "The vLLM server is not serving {0}. It is serving: {1}."
                                    (str requested-model) (str/join ", " (map :id entries))))
                 (no-models-ex))))
    (or (first entries)
        (throw (no-models-ex)))))

(defn- await-probe!
  "Deref a probe future, unwrapping the `ExecutionException` so the preflight's own `ex-info` — and
  the `:api-error` tag `core/rethrow-api-error!` passes through untouched — reaches the caller."
  [fut]
  (try
    @fut
    (catch ExecutionException e
      (throw (or (ex-cause e) e)))))

(defn- preflight!
  "Exercise the contract the agent loop depends on, against the model that will actually be used.

  | Misconfiguration                  | What the admin would otherwise see  |
  |-----------------------------------|-------------------------------------|
  | No `--enable-auto-tool-choice`    | Metabot chats but never acts        |
  | Wrong `--tool-call-parser`        | Malformed or absent tool calls      |
  | Reasoning model, no parser        | `<think>` tags in the chat          |
  | Context window too small          | A 400 mid-conversation              |
  | No structured-output support      | Titles and the `sql` profile fail   |

  The probes run concurrently; deref order fixes the verdict, tool calling being the more actionable
  diagnosis when a server fails both.

  On success, records whether the probed model reasons in `llm-vllm-model-reasoning?`. Only the
  probe can answer that — the catalog has no such field — and the answer drives which chain-of-thought
  renderer the frontend picks, via `metabot.settings/llm-metabot-supports-reasoning?`."
  [{:keys [credentials ai-proxy?]} entries requested-model]
  (let [entry (probe-target entries requested-model)]
    (check-context-budget! entry)
    (try
      (let [auth         (vllm-auth credentials ai-proxy?)
            model        (:id entry)
            tool-calling (future (check-tool-calling! auth model))
            structured   (future (check-structured-output! auth model))
            reasoning?   (await-probe! tool-calling)]
        (await-probe! structured)
        (setting/set! :llm-vllm-model-reasoning? (boolean reasoning?)))
      (catch SocketTimeoutException _
        (throw (preflight-ex
                (tru "The vLLM server did not answer the connection test within {0}ms. Check that it is not overloaded — a server this slow to answer a trivial prompt cannot drive Metabot."
                     (str (:socket-timeout (probe-timeouts)))))))
      (catch Exception e
        (core/rethrow-api-error! "vllm" vllm-error-msg e)))))

(defn list-models
  "List the models the configured vLLM server is serving.

  Pass-through: there is nothing to whitelist, and `display_name` falls back to the served id. When
  `:probe?` is true, additionally runs [[preflight!]] — reserved for the `PUT` settings path, since
  a tool-call probe on every `GET` would stall the admin model dropdown behind a full prefill.
  `:ai-proxy?` is not supported for vLLM and throws when true."
  ([] (list-models {}))
  ([{:keys [model probe?] :as opts}]
   (let [entries (list-all-models opts)]
     (when probe?
       (preflight! opts entries model))
     {:models (mapv (fn [{:keys [id] :as entry}]
                      {:id id :display_name (or (:name entry) id)})
                    entries)})))

;;; --------------------------------------------------- Requests -------------------------------------------------

(mu/defn vllm-request-body
  "Build the Chat Completions request body for an LLM request.

  Matches what [[chat-completions/request-body]] emits, except that `max_tokens` is always sent and
  is raised to [[forced-tool-call-token-floor]] when the request forces a tool call. Without a
  ceiling vLLM falls back to whatever remains of the context window, so one looping small model can
  consume the entire budget in a single call; with too small a ceiling a reasoning model spends it
  all thinking and never emits the forced call. Both are kept adapter-local rather than pushed into
  the shared builder, which would also change Z.AI, Mistral, and OpenRouter."
  [{:keys [max-tokens schema tool_choice] :as opts} :- core/LLMRequestOpts]
  (let [ceiling (or max-tokens (llm/llm-max-tokens))
        forced? (or (some? schema) (= "required" (some-> tool_choice name)))]
    (assoc (chat-completions/request-body opts)
           :max_tokens (cond-> ceiling
                         forced? (max forced-tool-call-token-floor)))))

(defn- timeout-guarded
  "Wrap a stream reducible so a socket timeout while *consuming* it surfaces as a non-retryable vLLM
  error. The adapter's `try` covers only establishing the request; a raw `SocketTimeoutException`
  escaping the stream satisfies `metabase.metabot.self/retryable-error?` with the retry gate still
  open, so a merely slow server would be asked to replay three full cold prefills."
  [reducible timeout-ms]
  (reify clojure.lang.IReduceInit
    (reduce [_ rf init]
      (try
        (.reduce ^clojure.lang.IReduceInit reducible rf init)
        (catch SocketTimeoutException e
          (throw (ex-info (tru "The vLLM server stopped responding after {0}ms. Raise the vLLM request timeout, or serve a faster model."
                               (str timeout-ms))
                          {:api-error  true
                           :error-code :vllm-timeout}
                          e)))))))

(mu/defn vllm-raw
  "Perform a streaming request to a vLLM server's Chat Completions API.
  `:ai-proxy?` is not supported for vLLM and throws when true."
  [{:keys [model tools ai-proxy?] :as opts} :- core/LLMRequestOpts]
  (when ai-proxy?
    (throw (ai-proxy-unsupported-ex)))
  (when (str/blank? model)
    (throw (missing-model-ex)))
  (let [req         (vllm-request-body opts)
        timeout-ms  (llm/llm-vllm-request-timeout-ms)]
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
              (timeout-guarded timeout-ms)))
        (catch Exception e
          (core/rethrow-api-error! "vllm" vllm-error-msg e))))))

(defn vllm->aisdk-chunks-xf
  "Translates vLLM Chat Completions streaming chunks into AI SDK v5 protocol chunks.

  A model started with `--reasoning-parser` routes thinking to `delta.reasoning` (`reasoning_content`
  before vLLM 0.26) and its answer back to `delta.content`; both are forwarded. Without that flag the
  thinking arrives in `delta.content` as literal `<think>` tags, which is what [[preflight!]] rejects.

  Nothing here needs to know whether the served model reasons: the field is present only when it
  does, so the branch is self-gating. That is unlike Claude and OpenAI, where thinking is requested
  in the request body and so has to be known up front."
  []
  (chat-completions/chat-completions->aisdk-chunks-xf {:forward-reasoning? true}))

(defn vllm
  "Call a vLLM server's Chat Completions API, return AISDK stream."
  [& args]
  (let [raw (apply vllm-raw args)]
    (eduction (vllm->aisdk-chunks-xf) raw)))
