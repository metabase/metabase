(ns metabase.metabot.self.ollama
  "Ollama adapter, serving both deployments: Cloud and self-hosted.

  A sibling of [[metabase.metabot.self.vllm]] rather than a layer over it — same Chat Completions
  transport, but Ollama has no server flags to point an admin at, so every diagnosis differs.

  https://docs.ollama.com/api/openai-compatibility"
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase.llm.settings :as llm]
   [metabase.metabot.self.core :as core]
   [metabase.metabot.self.debug :as debug]
   [metabase.metabot.self.ollama.capabilities :as caps]
   [metabase.metabot.self.ollama.connection :as conn]
   [metabase.metabot.self.ollama.forced-calls :as forced]
   [metabase.metabot.self.openai.chat-completions :as chat-completions]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.o11y :refer [with-span]])
  (:import
   (java.io IOException)
   (java.net SocketTimeoutException)))

(set! *warn-on-reflection* true)

(defn- missing-model-ex []
  (ex-info (tru "No Ollama model is set")
           {:api-error  true
            :error-code :model-missing}))

(defn- ollama-error-msg
  "Canonical, status-specific Ollama error message."
  [res]
  (let [status (long (:status res 0))]
    (case status
      400 (tru "Ollama rejected the request — usually a model that cannot produce the requested tool call or JSON schema")
      401 (tru "Ollama rejected the API key")
      404 (tru "Ollama API endpoint was not found — the base URL should end in /v1, and the model must already be available")
      429 (tru "Ollama is rate limiting this instance — wait and retry, or reduce concurrent Metabot use")
      500 (tru "Ollama returned an internal server error")
      (tru "Ollama API error (HTTP {0})" status))))

(defn- inference-timeouts
  "Timeouts for a generation request."
  []
  {:socket-timeout     (llm/llm-ollama-request-timeout-ms)
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
  "Timeouts for a preflight probe, capped at [[probe-timeout-ceiling-ms]]."
  []
  {:socket-timeout     (min (llm/llm-ollama-request-timeout-ms) probe-timeout-ceiling-ms)
   :connection-timeout (llm/llm-connection-timeout-ms)})

;;; ----------------------------------------------- Transport errors ---------------------------------------------

(defn- unreachable-ex
  "The Ollama error for a non-timeout transport failure. `extra` is the caller's own ex-data tags."
  [^IOException e {:keys [url]} extra]
  (ex-info (tru "Could not reach Ollama at {0}. Check that it is reachable from the Metabase server."
                (str url))
           (merge {:api-error true :error-code :ollama-unreachable} extra)
           e))

(defn- list-models-io-ex
  "Transport failure while fetching the catalog — the request behind the Connect button. Tagged 400
  so a mistyped base URL surfaces this message rather than a 500."
  [^IOException e {:keys [url] :as auth}]
  (if (instance? SocketTimeoutException e)
    (ex-info (tru "The Ollama server at {0} did not respond within {1}ms. Check that it is running and not loading a model."
                  (str url) (str (llm/llm-request-timeout-ms)))
             {:api-error   true
              :status-code 400
              :error-code  :ollama-timeout}
             e)
    (unreachable-ex e auth {:status-code 400})))

;;; ------------------------------------------------ Model listing -----------------------------------------------

(defn- list-all-models
  "Fetch the pulled model catalog. Doubles as the credential round-trip behind the Connect button,
  and fails closed on a 2xx whose body is not a catalog — a mistyped base URL is the likeliest cause."
  [auth]
  (try
    (let [res (core/request auth (merge {:method  :get
                                         :url     "/models"
                                         :as      :json
                                         :headers {"Content-Type" "application/json"}}
                                        (control-timeouts)))]
      ;; The URL off `auth`, not the setting: a connect verifies request credentials before saving them.
      (chat-completions/models-catalog
       "Ollama" res
       {:detail (tru "Check that {0} is an Ollama server''s OpenAI-compatible API — the base URL should end in /v1."
                     (str (:url auth)))}))
    ;; Ordered ahead of the generic catch, which a non-2xx still reaches as an `ExceptionInfo`.
    ;; `:as :json` also lands a 2xx whose body is not JSON here, via Jackson's `JsonParseException`.
    (catch IOException e
      (throw (list-models-io-ex e auth)))
    (catch Exception e
      (core/rethrow-api-error! "ollama" ollama-error-msg e))))

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
  is billed against it — a probe truncated before the tool call looks like a model that cannot call
  tools at all."
  2048)

