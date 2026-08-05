(ns metabase.metabot.self.vllm
  "vLLM / Chat Completions adapter for self-hosted, OpenAI-compatible inference servers.

  vLLM serves an OpenAI-compatible Chat Completions API from hardware the customer operates, so
  prompt content never leaves their network. Two things make it unlike every other adapter here:

  - **The base URL is required and the API key is optional.** A bare vLLM server has no auth
    unless it was started with `--api-key`, so the auth map is built from the base URL alone and
    the `Authorization` header is omitted when no key is set.
  - **There is no model whitelist.** The operator serves whatever they loaded, so `list-models`
    passes the catalog through instead of intersecting it with a curated set.

  Because nothing about the served model is guaranteed, [[preflight!]] exercises the contract the
  agent loop depends on at configuration time — see the misconfiguration table on that var.

  https://docs.vllm.ai/en/latest/serving/openai_compatible_server.html"
  (:require
   [clojure.string :as str]
   [metabase.llm.settings :as llm]
   [metabase.metabot.self.core :as core]
   [metabase.metabot.self.debug :as debug]
   [metabase.metabot.self.openai.chat-completions :as chat-completions]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.o11y :refer [with-span]])
  (:import
   (java.net SocketTimeoutException)))

(set! *warn-on-reflection* true)

(def ^:private min-context-length
  "Smallest `max_model_len` [[preflight!]] will accept. The `internal` profile's system prompt plus
  tool schemas is a ~9k-token floor before a single conversation turn, so a model served under this
  cannot complete a realistic multi-turn session. A product floor, not a measurement."
  16384)

(defn- ai-proxy-unsupported-ex []
  (ex-info (tru "AI proxy is not supported for vLLM")
           {:api-error  true
            :error-code :proxy-unsupported}))

(defn- missing-base-url-ex []
  ;; Without this an unset base URL reaches `core/request`'s `(update :url #(str url %))` and
  ;; produces the relative URL "/chat/completions" plus a clj-http error naming neither vLLM nor
  ;; the missing setting.
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
  "Auth map for a vLLM request: the base URL is required, the `Authorization` header is added only
  when a key is configured. Because the map is never nil, `core/resolve-auth` cannot reach its
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
  "Timeouts for a generation request. The connection timeout is the valuable half: an unreachable or
  mistyped base URL is a top misconfiguration and should fail fast rather than hang."
  []
  {:socket-timeout     (llm/llm-vllm-request-timeout-ms)
   :connection-timeout (llm/llm-connection-timeout-ms)})

(defn- control-timeouts
  "Timeouts for the non-generating `/models` call. Listing is instant on a healthy server, so this
  uses the shared (much shorter) request timeout rather than the generous inference one — an admin
  waiting on the Connect button shouldn't sit through the prefill budget."
  []
  {:socket-timeout     (llm/llm-request-timeout-ms)
   :connection-timeout (llm/llm-connection-timeout-ms)})

;;; ------------------------------------------------ Model listing -----------------------------------------------

(defn- list-all-models
  "Fetch the served model catalog (`GET /models`).

  Doubles as the credential round-trip behind the admin Connect button: a 2xx proves the base URL
  is reachable and, when the server enforces auth, that the key is accepted.
  `:ai-proxy?` is not supported for vLLM and throws when true."
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
  "A single trivial tool for the preflight probes. Kept minimal so a probe costs the prefill of a few
  hundred tokens rather than a realistic session."
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

(def ^:private probe-max-tokens 256)

(defn- preflight-ex
  "A preflight failure. `:status-code 400` plus `:api-error` makes `metabase.metabot.api`'s
  `provider-client-error?` treat it as a configuration problem, so the message reaches the admin
  verbatim instead of surfacing as a 500."
  [msg]
  (ex-info msg {:api-error   true
                :status-code 400
                :error-code  :vllm-preflight-failed}))

(defn- probe-chat!
  "Run one non-streaming Chat Completions turn against `model` and return the first choice's
  `message`. Non-streaming on purpose: the probe asserts on the assembled message, and skipping SSE
  keeps the check independent of the streaming translation it is validating."
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
                                      (inference-timeouts)))]
    (get-in res [:body :choices 0 :message])))

(defn- check-context-budget!
  [{:keys [id max_model_len]}]
  (when (and max_model_len (< (long max_model_len) min-context-length))
    (throw (preflight-ex
            (tru "{0} is served with a {1} token context window, which is too small for Metabot — it needs at least {2}. Restart vLLM with a larger --max-model-len."
                 (str id) (str max_model_len) (str min-context-length))))))

