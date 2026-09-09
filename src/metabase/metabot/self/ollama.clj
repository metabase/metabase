(ns metabase.metabot.self.ollama
  "Ollama adapter for self-hosted, OpenAI-compatible inference servers.

  Ollama serves the Chat Completions API under `/v1`, so the transport is the same one
  [[metabase.metabot.self.vllm]] uses. It is a sibling of that adapter rather than a layer over it:
  the code is near-identical but every diagnosis differs, because Ollama has no server flags to point
  an admin at. Where vLLM says \"restart with --tool-call-parser\", Ollama's answer is \"pull a model
  whose capabilities include tools\", and the difference is the whole reason this provider type
  exists — an Ollama operator sent to vLLM's messages is sent somewhere they cannot act.

  It serves both Ollama deployments: cloud and self-hosted.
  https://docs.ollama.com/api/openai-compatibility"
  (:require
   [clojure.string :as str]
   [metabase.llm.provider :as llm.provider]
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
   (java.io IOException)
   (java.net SocketTimeoutException)))

(set! *warn-on-reflection* true)

(defn- ai-proxy-unsupported-ex []
  (ex-info (tru "AI proxy is not supported for Ollama")
           {:api-error  true
            :error-code :proxy-unsupported}))

(defn- missing-base-url-ex []
  ;; `:status-code` matters: `provider-client-error?` needs a numeric status to render this under the
  ;; base URL field, and without one the admin gets a 500. vLLM never reaches here because its base
  ;; URL is `:required?`; Ollama's is conditional, so the adapter owns the error.
  (ex-info (tru "No Ollama base URL is set. Give the address of your server, or switch this connection to Ollama Cloud.")
           {:api-error   true
            :status-code 400
            :field       :base-url
            :error-code  :base-url-missing}))

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
      500 (tru "Ollama returned an internal server error")
      (tru "Ollama API error (HTTP {0})" status))))

(def reasoning-config-key
  "The connection `:config` key [[preflight!]]'s reasoning observation is recorded under. It is not an
  admin-entered field: whether a pulled model reasons depends on the model's own template, so only
  the probe can answer it."
  :model-reasoning)

(defn reasoning-connection?
  "Whether the connection carrying `credentials` was observed streaming its reasoning. A hand-written
  `llm-providers` can hold a JSON boolean where the API stores the string it round-trips."
  [credentials]
  (let [recorded (get credentials reasoning-config-key)]
    (or (true? recorded) (= "true" recorded))))

(def cloud-base-url
  "Ollama Cloud's OpenAI-compatible API. The one Ollama address we can know: a self-hosted server is
  wherever the operator put it, but the hosted service is always here."
  "https://ollama.com/v1")

(defn- cloud?
  "Whether a connection is Ollama Cloud."
  [credentials]
  (= llm.provider/ollama-cloud (:hosting credentials)))

(defn- resolve-base-url
  "The address to call, from a connection's `:hosting` mode and `:base-url`.

  Cloud has one address, so it is not configurable and any stored `:base-url` is ignored. A
  self-hosted connection is wherever the operator put it, and one carrying no address throws rather
  than quietly falling through to Cloud, which would send their data somewhere they did not choose."

  [credentials]
  (if (cloud? credentials)
    cloud-base-url
    (or (not-empty (:base-url credentials)) (throw (missing-base-url-ex)))))