(def ^:private forced-tool-call-token-floor
  "Floor for a forced tool call: below it a reasoning model spends the budget thinking and emits no
  call. Equal to [[probe-max-tokens]], which [[preflight!]] proves the model can clear."
  probe-max-tokens)

(def ^:private reasoning-model-token-floor
  "Smallest `max_tokens` a request on a reasoning model gets. Chat Completions bills thinking, answer,
  and tool call against one budget."
  16384)

(def ^:private default-temperature
  "Sampling temperature when the caller supplies none. Ollama's per-model Modelfile default is
  commonly far too high for tool calling and SQL generation, and no server-side default corrects it."
  0.3)

(defn- preflight-ex
  "A preflight failure, tagged so `metabase.metabot.api` surfaces the message verbatim, not as a 500."
  [msg]
  (ex-info msg {:api-error   true
                :status-code 400
                :error-code  :ollama-preflight-failed}))

(defn- probe-chat!
  "One non-streaming Chat Completions turn, returning the first choice. `body` carries what differs
  between probes — the messages, and either a tool or a `response_format`. `finish_reason` comes back
  with it because truncation and a model that cannot call tools both produce empty `tool_calls`."
  [auth model body]
  (let [res (core/request auth (merge {:method  :post
                                       :url     "/chat/completions"
                                       :as      :json
                                       :headers {"Content-Type" "application/json"}
                                       :body    (json/encode (merge {:model       model
                                                                     :temperature 0
                                                                     :max_tokens  probe-max-tokens}
                                                                    body))}
                                      (probe-timeouts)))]
    (get-in res [:body :choices 0])))

(defn- check-tool-calling!
  "Check that the model can call tools; Ollama drives this from the model's own template, so the fix
  is always a different model. Returns whether it emitted reasoning — the only signal we get."
  [auth model]
  (let [{:keys [message finish_reason]} (probe-chat! auth model {:messages probe-messages
                                                                 :tools    [probe-tool]})
        content    (str (:content message))
        ;; `reasoning` is the OpenAI-compatible spelling; `reasoning_content` is the older one some
        ;; builds still emit.
        reasoning  (str (or (:reasoning message) (:reasoning_content message)))
        tool-calls (:tool_calls message)
        truncated? (= "length" finish_reason)]
    (cond
      (str/includes? content "<think>")
      (throw (preflight-ex
              (tru "{0} streamed its reasoning as chat text, which would appear inside Metabot''s answers. Pull a build of this model whose template separates thinking from the answer."
                   (str model))))

      (seq tool-calls)
      (let [arguments (get-in (first tool-calls) [:function :arguments])]
        (when-not (try
                    (map? (json/decode+kw (str arguments)))
                    (catch Exception _ false))
          (throw (preflight-ex
                  (if truncated?
                    (tru "{0} reached the {1} token connection-test ceiling before completing a tool call. A model that generates this much before calling a tool is too slow to drive Metabot."
                         (str model) (str probe-max-tokens))
                    (tru "{0} returned a tool call whose arguments are not valid JSON. Pull a larger or more capable model — Metabot needs reliable tool calling."
                         (str model))))))
        (not (str/blank? reasoning)))

      (and truncated? (not (str/blank? reasoning)))
      (throw (preflight-ex
              (tru "{0} spent the entire {1} token connection-test budget reasoning without calling a tool. A model that thinks this long about a trivial prompt is too slow to drive Metabot."
                   (str model) (str probe-max-tokens))))

      truncated?
      (throw (preflight-ex
              (tru "{0} reached the {1} token connection-test ceiling before completing a tool call. A model that generates this much before calling a tool is too slow to drive Metabot."
                   (str model) (str probe-max-tokens))))

      :else
      (throw (preflight-ex
              (tru "{0} answered with text instead of calling a tool. Metabot needs a model that supports tool calling — pick a different one."
                   (str model)))))))