(defn- check-tool-calling!
  "The check that pays for the whole feature. With `tool_choice \"auto\"` — what the agent loop uses
  on every profile but `sql` — a tool call only comes back when the server was started with
  `--enable-auto-tool-choice` *and* a `--tool-call-parser` whose sentinel tokens match what this
  model emits. A wrong-but-valid parser name produces no error at any layer: the sentinels never
  match, the call stays in `content` as prose, and Metabot just chats without ever acting."
  [auth model]
  (let [message    (probe-chat! auth model "auto")
        content    (str (:content message))
        tool-calls (:tool_calls message)]
    (cond
      (str/includes? content "<think>")
      (throw (preflight-ex
              (tru "{0} streamed its reasoning as chat text. Restart vLLM with --reasoning-parser so thinking doesn''t appear inside Metabot''s answers."
                   (str model))))

      (empty? tool-calls)
      (throw (preflight-ex
              (tru "The vLLM server answered with text instead of calling a tool. Restart it with --enable-auto-tool-choice and a --tool-call-parser matching {0}''s output format."
                   (str model))))

      :else
      (let [arguments (get-in (first tool-calls) [:function :arguments])]
        (when-not (try
                    (map? (json/decode+kw (str arguments)))
                    (catch Exception _ false))
          (throw (preflight-ex
                  (tru "The vLLM server returned a tool call whose arguments are not valid JSON. The --tool-call-parser most likely does not match {0}''s output format."
                       (str model)))))))))

(defn- check-structured-output!
  "`tool_choice \"required\"` drives guided decoding rather than the tool-call parser, so this covers
  a different failure than [[check-tool-calling!]]: a model whose grammar the server cannot compile
  chats fine but breaks conversation titling (which runs on every new conversation, regardless of
  profile) and the whole `sql` profile."
  [auth model]
  (when (empty? (:tool_calls (probe-chat! auth model "required")))
    (throw (preflight-ex
            (tru "The vLLM server did not honor a forced tool call. Metabot needs structured output support for conversation titles and SQL generation.")))))

(defn- preflight!
  "Exercise the contract the agent loop depends on, against the model that will actually be used.

  Every failure this catches is otherwise silent and looks like a Metabase bug:

  | Misconfiguration                  | What the admin would otherwise see  |
  |-----------------------------------|-------------------------------------|
  | No `--enable-auto-tool-choice`    | Metabot chats but never acts        |
  | Wrong `--tool-call-parser`        | Malformed or absent tool calls      |
  | Reasoning model, no parser        | `<think>` tags in the chat          |
  | Context window too small          | A 400 mid-conversation              |
  | No structured-output support      | Titles and the `sql` profile fail   |

  `requested-model` is the candidate from the request; without one the served model is adopted (see
  the connect flow in `metabase.metabot.api`)."
  [{:keys [credentials ai-proxy?]} entries requested-model]
  (let [entry (or (u/seek #(= requested-model (:id %)) entries)
                  (first entries))]
    (when-not entry
      (throw (preflight-ex (tru "The vLLM server is reachable but is not serving any models."))))
    (check-context-budget! entry)
    (try
      (let [auth (vllm-auth credentials ai-proxy?)]
        (check-tool-calling! auth (:id entry))
        (check-structured-output! auth (:id entry)))
      (catch Exception e
        (core/rethrow-api-error! "vllm" vllm-error-msg e)))))

(defn list-models
  "List the models the configured vLLM server is serving.

  Pass-through: the operator serves whatever they loaded, so there is nothing to whitelist and
  `display_name` falls back to the served id. When `:probe?` is true, additionally runs
  [[preflight!]] — reserved for the `PUT` settings path, since a tool-call probe on every `GET`
  would stall the admin model dropdown behind a full prefill.
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

  vLLM's Chat Completions dialect matches what [[chat-completions/request-body]] emits, except that
  an explicit `max_tokens` is always sent. Without a ceiling vLLM falls back to whatever remains of
  the context window, so a single looping small model can consume the entire budget in one call.
  Kept adapter-local rather than pushed into the shared builder, which would silently cap Z.AI,
  Mistral, and OpenRouter too."
  [{:keys [max-tokens] :as opts} :- core/LLMRequestOpts]
  (cond-> (chat-completions/request-body opts)
    (not max-tokens) (assoc :max_tokens (llm/llm-max-tokens))))

(defn- timeout-guarded
  "Wrap a stream reducible so a socket timeout while *consuming* it surfaces as a non-retryable vLLM
  error.

  The adapter's `try` covers only establishing the request; the SSE body is consumed later, outside
  it. A raw `SocketTimeoutException` escaping from there satisfies
  `metabase.metabot.self/retryable-error?`, and `call-llm`'s retry gate is still open because
  nothing has been emitted — so a server whose only problem is that it is slow would be asked to
  replay three full cold prefills."
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

  A reasoning model started with `--reasoning-parser` routes its thinking to `delta.reasoning_content`
  and its answer back to `delta.content`; the shared xf keys off `content` and `tool_calls` only, so
  the thinking is dropped and the answer streams normally. Without that flag the thinking arrives in
  `delta.content` as literal `<think>` tags — which is why [[preflight!]] sniffs for them."
  []
  (chat-completions/chat-completions->aisdk-chunks-xf))

(defn vllm
  "Call a vLLM server's Chat Completions API, return AISDK stream."
  [& args]
  (let [raw (apply vllm-raw args)]
    (eduction (vllm->aisdk-chunks-xf) raw)))
