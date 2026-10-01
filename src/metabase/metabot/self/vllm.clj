(ns metabase.metabot.self.vllm
  "vLLM / Chat Completions adapter for self-hosted, OpenAI-compatible inference servers.

  The base URL is required and the API key is optional, and there is no model whitelist — the
  operator serves whatever they loaded, so [[preflight!]] exercises the agent-loop contract at
  configuration time instead.

  https://docs.vllm.ai/en/latest/serving/openai_compatible_server.html"
  (:require
   [clojure.string :as str]
   [metabase.llm.settings :as llm]
   [metabase.metabot.self.adapter :as adapter]
   [metabase.metabot.self.core :as core]
   [metabase.metabot.self.openai.chat-completions :as chat-completions]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu])
  (:import
   (com.fasterxml.jackson.core JsonProcessingException)
   (java.io IOException)
   (java.net SocketTimeoutException)
   (java.util.concurrent ExecutionException)))

(set! *warn-on-reflection* true)

(defn- missing-base-url-ex []
  (ex-info (tru "No vLLM base URL is set")
           {:api-error  true
            :error-code :base-url-missing}))

(defn- vllm-auth
  "vLLM's `:auth`. A server needs a base URL but not a key — one started without `--api-key` is a complete
  configuration — so the map is never nil and [[core/resolve-auth]] cannot reach its `missing-api-key-ex`
  branch."
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
  (adapter/provider
   {:slug              "vllm"
    :display-name      "vLLM"
    :auth              vllm-auth
    :error-fallback    #(tru "vLLM API error (HTTP {0})" %)
    :errors            {400 #(tru "vLLM rejected the request — usually an unsupported schema, or a model that cannot compile the tool grammar")
                        401 #(tru "vLLM API key expired or invalid — check the key your server was started with via --api-key")
                        404 #(tru "vLLM API endpoint was not found — the base URL should end in /v1")
                        429 #(tru "The vLLM server''s request queue is full — reduce concurrent load, or restart it with a larger --max-num-seqs")
                        500 #(tru "vLLM returned an internal server error")}}))

(defn- missing-model-ex []
  (ex-info (tru "No vLLM model is set")
           {:api-error  true
            :error-code :model-missing}))

(def reasoning-config-key
  "The connection `:config` key [[preflight!]]'s reasoning observation is recorded under. It is not an
  admin-entered field: whether a served model reasons depends on the operator's `--reasoning-parser`
  as much as on the model, so only the probe can answer it."
  :model-reasoning)

(defn reasoning-connection?
  "Whether the connection carrying `credentials` was observed streaming its reasoning. A hand-written
  `llm-providers` can hold a JSON boolean where the API stores the string it round-trips."
  [credentials]
  (let [recorded (get credentials reasoning-config-key)]
    (or (true? recorded) (= "true" recorded))))

(mu/defn streams-reasoning? :- :boolean
  "Registry capability. vLLM answers from what its connect-time probe recorded on the connection: the flag
  depends on the operator's `--reasoning-parser` as well as on the model, so the name cannot settle it."
  [{:keys [credentials]} :- adapter/ResolvedRef]
  (reasoning-connection? credentials))

(defn- inference-timeouts
  "Timeouts for a generation request."
  []
  {:socket-timeout     (llm/llm-vllm-request-timeout-ms)
   :connection-timeout (llm/llm-connection-timeout-ms)})

(defn- probe-timeouts
  "Timeouts for a preflight probe. An operator who lowers `llm-vllm-request-timeout-ms` below the
  ceiling gets their own value."
  []
  {:socket-timeout     (min (llm/llm-vllm-request-timeout-ms) adapter/probe-timeout-ceiling-ms)
   :connection-timeout (llm/llm-connection-timeout-ms)})

;;; ----------------------------------------------- Transport errors ---------------------------------------------

(defn- unreachable-ex
  "The vLLM error for a non-timeout transport failure. `extra` is the caller's own ex-data tags."
  [^IOException e base-url extra]
  (ex-info (tru "Could not reach the vLLM server at {0}. Check that it is running and that the base URL is correct."
                (str base-url))
           (merge {:api-error true :error-code :vllm-unreachable} extra)
           e))

(defn- list-models-io-ex
  "The vLLM error for a transport failure while fetching the model catalog — the request behind the
  admin Connect button. Tagged `:status-code 400` so a mistyped base URL surfaces the message rather
  than the 500 `core/rethrow-api-error!`'s untagged no-response branch would produce."
  [^IOException e base-url]
  (if (instance? SocketTimeoutException e)
    (ex-info (tru "The vLLM server at {0} did not respond within {1}ms. Check that it is running and not overloaded."
                  (str base-url) (str (llm/llm-request-timeout-ms)))
             {:api-error   true
              :status-code 400
              :error-code  :vllm-timeout}
             e)
    (unreachable-ex e base-url {:status-code 400})))

;;; ------------------------------------------------ Model listing -----------------------------------------------

(defn- list-all-models
  "Fetch the served model catalog, which doubles as the credential round-trip behind the admin
  Connect button.

  A 2xx whose body is not a recognizable catalog fails closed via
  [[chat-completions/models-catalog]], naming the base URL — the likeliest cause for the one provider
  whose base URL the admin types.

  No timeouts are passed: this is not a generation, so it rides [[core/request]]'s shared default
  budget rather than vLLM's longer [[inference-timeouts]] one."
  [{{:keys [base-url]} :credentials :as req}]
  ;; The URL off the request credentials, not the setting: a connect verifies them before they are saved.
  (let [detail (tru "Check that {0} is a vLLM server''s OpenAI-compatible API — the base URL should end in /v1."
                    (str base-url))]
    (try
      (let [res (adapter/request! provider (assoc req
                                                  :method :get
                                                  :path   "/models"
                                                  :as     :json))]
        (chat-completions/models-catalog "vLLM" res {:detail detail}))
      ;; Ordered ahead of the `IOException` catch, which Jackson's parse error is one of: a 2xx whose
      ;; body is not JSON means the server answered, so the address is wrong rather than unreachable.
      (catch JsonProcessingException e
        (throw (chat-completions/malformed-catalog-ex "vLLM" detail e)))
      ;; Ordered ahead of the generic catch, which a non-2xx still reaches as an `ExceptionInfo`.
      (catch IOException e
        (throw (list-models-io-ex e base-url)))
      (catch Exception e
        (adapter/rethrow! provider e)))))

;;; -------------------------------------------------- Preflight -------------------------------------------------

(defn- preflight-ex
  "A preflight failure, tagged so `metabase.metabot.api` surfaces the message verbatim, not as a 500."
  [msg]
  (ex-info msg {:api-error   true
                :status-code 400
                :error-code  :vllm-preflight-failed}))

(defn- probe-chat!
  "Run one non-streaming Chat Completions turn against `model` and return the first choice. The
  `finish_reason` is part of the return value because a generation truncated at
  [[adapter/probe-max-tokens]] and a server that will not call tools both produce empty `tool_calls`."
  [req model tool-choice]
  (let [res (adapter/request! provider
                              (assoc req
                                     :method  :post
                                     :path    "/chat/completions"
                                     :as      :json
                                     :body    (json/encode {:model       model
                                                            :messages    adapter/probe-messages
                                                            :tools       [adapter/probe-tool]
                                                            :tool_choice tool-choice
                                                            :temperature 0
                                                            :max_tokens  adapter/probe-max-tokens}))
                              (probe-timeouts))]
    (get-in res [:body :choices 0])))

(defn- check-context-budget!
  [{:keys [id max_model_len]}]
  (when (and max_model_len (< (long max_model_len) adapter/min-context-window-tokens))
    (throw (preflight-ex
            (tru "{0} is served with a {1} token context window, which is too small for Metabot — it needs at least {2}. Restart vLLM with a larger --max-model-len."
                 (str id) (str max_model_len) (str adapter/min-context-window-tokens))))))

(defn- check-tool-calling!
  "Check that the server was started with `--enable-auto-tool-choice` and a `--tool-call-parser` whose
  sentinels match this model. A wrong-but-valid parser name errors at no layer — the call stays in
  `content` as prose and Metabot chats without ever acting.

  Returns whether the model emitted reasoning, the only signal anywhere that it is a reasoning model."
  [req model]
  (let [{:keys [message finish_reason]} (probe-chat! req model "auto")
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
                         (str model) (str adapter/probe-max-tokens))
                    (tru "The vLLM server returned a tool call whose arguments are not valid JSON. The --tool-call-parser most likely does not match {0}''s output format."
                         (str model))))))
        (not (str/blank? reasoning)))

      (and truncated? (not (str/blank? reasoning)))
      (throw (preflight-ex
              (tru "{0} spent the entire {1} token connection-test budget reasoning without calling a tool. A model that thinks this long about a trivial prompt is too slow to drive Metabot."
                   (str model) (str adapter/probe-max-tokens))))

      ;; A tool call cut off at the ceiling reaches here, not the `(seq tool-calls)` branch above: the
      ;; parsers extract from complete output, so a call missing its closing sentinel yields no
      ;; `tool_calls` at all and leaves the raw text in `content`. That is indistinguishable from
      ;; prose except by `finish_reason`, and naming the flags — which are working, or the sentinel
      ;; would not be there — sends the admin to fix something that is not broken. A verbose model
      ;; whose flags really are missing lands here too, and gets the flags message on the retry after
      ;; raising the ceiling; truncation is the problem to fix first either way.
      truncated?
      (throw (preflight-ex
              (tru "{0} reached the {1} token connection-test ceiling before completing a tool call. A model that generates this much before calling a tool is too slow to drive Metabot."
                   (str model) (str adapter/probe-max-tokens))))

      :else
      (throw (preflight-ex
              (tru "The vLLM server answered with text instead of calling a tool. Restart it with --enable-auto-tool-choice and a --tool-call-parser matching {0}''s output format."
                   (str model)))))))