(defn- check-structured-output!
  "Check that the connection can actually deliver structured output, through the mechanism it will
  really use — [[forced/probe-body]] decides which that is, and [[forced/probe-verdict]] reads the
  answer.

  The remedy is what differs between deployments, so only the message branches here. Self-hosted can
  fail on the *server* rather than the model, because an Ollama too old to read `response_format`
  ignores it and the model answers in prose. Cloud cannot fail that way: nothing there was ever going
  to enforce it, so a model that will not take the instruction has to be caught at connect — nothing
  downstream can repair it."
  [auth model cloud?]
  (let [choice (probe-chat! auth model (forced/probe-body cloud?))]
    (when-let [verdict (forced/probe-verdict cloud? choice)]
      (throw (preflight-ex
              (case verdict
                :truncated
                (tru "{0} reached the {1} token connection-test ceiling before completing the structured answer it was asked for. Metabot needs structured output for conversation titles and SQL generation."
                     (str model) (str probe-max-tokens))

                :not-honored
                (if cloud?
                  (tru "{0} would not answer Ollama Cloud''s structured-output request with a tool call. Cloud cannot force one, so Metabot needs a model that does it when asked — pick a larger or more capable one."
                       (str model))
                  (tru "{0} did not answer with JSON matching the schema it was given. Metabot needs structured output for conversation titles and SQL generation — upgrade Ollama to a version that supports `response_format`, or pull a larger or more capable model."
                       (str model)))))))))

(defn- no-models-ex []
  (preflight-ex (tru "Ollama is reachable but is offering no models.")))