(defn- ollama-auth
  "Auth map for an Ollama request. The map is never nil, so `core/resolve-auth` cannot reach its
  `missing-api-key-ex` branch — a keyless self-hosted server is a complete configuration, and is in
  fact the normal one."
  [credentials ai-proxy?]
  (when ai-proxy? (throw (ai-proxy-unsupported-ex)))
  (let [token (not-empty (:api-key credentials))
        auth  (merge {:url (resolve-base-url credentials)}
                     (when token {:headers {"Authorization" (str "Bearer " token)}}))]
    (core/resolve-auth "ollama" "Ollama" auth ai-proxy?)))

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
  "Timeouts for a preflight probe. An operator who lowers `llm-ollama-request-timeout-ms` below the
  ceiling gets their own value."
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
  "The Ollama error for a transport failure while fetching the model catalog — the request behind the
  admin Connect button. Tagged `:status-code 400` so a mistyped base URL surfaces the message rather
  than the 500 `core/rethrow-api-error!`'s untagged no-response branch would produce."
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
  "Fetch the pulled model catalog, which doubles as the credential round-trip behind the admin
  Connect button.

  A 2xx whose body is not a recognizable catalog fails closed via
  [[chat-completions/models-catalog]], naming the base URL — the likeliest cause for a provider whose
  base URL the admin types."
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
  is billed against it: a probe that stops at `length` before the tool call looks identical to a
  model that will not call tools at all."
  2048)

(def ^:private forced-tool-call-token-floor
  "Smallest `max_tokens` a forced tool call is given, regardless of what the caller asked for — below
  it a reasoning model spends the budget thinking and emits no tool call. Equal to
  [[probe-max-tokens]], which [[preflight!]] already proves the pulled model can clear."
  probe-max-tokens)

(def ^:private reasoning-model-token-floor
  "Smallest `max_tokens` any request gets once [[preflight!]] has observed the pulled model reasoning.
  Chat Completions bills thinking, answer, and tool call against one budget."
  16384)

(def ^:private default-temperature
  "Sampling temperature for a caller that supplies none. Ollama defaults per-model via the Modelfile,
  commonly to values far too high for the tool-calling and SQL-generation work the agent loop does.
  The hosted providers pick a sane default server-side; a self-hosted server does not, so the adapter
  supplies one."
  0.3)

(defn- preflight-ex
  "A preflight failure, tagged so `metabase.metabot.api` surfaces the message verbatim, not as a 500."
  [msg]
  (ex-info msg {:api-error   true
                :status-code 400
                :error-code  :ollama-preflight-failed}))