(defn- check-structured-output!
  "Check that guided decoding works. A different failure from [[check-tool-calling!]]: a model whose
  grammar the server cannot compile chats fine but breaks titling and the whole `sql` profile."
  [req model]
  (let [{:keys [message finish_reason]} (probe-chat! req model "required")]
    (when (empty? (:tool_calls message))
      (throw (preflight-ex
              (if (= "length" finish_reason)
                (tru "{0} reached the {1} token connection-test ceiling without producing a forced tool call. Metabot needs structured output support for conversation titles and SQL generation."
                     (str model) (str adapter/probe-max-tokens))
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

(defn- run-probes!
  "Run both contract probes against `model` and return whether it streamed reasoning.

  They run concurrently; deref order fixes the verdict, tool calling being the more actionable
  diagnosis when a server fails both. The loser is cancelled rather than left generating against the
  operator's server long after anyone is listening."
  [req model]
  (try
    (let [tool-calling (future (check-tool-calling! req model))
          structured   (future (check-structured-output! req model))]
      (try
        (let [reasoning? (await-probe! tool-calling)]
          (await-probe! structured)
          (boolean reasoning?))
        (finally
          (future-cancel tool-calling)
          (future-cancel structured))))
    (catch SocketTimeoutException _
      (throw (preflight-ex
              (tru "The vLLM server did not answer the connection test within {0}ms. Check that it is not overloaded — a server this slow to answer a trivial prompt cannot drive Metabot."
                   (str (:socket-timeout (probe-timeouts)))))))
    (catch Exception e
      (adapter/rethrow! provider e))))

(defn- preflight!
  "Exercise the contract the agent loop depends on, against the model that will actually be used, and
  return `{:model id :reasoning? bool}`. The connect path must adopt exactly this model rather than
  re-deriving it from the listing, which agrees only while nothing reorders the catalog.

  `:reasoning?` reports whether the probed model streamed reasoning. Only the probe can answer that,
  and the answer drives which renderer the frontend picks, so the connection records it (see
  [[reasoning-config-key]])."
  [req entries requested-model]
  (let [entry (probe-target entries requested-model)
        model (:id entry)]
    (check-context-budget! entry)
    {:model      model
     :reasoning? (run-probes! req model)}))

(mu/defn list-models :- adapter/ModelListing
  "List the models the connection's vLLM server is serving. Pass-through: there is nothing to
  whitelist, and `display_name` falls back to the served id.

  `:probe?` additionally runs [[preflight!]], and reports what it determined as `:connection-info`,
  for the connect path to store on the connection: whether the model reasons, and the model it
  exercised, which the connect path adopts as the one to run on. Reserved for the connect and edit
  paths — a tool-call probe on every model listing would stall the admin picker behind a full
  prefill. On edit, a `:proposed-model` is re-probed only while the server still advertises it;
  otherwise the normal candidate selection chooses a replacement."
  ([] (list-models {}))
  ([{:keys [credentials ai-proxy? model proposed-model probe?]} :- adapter/ListOpts]
   (let [req      {:credentials credentials :ai-proxy? ai-proxy?}
         entries  (list-all-models req)
         proposed (when (some #(= proposed-model (:id %)) entries)
                    proposed-model)
         probed   (when probe?
                    (preflight! req entries (or model proposed)))]
     (cond-> {:models (mapv (fn [{:keys [id] :as entry}]
                              {:id id :display_name (or (:name entry) id)})
                            entries)}
       probed (assoc :connection-info {reasoning-config-key (str (:reasoning? probed))
                                       :probed-model        (:model probed)})))))

;;; --------------------------------------------------- Requests -------------------------------------------------

(mu/defn vllm-request-body
  "Build the Chat Completions request body for an LLM request.

  Matches what [[chat-completions/request-body]] emits, except that `max_tokens` is always sent —
  without a ceiling vLLM falls back to the remaining context window, so one looping small model
  consumes the whole budget in a single call — and is raised to
  [[adapter/forced-tool-call-token-floor]] or [[adapter/reasoning-model-token-floor]] where either applies, and
  `temperature` falls back to [[adapter/default-temperature]]. All three stay adapter-local rather than
  moving into the shared builder, which would also change Z.AI, Mistral, and OpenRouter."
  [{:keys [max-tokens temperature schema tool_choice credentials] :as opts} :- core/LLMRequestOpts]
  (let [forced? (or (some? schema) (= "required" (some-> tool_choice name)))]
    (assoc (chat-completions/request-body (cond-> opts
                                            (nil? temperature) (assoc :temperature adapter/default-temperature)))
           :max_tokens (cond-> (or max-tokens (llm/llm-max-tokens))
                         forced?                             (max adapter/forced-tool-call-token-floor)
                         (reasoning-connection? credentials) (max adapter/reasoning-model-token-floor)))))

(defn- stream-io-ex
  "The vLLM error for a transport failure while *consuming* a response stream. Tagged
  `:retryable? false`: on a self-hosted server a stalled or severed response means \"too slow\" or
  \"it died\", not \"transient\", and a retry replays a full cold prefill at up to
  `llm-vllm-request-timeout-ms` (300s) apiece. The tag is required — `retryable-error?` walks the
  cause chain and would otherwise match the `IOException` below."
  [^IOException e timeout-ms]
  (if (instance? SocketTimeoutException e)
    (ex-info (tru "The vLLM server stopped responding after {0}ms. Raise the vLLM request timeout, or serve a faster model."
                  (str timeout-ms))
             {:api-error  true
              :error-code :vllm-timeout
              :retryable? false}
             e)
    (ex-info (tru "The connection to the vLLM server was interrupted before the response finished.")
             {:api-error  true
              :error-code :vllm-stream-interrupted
              :retryable? false}
             e)))

(defn- request-io-ex
  "The vLLM error for a transport failure while *establishing* a request. `core/rethrow-api-error!`
  would render these as \"vllm API request failed: Read timed out\", naming neither the server's
  slowness nor the setting that governs it.

  Tagged `:retryable? false` for the same reason as [[stream-io-ex]], and more importantly: nothing
  has been emitted yet, so `call-llm`'s own \"nothing emitted\" predicate would not stop a replay."
  [^IOException e base-url timeout-ms]
  (if (instance? SocketTimeoutException e)
    (ex-info (tru "The vLLM server did not respond within {0}ms. Check that it is not overloaded, or raise the vLLM request timeout."
                  (str timeout-ms))
             {:api-error  true
              :error-code :vllm-timeout
              :retryable? false}
             e)
    (unreachable-ex e base-url {:retryable? false})))

(mu/defn vllm-raw
  "Perform a streaming request to a vLLM server's Chat Completions API.
  Opts map takes `:credentials` (`{:base-url ... :api-key ...}`) from the connection serving this
  request, and throws without a base URL.
  `:ai-proxy?` is not supported for vLLM and throws when true."
  [{:keys [model credentials] :as opts} :- core/LLMRequestOpts]
  (when (str/blank? model)
    (throw (missing-model-ex)))
  (let [timeout-ms (llm/llm-vllm-request-timeout-ms)]
    (adapter/stream! provider opts
                     {:path             "/chat/completions"
                      :body             (vllm-request-body opts)
                      :request-options  (inference-timeouts)
                      :wrap-stream      #(adapter/io-guarded % (fn [e] (stream-io-ex e timeout-ms)))
                      ;; clj-http raises an `IOException` only when there is no response at all, so the
                      ;; IO branch cannot swallow a failure the provider's own messages would have translated.
                      :on-request-error (fn [e]
                                          (if (instance? IOException e)
                                            (throw (request-io-ex e (:base-url credentials) timeout-ms))
                                            (adapter/rethrow! provider e)))})))

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