(defn- probe-target
  "The catalog entry [[preflight!]] will probe.

  A requested model is the only acceptable target: falling back to another pulled model would pass
  every check and then persist a provider string naming a model the server does not have. The
  fallback is for the connect path, which supplies no model because the pulled name is knowable only
  from this catalog.

  That fallback takes the first *chat-capable* entry rather than the first entry. Ollama lists models
  newest-first and its OpenAI-compatible listing does not filter out embedding models, so the newest
  pull being an embedding model was enough to fail a connect against a server with a perfectly good
  chat model on it — with no way out, since the form hides the model picker for a type whose catalog
  is not fixed.

  `entries` is the whole catalog as [[tag-chat-capable]] left it, not the subset [[list-models]]
  offers, so that a model requested by name is answered about rather than reported missing."
  [entries requested-model]
  (if requested-model
    (let [entry (or (u/seek #(= requested-model (:id %)) entries)
                    (throw (if (seq entries)
                             (preflight-ex (tru "{0} is not available. Models on offer: {1}."
                                                (str requested-model) (str/join ", " (map :id entries))))
                             (no-models-ex))))]
      (when-not (::chat? entry)
        (throw (preflight-ex (tru "{0} is not a chat model — Ollama offers it for embedding only. Pick a model that supports tool calling."
                                  (str requested-model)))))
      entry)
    (or (u/seek ::chat? entries)
        (first entries)
        (throw (no-models-ex)))))

(defn- run-probes!
  "Run both contract probes and return whether the model streamed reasoning.

  Which structured-output probe runs depends on the deployment, because the mechanism does — see
  [[metabase.metabot.self.ollama.forced-calls/probe-body]].

  Sequential, tool calling first: structured output only means anything once tool calling works, so
  stopping at the first failure is strictly less work. Concurrency would not help — Ollama serializes
  generation per model unless `OLLAMA_NUM_PARALLEL` is raised, and a losing probe cannot be called
  off: `future-cancel` interrupts, and a blocking socket read ignores interrupts."
  [auth model cloud?]
  (try
    (let [reasoning? (check-tool-calling! auth model)]
      (check-structured-output! auth model cloud?)
      reasoning?)
    (catch SocketTimeoutException _
      (throw (preflight-ex
              (tru "Ollama did not answer the connection test within {0}ms. On a self-hosted server the first request also loads the model into memory — if it is large, retry once it is warm, otherwise it is too slow to drive Metabot."
                   (str (:socket-timeout (probe-timeouts)))))))
    (catch Exception e
      (core/rethrow-api-error! "ollama" ollama-error-msg e))))

(defn- preflight!
  "Exercise the agent loop's contract against the model that will actually serve it, returning
  `{:model id :reasoning? bool}`. The connect path must adopt exactly this model rather than
  re-deriving it from the listing, which agrees only while nothing reorders the catalog.

  No context-window check, unlike vLLM's: Ollama's catalog carries no `max_model_len`, so nothing at
  connect time can see the window. Too small a window shows up as truncation in the probes above."
  [auth entries requested-model cloud?]
  (let [entry (probe-target entries requested-model)
        model (:id entry)]
    {:model      model
     :reasoning? (run-probes! auth model cloud?)}))

(def ^:private capability-lookup-batch
  "How many models to ask about at once. `pmap` is no help on its own: it realizes a chunked seq — and
  a JSON catalog is a vector — 32 elements at a time, so its look-ahead never binds and a 40-model
  catalog opens 32 sockets at once. Against Cloud that is 32 simultaneous TLS handshakes to one host,
  which is how an instance earns a 429 — and a 429 is cached as \"would not say\" for the whole TTL,
  so one burst would cost reasoning detection for every model on the connection."
  8)

(defn- tag-chat-capable
  "`entries` with `::chat?` on each, saying whether Ollama offers that model for chat at all.

  The catalog is the OpenAI-compatible one, which lists embedding models alongside chat models and
  marks neither, so [[caps/chat-capable?]] is the only thing that tells them apart. Tagged rather
  than filtered because both readers want a different view of the same answer: the picker wants the
  chat models, [[probe-target]] wants the whole catalog so it can say *why* a named model is no good.
  Asking once is also what keeps this from being three passes over the same models.

  A server that reports nothing tags everything chat-capable: see [[caps/chat-capable?]]."
  [credentials entries]
  (into []
        (comp (partition-all capability-lookup-batch)
              (mapcat (fn [batch]
                        (doall (pmap #(assoc % ::chat? (caps/chat-capable? credentials (:id %)))
                                     batch)))))
        entries))

(defn list-models
  "The models the server has pulled that Metabot could run on — the embedding models Ollama's
  OpenAI-compatible catalog lists alongside them are dropped, so the admin's picker only offers
  models a connection can actually be saved against.

  `:probe?` also runs [[preflight!]] and returns what it learned as `:learned-config` for the connect
  path to store. Reserved for connect and edit: probing on every listing would stall the model picker
  behind a full model load. A `:proposed-model` is re-probed only while the server still has it."
  ([] (list-models {}))
  ([{:keys [credentials ai-proxy? model proposed-model probe?]}]
   (let [auth     (conn/auth credentials ai-proxy?)
         catalog  (tag-chat-capable credentials (list-all-models auth))
         entries  (filterv ::chat? catalog)
         proposed (when (some #(= proposed-model (:id %)) entries)
                    proposed-model)
         ;; the whole catalog, so a model requested by name is diagnosed rather than reported missing
         probed   (when probe?
                    (preflight! auth catalog (or model proposed) (conn/cloud? credentials)))
         models   (mapv (fn [{:keys [id] :as entry}]
                          {:id id :display_name (or (:name entry) id)})
                        entries)]
     (merge {:models models}
            (when probed
              {:learned-config {caps/reasoning-config-key (str (:reasoning? probed))
                                :probed-model             (:model probed)}})))))

;;; --------------------------------------------------- Requests -------------------------------------------------

(defn- reasoning-message
  "Builds the assistant message that sends one block of the model's thinking back to it.

  When a model thinks and then calls a tool, we replay that thinking on the next request, so it
  still knows why it made the call.

  We put it under `:reasoning_content` because that is the key the shared Chat Completions code
  knows how to merge. [[ollama-reasoning-spelling]] renames it before the request goes out.

  This only ever replays thinking from the turn in progress. Thinking is thrown away before a turn
  is saved, so it can never reach a later one. That is what makes this safe for any model: models
  disagree about replaying *old* thinking, but not about the turn they are in the middle of."
  [part]
  {:role "assistant" :content "" :reasoning_content (:text part)})

(defn- ollama-reasoning-spelling
  "Renames replayed thinking to the field name Ollama actually reads.

  Ollama sends thinking *to* us as either `reasoning` or `reasoning_content`, depending on its
  version. But when we send thinking back, only `reasoning` works.

  Get it wrong and Ollama quietly ignores the field: no error, replay just does nothing. Renaming
  every message is safe, because [[reasoning-message]] is the only thing that sets this key."
  [body]
  (update body :messages #(mapv (fn [m] (set/rename-keys m {:reasoning_content :reasoning})) %)))

(mu/defn ollama-request-body
  "The Chat Completions body, as [[chat-completions/request-body]] builds it plus the adapter-local
  adjustments: `max_tokens` is always sent (uncapped, a looping small model burns the whole context
  window in one call), raised to the floors above where they apply; `temperature` falls back to
  [[default-temperature]]; and the model's thinking is replayed (see [[reasoning-message]]). They
  stay here rather than in the shared builder, which also serves Z.AI, Mistral and OpenRouter.

  A forced tool call is [[metabase.metabot.self.ollama.forced-calls]]' subject, because `tool_choice`
  does nothing on Ollama and what can be done instead depends on the deployment. All this passes it is
  which server is being talked to. `plan` may be supplied by a caller that already has one — the
  streaming path does — so that a request derives it once.

  The reasoning floor is looked up rather than read off the connection, because one connection serves
  as many models as the operator has pulled — see
  [[metabase.metabot.self.ollama.capabilities/reasoning-model?]]. It is answered from cache after the
  first request on a model.

  We never tell Ollama whether to think, just as vLLM does not. Both run whatever model the operator
  installed, so we take that model's own default and leave room for it with the floors above.
  Ollama does have a `reasoning_effort` switch, but turning thinking off would only save tokens on
  the operator's own hardware, and it errors on models that cannot think at all."
  ([opts :- core/LLMRequestOpts]
   (ollama-request-body opts (forced/plan opts (conn/cloud? (:credentials opts)))))

  ([{:keys [max-tokens model temperature credentials reasoning?] :as opts
     :or   {reasoning? true}} :- core/LLMRequestOpts
    plan                      :- [:maybe :map]]
   (forced/body-for
    plan
    (assoc (ollama-reasoning-spelling
            (chat-completions/request-body
             (cond-> (forced/opts-for plan opts)
               (nil? temperature) (assoc :temperature default-temperature))
             (when reasoning? {:reasoning-part->message reasoning-message})))
           :max_tokens (cond-> (or max-tokens (llm/llm-max-tokens))
                         (some? plan)
                         (max forced-tool-call-token-floor)

                         (caps/reasoning-model? credentials model)
                         (max reasoning-model-token-floor))))))

(defn- stream-io-ex
  "Transport failure while *consuming* a stream. `:retryable? false` is required, not decorative:
  `retryable-error?` walks the cause chain and would otherwise match the `IOException`, replaying a
  full cold prefill for what is really \"too slow\" or \"it died\"."
  [^IOException e timeout-ms]
  (if (instance? SocketTimeoutException e)
    (ex-info (tru "The Ollama server stopped responding after {0}ms. Raise the Ollama request timeout, or pull a smaller model."
                  (str timeout-ms))
             {:api-error  true
              :error-code :ollama-timeout
              :retryable? false}
             e)
    (ex-info (tru "The connection to the Ollama server was interrupted before the response finished.")
             {:api-error  true
              :error-code :ollama-stream-interrupted
              :retryable? false}
             e)))

(defn- request-io-ex
  "Transport failure while *establishing* a request. `core/rethrow-api-error!` would render these as
  \"ollama API request failed: Read timed out\", naming neither the slowness nor the setting for it.
  `:retryable? false` matters more here than in [[stream-io-ex]]: nothing has been emitted yet, so
  `call-llm`'s own \"nothing emitted\" guard would not stop a replay."
  [^IOException e auth timeout-ms]
  (if (instance? SocketTimeoutException e)
    (ex-info (tru "The Ollama server did not respond within {0}ms. A cold model load happens on the first request — retry once it is warm, or raise the Ollama request timeout."
                  (str timeout-ms))
             {:api-error  true
              :error-code :ollama-timeout
              :retryable? false}
             e)
    (unreachable-ex e auth {:retryable? false})))

(defn- io-guarded
  "Surface an `IOException` raised while *consuming* the stream as [[stream-io-ex]]; the adapter's
  own `try` covers only establishing the request.

  Goes inside `core/reducible-with-api-errors`, never outside — [[stream-io-ex]] tags `:api-error`,
  which `rethrow-api-error!` passes through, so this translation wins for IO."
  [reducible timeout-ms]
  (reify clojure.lang.IReduceInit
    (reduce [_ rf init]
      (try
        (.reduce ^clojure.lang.IReduceInit reducible rf init)
        (catch IOException e
          (throw (stream-io-ex e timeout-ms)))))))

(mu/defn ollama-raw
  "Stream a Chat Completions request. `:credentials` come from the connection serving it;
  `:ai-proxy?` is unsupported and throws. `plan` may be supplied by a caller that already has one, so
  that a request derives it once."
  ([opts :- core/LLMRequestOpts]
   (ollama-raw opts (forced/plan opts (conn/cloud? (:credentials opts)))))

  ([{:keys [model tools credentials ai-proxy?] :as opts} :- core/LLMRequestOpts
    plan                                                 :- [:maybe :map]]
   (when (str/blank? model) (throw (missing-model-ex)))
   (let [req        (ollama-request-body opts plan)
         timeout-ms (llm/llm-ollama-request-timeout-ms)
         ;; before the `try`, so the IO handler can name the address actually called — a Cloud
         ;; connection carries no `:base-url` of its own
         auth       (conn/auth credentials ai-proxy?)]
     (log/debug "Ollama request" {:model model :msg-count (count (:messages req)) :tools (count (or tools []))})
     (with-span :info {:name       :metabot.ollama/request
                       :model      model
                       :msg-count  (count (:messages req))
                       :tool-count (count (or tools []))
                       :forced     (:mechanism plan)}
       (try
         (let [response (core/request auth
                                      (merge {:method  :post
                                              :url     "/chat/completions"
                                              :as      :stream
                                              :headers {"Content-Type" "application/json"}
                                              :body    (json/encode req)}
                                             (inference-timeouts)))]
           (-> (core/sse-reducible (:body response))
               (debug/capture-stream {:provider "ollama"
                                      :model    model
                                      :url      "/chat/completions"
                                      :request  req})
               (io-guarded timeout-ms)
               (core/reducible-with-api-errors "ollama" ollama-error-msg)))
         ;; Ordered: clj-http raises an `IOException` only when there is no response at all, so this
         ;; cannot swallow one `ollama-error-msg` would have translated.
         (catch IOException e
           (throw (request-io-ex e auth timeout-ms)))
         (catch Exception e
           (core/rethrow-api-error! "ollama" ollama-error-msg e)))))))

(defn ollama->aisdk-chunks-xf
  "Chat Completions chunks to AI SDK v5. Reasoning is forwarded when present, which is self-gating —
  the field only appears for a reasoning model. Ollama adds no `finish_reason` beyond OpenAI's."
  []
  (chat-completions/chat-completions->aisdk-chunks-xf chat-completions/stop-reasons
                                                      {:forward-reasoning? true}))

(defn ollama
  "Call an Ollama server's Chat Completions API, return AISDK stream."
  [{:keys [credentials] :as opts}]
  (let [plan (forced/plan opts (conn/cloud? credentials))]
    (eduction (comp (or (forced/read-back-xf plan) identity)
                    (ollama->aisdk-chunks-xf))
              (ollama-raw opts plan))))