(defn- probe-chat!
  "Run one non-streaming Chat Completions turn against `model` and return the first choice. The
  `finish_reason` is part of the return value because a generation truncated at
  [[probe-max-tokens]] and a model that will not call tools both produce empty `tool_calls`."
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

(defn- check-tool-calling!
  "Check that the model can call tools. Ollama drives tool calling from the model's own template
  rather than from server flags, so the fix is always a different model — there is nothing to
  reconfigure.

  Returns whether the model emitted reasoning, the only signal anywhere that it is a reasoning model."
  [auth model]
  (let [{:keys [message finish_reason]} (probe-chat! auth model "auto")
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
  "Check that the model honors a forced tool call. A different failure from [[check-tool-calling!]]: a
  model can manage an optional tool call and still ignore a forced one, which chats fine but breaks
  titling and the whole `sql` profile."
  [auth model]
  (let [{:keys [message finish_reason]} (probe-chat! auth model "required")]
    (when (empty? (:tool_calls message))
      (throw (preflight-ex
              (if (= "length" finish_reason)
                (tru "{0} reached the {1} token connection-test ceiling without producing a forced tool call. Metabot needs structured output support for conversation titles and SQL generation."
                     (str model) (str probe-max-tokens))
                (tru "{0} did not honor a forced tool call. Metabot needs structured output support for conversation titles and SQL generation — pull a larger or more capable model."
                     (str model))))))))

(defn- no-models-ex []
  (preflight-ex (tru "Ollama is reachable but is offering no models.")))

(defn- probe-target
  "The catalog entry [[preflight!]] will probe.

  A requested model is the only acceptable target: falling back to another pulled model would pass
  every check and then persist a provider string naming a model the server does not have. The
  fallback is for the connect path, which supplies no model because the pulled name is knowable only
  from this catalog."
  [entries requested-model]
  (if requested-model
    (or (u/seek #(= requested-model (:id %)) entries)
        (throw (if (seq entries)
                 (preflight-ex (tru "{0} is not available. Models on offer: {1}."
                                    (str requested-model) (str/join ", " (map :id entries))))
                 (no-models-ex))))
    (or (first entries)
        (throw (no-models-ex)))))

(defn- run-probes!
  "Run both contract probes against `model` and return whether it streamed reasoning.

  Sequential, tool calling first: it is the more actionable diagnosis when a model fails both, and
  structured output is only meaningful once tool calling works, so stopping at the first failure is
  strictly less work than running them together. Running them concurrently would also not buy the
  wall-clock it looks like — Ollama serializes generation per model unless the operator raised
  `OLLAMA_NUM_PARALLEL`, and a losing probe could not be called off anyway: `future-cancel`
  interrupts, and the blocking socket read these park in ignores interrupts."
  [auth model]
  (try
    (let [reasoning? (check-tool-calling! auth model)]
      (check-structured-output! auth model)
      reasoning?)
    (catch SocketTimeoutException _
      (throw (preflight-ex
              (tru "Ollama did not answer the connection test within {0}ms. On a self-hosted server the first request also loads the model into memory — if it is large, retry once it is warm, otherwise it is too slow to drive Metabot."
                   (str (:socket-timeout (probe-timeouts)))))))
    (catch Exception e
      (core/rethrow-api-error! "ollama" ollama-error-msg e))))

(defn- preflight!
  "Exercise the contract the agent loop depends on, against the model that will actually be used, and
  return `{:model id :reasoning? bool}`. The connect path must adopt exactly this model rather than
  re-deriving it from the listing, which agrees only while nothing reorders the catalog.

  There is no context-window check here, unlike vLLM's: Ollama's catalog carries no equivalent of
  `max_model_len`, so nothing at connect time can see the window. A model whose window is too small
  fails the probes above by truncating, and the ceiling messages say so. Operators raise it with
  `OLLAMA_CONTEXT_LENGTH`.

  `:reasoning?` reports whether the probed model streamed reasoning. Only the probe can answer that,
  and the answer drives which renderer the frontend picks, so the connection records it (see
  [[reasoning-config-key]])."
  [auth entries requested-model]
  (let [entry (probe-target entries requested-model)
        model (:id entry)]
    {:model      model
     :reasoning? (run-probes! auth model)}))

(defn list-models
  "List the models the connection's Ollama server has pulled. Pass-through: there is nothing to
  whitelist, and `display_name` falls back to the pulled id.

  `:probe?` additionally runs [[preflight!]], and reports what it determined as `:learned-config`,
  for the connect path to store on the connection: whether the model reasons, and the model it
  exercised, which the connect path adopts as the one to run on. Reserved for the connect and edit
  paths — a tool-call probe on every model listing would stall the admin picker behind a full model
  load. On edit, a `:proposed-model` is re-probed only while the server still has it; otherwise the
  normal candidate selection chooses a replacement."
  ([] (list-models {}))
  ([{:keys [credentials ai-proxy? model proposed-model probe?]}]
   (let [auth     (ollama-auth credentials ai-proxy?)
         entries  (list-all-models auth)
         proposed (when (some #(= proposed-model (:id %)) entries)
                    proposed-model)
         probed   (when probe?
                    (preflight! auth entries (or model proposed)))
         models   (mapv (fn [{:keys [id] :as entry}]
                          {:id id :display_name (or (:name entry) id)})
                        entries)]
     (merge {:models models}
            (when probed
              {:learned-config {reasoning-config-key (str (:reasoning? probed))
                                :probed-model        (:model probed)}})))))

;;; --------------------------------------------------- Requests -------------------------------------------------

(mu/defn ollama-request-body
  "Build the Chat Completions request body for an LLM request.

  Matches what [[chat-completions/request-body]] emits, except that `max_tokens` is always sent —
  without a ceiling a looping small model consumes the whole context window in a single call — and is
  raised to [[forced-tool-call-token-floor]] or [[reasoning-model-token-floor]] where either applies,
  and `temperature` falls back to [[default-temperature]]. All three stay adapter-local rather than
  moving into the shared builder, which would also change Z.AI, Mistral, and OpenRouter."
  [{:keys [max-tokens temperature schema tool_choice credentials] :as opts} :- core/LLMRequestOpts]
  (let [forced? (or (some? schema) (= "required" (some-> tool_choice name)))]
    (assoc (chat-completions/request-body (cond-> opts
                                            (nil? temperature) (assoc :temperature default-temperature)))
           :max_tokens (cond-> (or max-tokens (llm/llm-max-tokens))
                         forced?                             (max forced-tool-call-token-floor)
                         (reasoning-connection? credentials) (max reasoning-model-token-floor)))))

(defn- stream-io-ex
  "The Ollama error for a transport failure while *consuming* a response stream. Tagged
  `:retryable? false`: on a self-hosted server a stalled or severed response means \"too slow\" or
  \"it died\", not \"transient\", and a retry replays a full cold prefill at up to
  `llm-ollama-request-timeout-ms` (300s) apiece. The tag is required — `retryable-error?` walks the
  cause chain and would otherwise match the `IOException` below."
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
  "The Ollama error for a transport failure while *establishing* a request. `core/rethrow-api-error!`
  would render these as \"ollama API request failed: Read timed out\", naming neither the server's
  slowness nor the setting that governs it.

  Tagged `:retryable? false` for the same reason as [[stream-io-ex]], and more importantly: nothing
  has been emitted yet, so `call-llm`'s own \"nothing emitted\" predicate would not stop a replay."
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
  "Wrap a stream reducible so a transport failure while consuming it surfaces as [[stream-io-ex]]
  rather than a raw `IOException`. The adapter's own `try` covers only establishing the request.

  Goes inside `core/reducible-with-api-errors`, never outside: [[stream-io-ex]] tags `:api-error
  true`, which `core/rethrow-api-error!` rethrows unchanged, so this translation wins for IO."
  [reducible timeout-ms]
  (reify clojure.lang.IReduceInit
    (reduce [_ rf init]
      (try
        (.reduce ^clojure.lang.IReduceInit reducible rf init)
        (catch IOException e
          (throw (stream-io-ex e timeout-ms)))))))

(mu/defn ollama-raw
  "Perform a streaming request to an Ollama Chat Completions API.

  Opts map takes `:credentials` from the connection serving this request; [[resolve-base-url]] turns
  those into the address to call, and throws when a self-hosted connection names none.
  `:ai-proxy?` is not supported for Ollama and throws when true."
  [{:keys [model tools credentials ai-proxy?] :as opts} :- core/LLMRequestOpts]
  (when ai-proxy? (throw (ai-proxy-unsupported-ex)))
  (when (str/blank? model) (throw (missing-model-ex)))
  (let [req        (ollama-request-body opts)
        timeout-ms (llm/llm-ollama-request-timeout-ms)
        ;; resolved before the `try` so the IO handler has the address actually called and the
        ;; deployment it belongs to; a Cloud connection carries no `:base-url` of its own.
        auth       (ollama-auth credentials ai-proxy?)]
    (log/debug "Ollama request" {:model model :msg-count (count (:messages req)) :tools (count (or tools []))})
    (with-span :info {:name       :metabot.ollama/request
                      :model      model
                      :msg-count  (count (:messages req))
                      :tool-count (count (or tools []))}
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
          (core/rethrow-api-error! "ollama" ollama-error-msg e))))))

(defn ollama->aisdk-chunks-xf
  "Translates Ollama Chat Completions streaming chunks into AI SDK v5 protocol chunks.

  A reasoning model routes thinking to `delta.reasoning` and its answer back to `delta.content`; both
  are forwarded. The branch is self-gating — the field is present only when the pulled model reasons
  — so nothing here needs to know which model is loaded.

  Ollama adds no `finish_reason` beyond OpenAI's, so it takes the base stop-reason table."
  []
  (chat-completions/chat-completions->aisdk-chunks-xf chat-completions/stop-reasons
                                                      {:forward-reasoning? true}))

(defn ollama
  "Call an Ollama server's Chat Completions API, return AISDK stream."
  [& args]
  (let [raw (apply ollama-raw args)]
    (eduction (ollama->aisdk-chunks-xf) raw)))
