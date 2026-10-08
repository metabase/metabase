(ns metabase.metabot.self.ollama
  "Ollama adapter, for a self-hosted Ollama server or Ollama Cloud.

  A sibling of [[metabase.metabot.self.vllm]] rather than a layer over it — same Chat Completions
  transport, but Ollama has no server flags to point an admin at, so every diagnosis differs.

  https://docs.ollama.com/api/openai-compatibility"
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase.llm.settings :as llm]
   [metabase.metabot.self.adapter :as adapter]
   [metabase.metabot.self.core :as core]
   [metabase.metabot.self.ollama.capabilities :as caps]
   [metabase.metabot.self.ollama.connection :as conn]
   [metabase.metabot.self.ollama.forced-calls :as forced]
   [metabase.metabot.self.openai.chat-completions :as chat-completions]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu])
  (:import
   (com.fasterxml.jackson.core JsonProcessingException)
   (java.io IOException)
   (java.net SocketTimeoutException)))

(set! *warn-on-reflection* true)

(defn- missing-model-ex []
  (ex-info (tru "No Ollama model is set")
           {:api-error  true
            :error-code :model-missing}))

(def ^:private provider
  "Ollama's descriptor. No `:supports-ai-proxy?`, so [[adapter/request!]] refuses a proxied request: the
  proxy fronts hosted providers, and Ollama, self-hosted or Cloud, is reached directly."
  (adapter/provider
   {:slug           "ollama"
    :display-name   "Ollama"
    :auth           conn/auth
    ;; no `:error-fallback`: that key carries an adapter's own `HTTP {0}` msgid where one already has
    ;; shipped translations. Ollama's has none, so it takes the shared msgid, which renders the same English.
    :errors         {400 #(tru "Ollama rejected the request — usually a model that cannot produce the requested tool call or JSON schema")
                     401 #(tru "Ollama rejected the API key")
                     404 #(tru "Ollama API endpoint was not found — the base URL should end in /v1, and the model must already be available")
                     429 #(tru "Ollama is rate limiting this instance — wait and retry, or reduce concurrent Metabot use")
                     500 #(tru "Ollama returned an internal server error")}}))

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

(defn- probe-timeouts
  "Timeouts for a preflight probe, capped at [[adapter/probe-timeout-ceiling-ms]]."
  []
  {:socket-timeout     (min (llm/llm-ollama-request-timeout-ms) adapter/probe-timeout-ceiling-ms)
   :connection-timeout (llm/llm-connection-timeout-ms)})

;;; ----------------------------------------------- Transport errors ---------------------------------------------

(defn- unreachable-ex
  "The Ollama error for a non-timeout transport failure. `extra` is the caller's own ex-data tags."
  [^IOException e url extra]
  (ex-info (tru "Could not reach Ollama at {0}. Check that it is reachable from the Metabase server."
                (str url))
           (merge {:api-error true :error-code :ollama-unreachable} extra)
           e))

(defn- list-models-io-ex
  "Transport failure while fetching the catalog — the request behind the Connect button. Tagged 400
  so a mistyped base URL surfaces this message rather than a 500."
  [^IOException e url]
  (if (instance? SocketTimeoutException e)
    (ex-info (tru "The Ollama server at {0} did not respond within {1}ms. Check that it is running and not loading a model."
                  (str url) (str (llm/llm-request-timeout-ms)))
             {:api-error   true
              :status-code 400
              :error-code  :ollama-timeout}
             e)
    (unreachable-ex e url {:status-code 400})))

;;; ------------------------------------------------ Model listing -----------------------------------------------

(defn- list-all-models
  "Fetch the pulled model catalog. Doubles as the credential round-trip behind the Connect button,
  and fails closed on a 2xx whose body is not a catalog — a mistyped base URL is the likeliest cause.

  Not [[adapter/fetch-catalog]]: that renders a 2xx-but-not-a-catalog failure with the shared message,
  and the address is the one thing an Ollama admin types, so naming it is the whole diagnosis."
  [{:keys [credentials] :as req}]
  ;; the URL off the request credentials, not the setting: a connect verifies them before they are saved
  (let [url    (conn/base-url credentials)
        detail (tru "Check that {0} is an Ollama server''s OpenAI-compatible API — the base URL should end in /v1."
                    (str url))]
    (try
      (let [res (adapter/request! provider
                                  (assoc req :method :get :path "/models" :as :json)
                                  (control-timeouts))]
        (chat-completions/models-catalog "Ollama" res {:detail detail}))
      ;; Ordered ahead of the `IOException` catch, which Jackson's parse error is one of: a 2xx whose
      ;; body is not JSON means the server answered, so the address is wrong rather than unreachable.
      (catch JsonProcessingException e
        (throw (chat-completions/malformed-catalog-ex "Ollama" detail e)))
      ;; Ordered ahead of the generic catch, which a non-2xx still reaches as an `ExceptionInfo`.
      (catch IOException e
        (throw (list-models-io-ex e url)))
      (catch Exception e
        (adapter/rethrow! provider e)))))

;;; -------------------------------------------------- Preflight -------------------------------------------------

(defn- preflight-ex
  "A preflight failure, tagged so `metabase.metabot.api` surfaces the message verbatim, not as a 500.

  `data` may carry `::server-wide?`, for a failure every model on the server would hit as well, which
  ends [[preflight!]]'s search rather than moving it on to the next model — see
  [[model-specific-failure?]]."
  ([msg] (preflight-ex msg nil))
  ([msg data]
   (ex-info msg (merge {:api-error   true
                        :status-code 400
                        :error-code  :ollama-preflight-failed}
                       data))))

(defn- probe-chat!
  "One non-streaming Chat Completions turn, returning the first choice. `body` carries what differs
  between probes — the messages, and either a tool or a `response_format`. `finish_reason` comes back
  with it because truncation and a model that cannot call tools both produce empty `tool_calls`."
  [req model body]
  (let [res (adapter/request! provider
                              (assoc req
                                     :method :post
                                     :path   "/chat/completions"
                                     :as     :json
                                     :body   (json/encode (merge {:model       model
                                                                  :temperature 0
                                                                  :max_tokens  adapter/probe-max-tokens}
                                                                 body)))
                              (probe-timeouts))]
    (get-in res [:body :choices 0])))

(defn- check-tool-calling!
  "Check that the model can call the tool it is offered, with the arguments that tool declares. Ollama
  drives tool calling from the model's own template, so the fix is always a different model.

  Whether it thought along the way is not recorded — `/api/show` answers that per model, for every
  model rather than only the probed one. Thinking is still read here, to tell \"spent the budget
  thinking\" apart from \"generated too much\" when nothing came back."
  [req model]
  (let [{:keys [message finish_reason]} (probe-chat! req model {:messages adapter/probe-messages
                                                                :tools    [adapter/probe-tool]})
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
      (let [{:keys [function]}                          (first tool-calls)
            {offered :name {required :required} :parameters} (:function adapter/probe-tool)
            parsed                                      (try (json/decode+kw (str (:arguments function)))
                                                             (catch Exception _ nil))]
        (cond
          (not= offered (:name function))
          (throw (preflight-ex
                  (tru "{0} called ''{1}'' instead of the one tool it was offered. The agent loop runs only the tools it registers and drops anything else without a word, so a model that invents names cannot drive Metabot — pick a larger or more capable one."
                       (str model) (str (:name function)))))

          (not (map? parsed))
          (throw (preflight-ex
                  (if truncated?
                    (tru "{0} reached the {1} token connection-test ceiling before completing a tool call. A model that generates this much before calling a tool is too slow to drive Metabot."
                         (str model) (str adapter/probe-max-tokens))
                    (tru "{0} returned a tool call whose arguments are not valid JSON. Pull a larger or more capable model — Metabot needs reliable tool calling."
                         (str model)))))

          :else
          (when-let [missing (seq (remove #(u/trimmed-string (get parsed (keyword %))) required))]
            (throw (preflight-ex
                    (tru "{0} called the tool without its required {1} argument. Metabot validates every tool call against that tool''s schema — pick a larger or more capable model."
                         (str model) (str/join ", " missing)))))))

      (and truncated? (not (str/blank? reasoning)))
      (throw (preflight-ex
              (tru "{0} spent the entire {1} token connection-test budget reasoning without calling a tool. A model that thinks this long about a trivial prompt is too slow to drive Metabot."
                   (str model) (str adapter/probe-max-tokens))))

      truncated?
      (throw (preflight-ex
              (tru "{0} reached the {1} token connection-test ceiling before completing a tool call. A model that generates this much before calling a tool is too slow to drive Metabot."
                   (str model) (str adapter/probe-max-tokens))))

      :else
      (throw (preflight-ex
              (tru "{0} answered with text instead of calling a tool. Metabot needs a model that supports tool calling — pick a different one."
                   (str model)))))))

(defn- check-structured-output!
  "Check that the connection can actually deliver structured output, through the mechanism it will
  really use — [[forced/probe-body]] decides which that is, and [[forced/probe-verdict]] reads the
  answer.

  The remedy is what differs between a self-hosted model and one Ollama Cloud serves, so only the
  message branches here. Self-hosted can fail on the *server* rather than the model, because an Ollama
  too old to read `response_format` ignores it and the model answers in prose. Cloud cannot fail that
  way: nothing there was ever going to enforce it, so a model that will not take the instruction has
  to be caught at connect — nothing downstream can repair it."
  [{:keys [credentials] :as req} model]
  (let [cloud? (conn/served-by-cloud? credentials model)
        choice (probe-chat! req model (forced/probe-body cloud?))]
    (when-let [verdict (forced/probe-verdict cloud? choice)]
      (throw (preflight-ex
              (case verdict
                :truncated
                (tru "{0} reached the {1} token connection-test ceiling before completing the structured answer it was asked for. Metabot needs structured output for conversation titles and SQL generation."
                     (str model) (str adapter/probe-max-tokens))

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
  newest-first, so a newest pull that is an embedding model would otherwise fail a connect against a
  server with a perfectly good chat model on it — with no way out, since the form hides the model
  picker for a type whose catalog is not fixed. A server that rules every model out is told so,
  rather than being handed one to probe and failing on whatever that model happens to do; a server
  that reports nothing rules nothing out, so it still gets its first entry.

  `entries` is the whole catalog as [[tag-chat-capable]] left it, not the subset [[list-models]]
  offers, so that a model requested by name is answered about rather than reported missing."
  [entries requested-model]
  (if requested-model
    (let [entry (or (u/seek #(= requested-model (:id %)) entries)
                    (throw (if (seq entries)
                             (preflight-ex (tru "{0} is not available. Models on offer: {1}."
                                                (str requested-model) (str/join ", " (map :id entries))))
                             (no-models-ex))))]
      ;; `::chat?` needs both `completion` and `tools`. Ollama gives tool calling only through the completion
      ;; template, so a model that reports `tools` also reports `completion`. Thus, a model that fails this
      ;; check cannot call tools: an embedding model has neither, and some chat models have no `tools`.
      (when-not (::chat? entry)
        (throw (preflight-ex (tru "{0} can''t call tools, which Metabot needs. Pick a model that supports tool calling."
                                  (str requested-model)))))
      entry)
    (or (u/seek ::chat? entries)
        (throw (if (seq entries)
                 (preflight-ex (tru "None of the models on this server can chat and call tools. Pull one that can, then connect again."))
                 (no-models-ex))))))

(defn- run-probe!
  "Run one contract probe, `check!`, against `model`, turning a timeout into its own diagnosis and any
  other failure into the provider's."
  [check! req model]
  (try
    (check! req model)
    (catch SocketTimeoutException _
      (throw (preflight-ex
              (tru "Ollama did not answer the connection test within {0}ms. On a self-hosted server the first request also loads the model into memory — if it is large, retry once it is warm, otherwise it is too slow to drive Metabot."
                   (str (:socket-timeout (probe-timeouts))))
              ;; the next model would load just as slowly
              {::server-wide? true})))
    (catch Exception e
      (adapter/rethrow! provider e))))

(defn- check-native-api!
  "Warn when Ollama's own API is out of reach, typically behind a proxy that forwards only `/v1`.

  Nothing on it is required, so connecting still succeeds, but the `/api/show` and `/api/ps` lookups
  then fail quietly on every request: thinking models get the smaller token budget and the context-window
  check is skipped. `/api/version` because it takes nothing and ollama.com serves it too. The message is
  logged, not the exception, whose ex-data can carry the response."
  [credentials]
  (try
    (adapter/request! conn/native-provider
                      {:credentials credentials :method :get :path "/api/version" :as :json}
                      (control-timeouts))
    (catch Exception e
      (log/warnf (str "Ollama at %s did not answer /api/version (%s). A proxy in front of it has to forward /api/ "
                      "as well as /v1/, or thinking models get the smaller token budget and the context window "
                      "check is skipped.")
                 (conn/base-url credentials) (ex-message e)))))

(defn- loaded-context-length
  "The context window Ollama loaded `model` with, from `/api/ps`, or nil when it would not say.

  [[conn/native-provider]], because `/api/ps` is on Ollama's own API rather than the OpenAI-compatible
  surface the adapter's own descriptor authenticates."
  [credentials model]
  (try
    (let [res (adapter/request! conn/native-provider
                                {:credentials credentials :method :get :path "/api/ps" :as :json}
                                (control-timeouts))]
      (some (fn [{:keys [name context_length] :as entry}]
              ;; `/api/ps` names a loaded model under both keys, and they agree except where a
              ;; Modelfile gave it another name
              (when (and (or (= model (:model entry)) (= model name))
                         (pos-int? context_length))
                context_length))
            (get-in res [:body :models])))
    (catch Exception e
      (log/debug e "Ollama did not report a context window" {:model model})
      nil)))

(defn- check-context-budget!
  "Fail a connection whose model runs with a window too small to hold Metabot's prompt.

  No field in a request can make the window larger: Ollama's OpenAI-compatible surface has no `num_ctx`
  field. A prompt that is too long does not cause an error. Ollama makes it shorter in two stages. First,
  it removes the oldest messages until the prompt fits, but it keeps the system messages and the last
  message. If the prompt is still too long, context shift (on by default) keeps the first few tokens and
  the end, and removes the middle. The tools and the system prompt are in the middle, so Metabot would
  run without its instructions and without tools it can name.

  The probes cannot show this. They are one-line prompts that fit in any window, so the truncation
  they would reveal is of the *answer*; this truncates the *question*.

  The remedy differs by host. On a self-hosted server the window is server configuration. Cloud already
  runs a model at its largest window, so a small window is the limit of the model, and the admin can only
  pick a different one."
  [credentials model]
  (when-let [window (loaded-context-length credentials model)]
    (when (< window adapter/min-context-window-tokens)
      (throw (preflight-ex
              (if (conn/served-by-cloud? credentials model)
                (tru "{0} runs with a {1} token context window, which is too small for Metabot. Pick a model with a context window of at least {2} tokens."
                     (str model) (str window) (str adapter/min-context-window-tokens))
                (tru "{0} runs with a {1} token context window, which is too small for Metabot. Configure Ollama to load the model with a context window of at least {2} tokens."
                     (str model) (str window) (str adapter/min-context-window-tokens))))))))

(def ^:private max-fallback-candidates
  "How many chat models the connect path tries before giving up. Each costs a model load and two
  generations, so the bound is what keeps a server with a long catalog from stalling the connect."
  3)

(defn- preflight-model!
  "Run every check against `model`, returning it, and throw on the first failure.

  Cheapest first, each where it can first be answered. Tool calling leads: structured output only means
  anything once it works. The context window comes next — it is a lookup on `/api/ps`, but one that
  can only answer once a probe has loaded the model — so a window too small costs one generation
  rather than two. Which structured-output probe runs depends on whether Ollama Cloud serves the model,
  because the mechanism does — see [[metabase.metabot.self.ollama.forced-calls/probe-body]].

  Sequential: concurrency would not help — Ollama serializes generation per model unless
  `OLLAMA_NUM_PARALLEL` is raised, and a losing probe cannot be called off: `future-cancel` interrupts,
  and a blocking socket read ignores interrupts."
  [{:keys [credentials] :as req} model]
  (run-probe! check-tool-calling! req model)
  (check-context-budget! credentials model)
  (run-probe! check-structured-output! req model)
  model)

(defn- model-specific-failure?
  "Whether `e`, thrown while preflighting one model, is about that model alone, so that
  [[preflight!]]'s search moves on to the next one.

  Two HTTP statuses are, on Ollama: 500 for a model too large to load (\"model requires more system
  memory\"), and 400 for one whose template has no tool support, which only a probe finds out when
  `/api/show` will not say."
  [e]
  (let [{:keys [error-code status] :as data} (ex-data e)]
    (case error-code
      :ollama-preflight-failed (not (::server-wide? data))
      :provider-api-error      (contains? #{400 500} status)
      false)))

(defn- preflight!
  "Exercise the agent loop's contract against the model that will actually serve it, returning that
  model's id. The connect path must adopt exactly this model rather than re-deriving it from the
  listing, which agrees only while nothing reorders the catalog.

  A model asked for by name is the only one probed. The connect path names none, and the form offers
  no picker for Ollama, so a failing model there would leave the admin no way forward: it moves on to
  the next chat model, newest first, up to [[max-fallback-candidates]] of them. A failure that is
  not the model's own — see [[model-specific-failure?]] — ends the search."
  [req entries requested-model]
  (check-native-api! (:credentials req))
  (if requested-model
    (preflight-model! req (:id (probe-target entries requested-model)))
    (let [candidates (->> entries (filter ::chat?) (map :id) (take max-fallback-candidates))
          errors     (volatile! [])]
      ;; nothing to try: [[probe-target]] says why
      (when (empty? candidates)
        (probe-target entries nil))
      (or (some (fn [model]
                  (try
                    (preflight-model! req model)
                    (catch clojure.lang.ExceptionInfo e
                      (when-not (model-specific-failure? e)
                        (throw e))
                      (vswap! errors conj e)
                      nil)))
                candidates)
          (let [[newest & others] @errors]
            (throw (if others
                     (preflight-ex
                      (tru "None of the models tried can drive Metabot ({0}). {1}"
                           (str/join ", " candidates)
                           ;; the newest model's reason, the one an admin is likeliest to act on
                           (ex-message newest)))
                     newest)))))))

(defn- tag-chat-capable
  "`entries` with `::chat?` on each, saying whether Ollama offers that model for chat at all.

  Tagged rather than filtered because the two readers want different views of the same answer: the
  picker wants only the chat models, [[probe-target]] wants the whole catalog so it can say *why* a
  model named by hand is no good. Asking once is what keeps this from being two passes."
  [credentials entries]
  (let [capable (caps/chat-capable-ids credentials (map :id entries))]
    (mapv #(assoc % ::chat? (contains? capable (:id %))) entries)))

(mu/defn list-models :- adapter/ModelListing
  "The models the server has pulled that Metabot could run on, so the admin's picker only offers
  models a connection can actually be saved against — see [[tag-chat-capable]].

  `:probe?` also runs [[preflight!]] and returns what it learned as `:connection-info` for the connect
  path to store. Reserved for connect and edit: probing on every listing would stall the model picker
  behind a full model load. `:proposed-model` is ignored: an edit falls back over the chat models as a
  connect does, so a stored model that no longer passes cannot block it."
  ([] (list-models {}))
  ([{:keys [credentials ai-proxy? model probe?]} :- adapter/ListOpts]
   (let [req      {:credentials credentials :ai-proxy? ai-proxy?}
         catalog  (tag-chat-capable credentials (list-all-models req))
         entries  (filterv ::chat? catalog)
         probed   (when probe?
                    (preflight! req catalog model))
         models   (mapv (fn [{:keys [id] :as entry}]
                          {:id id :display_name (or (:name entry) id)})
                        entries)]
     (merge {:models models}
            (when probed
              {:connection-info {:probed-model probed}})))))

;;; --------------------------------------------------- Requests -------------------------------------------------

(defn- forced-plan
  "How `opts`' forced tool call is expressed, decided by whether Ollama Cloud serves the requested model —
  see [[conn/served-by-cloud?]]. Per request rather than per connection: Metabot and the mini model can be
  on the same connection, and only one of them a Cloud model."
  [{:keys [credentials model] :as opts}]
  (forced/plan opts (conn/served-by-cloud? credentials model)))

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
  [[adapter/default-temperature]]; and the model's thinking is replayed (see [[reasoning-message]]). They
  stay here rather than in the shared builder, which also serves Z.AI, Mistral and OpenRouter.

  A forced tool call is [[metabase.metabot.self.ollama.forced-calls]]' subject, because `tool_choice`
  does nothing on Ollama and what can be done instead depends on who serves the model — see [[forced-plan]].
  `plan` may be supplied by a caller that already has one — the streaming path does — so that a request
  derives it once.

  The reasoning floor is looked up rather than read off the connection, because one connection serves
  as many models as the operator has pulled — see
  [[metabase.metabot.self.ollama.capabilities/reasoning-model?]]. It is answered from cache after the
  first request on a model.

  We never tell Ollama whether to think, just as vLLM does not. Both run whatever model the operator
  installed, so we take that model's own default and leave room for it with the floors above.
  Ollama does have a `reasoning_effort` switch, but turning thinking off would only save tokens on
  the operator's own hardware, and it errors on models that cannot think at all."
  ([opts :- core/LLMRequestOpts]
   (ollama-request-body opts (forced-plan opts)))

  ([{:keys [max-tokens model temperature credentials reasoning?] :as opts
     :or   {reasoning? true}} :- core/LLMRequestOpts
    plan                      :- [:maybe ::forced/plan]]
   (forced/body-for
    plan
    (assoc (ollama-reasoning-spelling
            (chat-completions/request-body
             (cond-> (forced/opts-for plan opts)
               (nil? temperature) (assoc :temperature adapter/default-temperature))
             (when reasoning? {:reasoning-part->message reasoning-message})))
           :max_tokens (cond-> (or max-tokens (llm/llm-max-tokens))
                         (some? plan)
                         (max adapter/forced-tool-call-token-floor)

                         (caps/reasoning-model? credentials model)
                         (max adapter/reasoning-model-token-floor))))))

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
  [^IOException e url timeout-ms]
  (if (instance? SocketTimeoutException e)
    (ex-info (tru "The Ollama server did not respond within {0}ms. A cold model load happens on the first request — retry once it is warm, or raise the Ollama request timeout."
                  (str timeout-ms))
             {:api-error  true
              :error-code :ollama-timeout
              :retryable? false}
             e)
    (unreachable-ex e url {:retryable? false})))

(mu/defn ollama-raw
  "Stream a Chat Completions request. `:credentials` come from the connection serving it; `:ai-proxy?` is
  unsupported and throws. `plan` may be supplied by a caller that already has one, as in
  [[ollama-request-body]]."
  ([opts :- core/LLMRequestOpts]
   (ollama-raw opts (forced-plan opts)))

  ([{:keys [model credentials] :as opts} :- core/LLMRequestOpts
    plan                                 :- [:maybe ::forced/plan]]
   (when (str/blank? model) (throw (missing-model-ex)))
   (let [timeout-ms (llm/llm-ollama-request-timeout-ms)]
     (adapter/stream! provider opts
                      {:path             "/chat/completions"
                       :body             (ollama-request-body opts plan)
                       :request-options  (inference-timeouts)
                       :span-attrs       {:forced (some-> (:mechanism plan) name)}
                       :wrap-stream      #(adapter/io-guarded % (fn [e] (stream-io-ex e timeout-ms)))
                       ;; clj-http raises an `IOException` only when there is no response at all, so the
                       ;; IO branch cannot swallow a failure the provider's own messages would translate.
                       :on-request-error (fn [e]
                                           (if (instance? IOException e)
                                             (throw (request-io-ex e (conn/base-url credentials) timeout-ms))
                                             (adapter/rethrow! provider e)))}))))

(mu/defn streams-reasoning? :- :boolean
  "Registry capability. Ollama answers per *model*, from what the server reports about it — a connection
  serves every model the operator pulled, and Metabot and the mini model need not be on the same one, so
  no flag on the connection could describe both.

  The cached reader, never the one that would call Ollama: this backs the public
  `llm-metabot-supports-reasoning?` setting, so every client's page load reaches it and none of them may
  wait on the operator's server."
  [{:keys [credentials model]} :- adapter/ResolvedRef]
  (caps/cached-reasoning-model? credentials model))

(defn ollama->aisdk-chunks-xf
  "Chat Completions chunks to AI SDK v5. Reasoning is forwarded when present, which is self-gating —
  the field only appears for a reasoning model. Ollama adds no `finish_reason` beyond OpenAI's."
  []
  (chat-completions/chat-completions->aisdk-chunks-xf chat-completions/stop-reasons
                                                      {:forward-reasoning? true}))

(defn- unfinished-stream-xf
  "Fail a stream that ends without saying why it ended.

  When generation fails after the first token — the runner crashing, or a model's parser rejecting a
  malformed tool call — Ollama's OpenAI layer sends the error as an empty chunk and closes the stream with
  no `finish_reason` and no `[DONE]`. Passed through, the partial text would read as a complete answer.
  Its own error chunk, emitted before the stream completes, lets the shared translation close whatever
  block is open and fail the turn the way a reported error does. A consumer that stopped reading early
  ended the stream itself, so nothing is added then."
  []
  (fn [rf]
    ;; set once the stream said why it ended, or the consumer ended it
    (let [done? (volatile! false)]
      (fn
        ([] (rf))
        ([result]
         (rf (if @done?
               result
               (unreduced (rf result {:error {:message (tru "The Ollama server ended the response before finishing it.")}})))))
        ([result {:keys [choices error] :as chunk}]
         (let [result (rf result chunk)]
           (when (or (reduced? result) (some? error) (some :finish_reason choices))
             (vreset! done? true))
           result))))))

(defn ollama
  "Call an Ollama server's Chat Completions API, return AISDK stream."
  [opts]
  (let [plan (forced-plan opts)]
    (eduction (comp (or (forced/read-back-xf plan) identity)
                    (unfinished-stream-xf)
                    (ollama->aisdk-chunks-xf))
              (ollama-raw opts plan))))
