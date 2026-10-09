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
   [metabase.util.log :as log]
   [metabase.util.malli :as mu])
  (:import
   (com.fasterxml.jackson.core JsonProcessingException)
   (java.io IOException)
   (java.net SocketTimeoutException)
   (java.nio.charset StandardCharsets)
   (java.util.concurrent ExecutionException)))

(set! *warn-on-reflection* true)

(defn- base-url-auth
  "The `:auth` of a server that needs a base URL but not an API key.

  One started without `--api-key` is a complete configuration, so the map is never nil and [[core/resolve-auth]]
  cannot reach its `missing-api-key-ex` branch. `missing-base-url-msg` returns the message a connection without a
  base URL fails with."
  [missing-base-url-msg]
  (fn [{:keys [slug display-name]} {:keys [credentials ai-proxy?]}]
    (let [base-url (not-empty (:base-url credentials))
          api-key  (not-empty (:api-key credentials))]
      (when-not base-url
        (throw (ex-info (missing-base-url-msg)
                        {:api-error  true
                         :error-code :base-url-missing})))
      (core/resolve-auth slug display-name
                         (cond-> {:url base-url}
                           api-key (assoc :headers {"Authorization" (str "Bearer " api-key)}))
                         ai-proxy?))))

(def ^:private Copy
  "What a server's errors say, each message a fn of the values it names."
  [:map {:closed true}
   [:base-url-missing        [:=> :cat :string]]
   [:model-missing           [:=> :cat :string]]
   [:unreachable             [:=> [:cat :string] :string]]
   [:context-too-small       [:=> [:cat :string :string :string] :string]]
   [:reasoning-as-text       [:=> [:cat :string] :string]]
   [:invalid-tool-arguments  [:=> [:cat :string] :string]]
   [:answered-with-text      [:=> [:cat :string] :string]]
   [:forced-call-ignored     [:=> :cat :string]]
   [:connection-test-timeout [:=> [:cat :string] :string]]
   [:request-timeout         [:=> [:cat :string] :string]]
   [:stopped-responding      [:=> [:cat :string] :string]]
   [:interrupted             [:=> :cat :string]]])

(def ^:private Server
  [:map {:closed true}
   [:provider adapter/Provider]
   [:copy     Copy]])

(mu/defn server :- Server
  "Describe a kind of server the code below talks to.

  `spec` builds its adapter descriptor, with an `:auth` that needs a base URL but not a key, and `copy` holds the
  messages its errors use. vLLM is one kind; [[metabase.metabot.self.openai-compatible]] is another."
  [spec :- adapter/ProviderSpec
   copy :- Copy]
  {:provider (adapter/provider (assoc spec :auth (base-url-auth (:base-url-missing copy))))
   :copy     copy})

(def ^:private vllm-server
  (server
   {:slug           "vllm"
    :display-name   "vLLM"
    :error-fallback #(tru "vLLM API error (HTTP {0})" %)
    :errors         {400 #(tru "vLLM rejected the request — usually an unsupported schema, or a model that cannot compile the tool grammar")
                     401 #(tru "vLLM API key expired or invalid — check the key your server was started with via --api-key")
                     404 #(tru "vLLM API endpoint was not found — the base URL should end in /v1")
                     429 #(tru "The vLLM server''s request queue is full — reduce concurrent load, or restart it with a larger --max-num-seqs")
                     500 #(tru "vLLM returned an internal server error")}}
   {:base-url-missing        #(tru "No vLLM base URL is set")
    :model-missing           #(tru "No vLLM model is set")
    :unreachable             #(tru "Could not reach the vLLM server at {0}. Check that it is running and that the base URL is correct." %)
    :context-too-small       #(tru "{0} is served with a {1} token context window, which is too small for Metabot — it needs at least {2}. Restart vLLM with a larger --max-model-len." %1 %2 %3)
    :reasoning-as-text       #(tru "{0} streamed its reasoning as chat text. Restart vLLM with --reasoning-parser so thinking doesn''t appear inside Metabot''s answers." %)
    :invalid-tool-arguments  #(tru "The vLLM server returned a tool call whose arguments are not valid JSON. The --tool-call-parser most likely does not match {0}''s output format." %)
    :answered-with-text      #(tru "The vLLM server answered with text instead of calling a tool. Restart it with --enable-auto-tool-choice and a --tool-call-parser matching {0}''s output format." %)
    :forced-call-ignored     #(tru "The vLLM server did not honor a forced tool call. Metabot needs structured output support for conversation titles and SQL generation.")
    :connection-test-timeout #(tru "The vLLM server did not answer the connection test within {0}ms. Check that it is not overloaded — a server this slow to answer a trivial prompt cannot drive Metabot." %)
    :request-timeout         #(tru "The vLLM server did not respond within {0}ms. Check that it is not overloaded, or raise the vLLM request timeout." %)
    :stopped-responding      #(tru "The vLLM server stopped responding after {0}ms. Raise the vLLM request timeout, or serve a faster model." %)
    :interrupted             #(tru "The connection to the vLLM server was interrupted before the response finished.")}))

(def ^:private provider (:provider vllm-server))

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
  "The error for a non-timeout transport failure. `extra` is the caller's own ex-data tags."
  [copy ^IOException e base-url extra]
  (ex-info ((:unreachable copy) (str base-url))
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
    (unreachable-ex (:copy vllm-server) e base-url {:status-code 400})))

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

(def ^:private prompt-overhead-tokens
  "Tokens [[estimated-prompt-tokens]] adds for what the chat template wraps around the messages and
  tools: role markers, a tool-use preamble, the generation prompt."
  1024)

(def ^:private answered-lookup-ttl-ms
  "How long [[served-max-model-len]] reuses the answer of a `/v1/models` lookup that succeeded, with or
  without a window for the model.

  Five minutes, because a vLLM server is seldom restarted after its initial setup. The cost: after a
  restart with a smaller `--max-model-len`, a cap sized for the old window can get a 400 from vLLM for up
  to five minutes after the lookup that cached it. A server that lists no window (Ollama, LM Studio) does
  not start to list one, so it is asked again only at this interval too."
  (* 5 60 1000))

(def ^:private failed-lookup-ttl-ms
  "How long [[served-max-model-len]] reuses the nil window of a `/v1/models` lookup that failed: a
  timeout, a refused connection, or an HTTP error status.

  Shorter than [[answered-lookup-ttl-ms]], so a server that comes up is used soon. A `/v1/models` that is
  down still costs at most one [[window-lookup-timeout-ms]] lookup in this period."
  30000)

(def ^:private window-lookup-timeout-ms
  "Connection and socket timeout of the `/v1/models` lookup behind [[served-max-model-len]]. The
  catalog is cheap to serve, and the chat request waits for this lookup."
  5000)

(def ^:private forced-tool-call-messages
  "The prompt of the forced tool call check.

  Nothing in it calls for a tool, so a server that ignores `tool_choice` answers it with text."
  [{:role "user" :content "Say hello."}])

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
  [provider req model tool-choice messages]
  (let [res (adapter/request! provider
                              (assoc req
                                     :method  :post
                                     :path    "/chat/completions"
                                     :as      :json
                                     :body    (json/encode {:model       model
                                                            :messages    messages
                                                            :tools       [adapter/probe-tool]
                                                            :tool_choice tool-choice
                                                            :temperature 0
                                                            :max_tokens  adapter/probe-max-tokens}))
                              (probe-timeouts))]
    (get-in res [:body :choices 0])))

(defn- check-context-budget!
  [copy {:keys [id max_model_len]}]
  (when (and max_model_len (< (long max_model_len) adapter/min-context-window-tokens))
    (throw (preflight-ex
            ((:context-too-small copy) (str id) (str max_model_len) (str adapter/min-context-window-tokens))))))

(defn- check-tool-calling!
  "Check that the server was started with `--enable-auto-tool-choice` and a `--tool-call-parser` whose
  sentinels match this model. A wrong-but-valid parser name errors at no layer — the call stays in
  `content` as prose and Metabot chats without ever acting.

  Returns whether the model emitted reasoning, the only signal anywhere that it is a reasoning model."
  [{:keys [provider copy]} req model]
  (let [{:keys [message finish_reason]} (probe-chat! provider req model "auto" adapter/probe-messages)
        content    (str (:content message))
        ;; `reasoning` since vLLM 0.26; `reasoning_content` is the deprecated spelling older builds
        ;; and other OpenAI-compatible servers still use.
        reasoning  (str (or (:reasoning message) (:reasoning_content message)))
        tool-calls (:tool_calls message)
        truncated? (= "length" finish_reason)]
    (cond
      (str/includes? content "<think>")
      (throw (preflight-ex ((:reasoning-as-text copy) (str model))))

      (seq tool-calls)
      (let [arguments (get-in (first tool-calls) [:function :arguments])]
        (when-not (try
                    (map? (json/decode+kw (str arguments)))
                    (catch Exception _ false))
          (throw (preflight-ex
                  (if truncated?
                    (tru "{0} reached the {1} token connection-test ceiling partway through a tool call. A model that generates this much before calling a tool is too slow to drive Metabot."
                         (str model) (str adapter/probe-max-tokens))
                    ((:invalid-tool-arguments copy) (str model))))))
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
      (throw (preflight-ex ((:answered-with-text copy) (str model)))))))

(defn- check-structured-output!
  "Check that guided decoding works. A different failure from [[check-tool-calling!]]: a model whose
  grammar the server cannot compile chats fine but breaks titling and the whole `sql` profile."
  [{:keys [provider copy]} req model]
  (let [{:keys [message finish_reason]} (probe-chat! provider req model "required" forced-tool-call-messages)]
    (when (empty? (:tool_calls message))
      (throw (preflight-ex
              (if (= "length" finish_reason)
                (tru "{0} reached the {1} token connection-test ceiling without producing a forced tool call. Metabot needs structured output support for conversation titles and SQL generation."
                     (str model) (str adapter/probe-max-tokens))
                ((:forced-call-ignored copy))))))))

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
  [{:keys [provider copy] :as server} req model]
  (try
    (let [tool-calling (future (check-tool-calling! server req model))
          structured   (future (check-structured-output! server req model))]
      (try
        (let [reasoning? (await-probe! tool-calling)]
          (await-probe! structured)
          (boolean reasoning?))
        (finally
          (future-cancel tool-calling)
          (future-cancel structured))))
    (catch SocketTimeoutException _
      (throw (preflight-ex ((:connection-test-timeout copy) (str (:socket-timeout (probe-timeouts)))))))
    (catch IOException e
      (throw (unreachable-ex copy e (get-in req [:credentials :base-url]) {:status-code 400})))
    (catch Exception e
      (adapter/rethrow! provider e))))

(defn preflight!
  "Exercise the contract the agent loop depends on against the model that `entry` names.

  `entry` is the model's catalog entry, with its `:id` and, when the server publishes one, its `:max_model_len`;
  `server` is the kind of server it runs on. Returns `{:model id :reasoning? bool}`. The connect path must adopt
  exactly this model rather than re-deriving it from the listing, which agrees only while nothing reorders the
  catalog.

  `:reasoning?` reports whether the probed model streamed reasoning. Only the probe can answer that,
  and the answer drives which renderer the frontend picks, so the connection records it (see
  [[reasoning-config-key]])."
  [server req {:keys [id] :as entry}]
  (check-context-budget! (:copy server) entry)
  {:model      id
   :reasoning? (run-probes! server req id)})

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
                    (preflight! vllm-server req (probe-target entries (or model proposed))))]
     (cond-> {:models (mapv (fn [{:keys [id] :as entry}]
                              {:id id :display_name (or (:name entry) id)})
                            entries)}
       probed (assoc :connection-info {reasoning-config-key (str (:reasoning? probed))
                                       :probed-model        (:model probed)})))))

;;; --------------------------------------------------- Requests -------------------------------------------------

(defonce ^:private window-cache
  ;; [base-url model] -> {:window n-or-nil, :expires-at epoch-ms}. Each entry carries its own expiry, because a
  ;; answered and a failed lookup live for different times (see [[lookup-entry]]). The keys are the servers
  ;; and models the connections name, so the map stays small without eviction.
  (atom {}))

(defn- now-ms
  "The current time in epoch milliseconds. A function, so a test can set the clock."
  []
  (System/currentTimeMillis))

(defn- window-entry
  "A [[window-cache]] entry for `window` that expires `ttl-ms` from now."
  [window ttl-ms]
  {:window     window
   :expires-at (+ (now-ms) ttl-ms)})

(defn- live-entry
  "The [[window-cache]] entry for `k`, or nil when there is none or it has expired."
  [k]
  (let [entry (get @window-cache k)]
    (when (and entry (< (now-ms) (:expires-at entry)))
      entry)))

(defn- fetch-max-model-len
  "Fetch the context window the server at `credentials` advertises for `model`, or nil.

  vLLM's `/v1/models` entries carry `max_model_len`
  (https://github.com/vllm-project/vllm/blob/main/vllm/entrypoints/serve/engine/protocol.py, `ModelCard`).
  Nil when the catalog lists no entry with the model's id or no window for it (Ollama, LM Studio, TGI).
  Throws when the request fails."
  [provider credentials model]
  (let [res   (adapter/request! provider
                                {:credentials credentials :method :get :path "/models" :as :json}
                                {:socket-timeout     window-lookup-timeout-ms
                                 :connection-timeout window-lookup-timeout-ms})
        entry (u/seek #(= model (:id %)) (get-in res [:body :data]))]
    (when (pos-int? (:max_model_len entry))
      (:max_model_len entry))))

(defn- lookup-entry
  "Look up the window of `model` on the server at `credentials`, as a [[window-cache]] entry.

  An answer, with or without a window, lives for [[answered-lookup-ttl-ms]]. A failed lookup gives a nil
  window that lives for [[failed-lookup-ttl-ms]]: an unknown window only means no default cap, and the
  chat request that follows reports a real failure in its own words."
  [provider credentials model]
  (try
    (window-entry (fetch-max-model-len provider credentials model) answered-lookup-ttl-ms)
    (catch Exception e
      (log/debugf e "Could not read the context window of %s from the %s server" model (:display-name provider))
      (window-entry nil failed-lookup-ttl-ms))))

(defn- served-max-model-len
  "The context window `provider`'s server serves the request's model with, or nil when it is unknown.

  Read from the server rather than stored on the connection, so a restart with a different
  `--max-model-len` is followed within [[answered-lookup-ttl-ms]]. Lookups are cached per base URL and
  model, nil windows and failures too, so a server costs one lookup per [[answered-lookup-ttl-ms]], or per
  [[failed-lookup-ttl-ms]] while its lookup fails, not one per request. Two requests that miss at the same
  time both look up; the later answer wins."
  [provider {:keys [model credentials ai-proxy?]}]
  (let [base-url (:base-url credentials)
        k        [base-url model]]
    (when-not (or ai-proxy? (str/blank? base-url))
      (:window (or (live-entry k)
                   (let [entry (lookup-entry provider credentials model)]
                     (swap! window-cache assoc k entry)
                     entry))))))

(defn- estimated-prompt-tokens
  "A high estimate of the prompt tokens in the Chat Completions `body`.

  The UTF-8 bytes of its JSON `messages` and `tools`, plus [[prompt-overhead-tokens]]. One byte counts as
  one token: the server can host any model, and no token of a byte-level BPE or byte-fallback tokenizer
  is shorter than one byte. That is an upper bound, not a typical rate. Metabot prose measures 4 to 5
  bytes per token, but rows of numbers measure 1.0 on Qwen3, which gives each digit its own token, and
  below 2 on a tokenizer that groups up to three digits. A high estimate is the safe side:
  [[output-cap]] then sends no cap, where a low one would send a cap that does not fit."
  [body]
  (+ prompt-overhead-tokens
     (alength (.getBytes ^String (json/encode (select-keys body [:messages :tools]))
                         StandardCharsets/UTF_8))))

(defn- raise-to-floors
  "Raise `cap` to [[adapter/forced-tool-call-token-floor]] on a `forced?` call, and to
  [[adapter/reasoning-model-token-floor]] on a reasoning connection."
  [cap forced? credentials]
  (cond-> cap
    forced?                             (max adapter/forced-tool-call-token-floor)
    (reasoning-connection? credentials) (max adapter/reasoning-model-token-floor)))

(defn- output-cap
  "The `max_tokens` to send with `body`, or nil to send none.

  For example, on a 131072-token window the agent loop's 48 KB first prompt gets 32000; on a 32768-token
  window it gets none, and vLLM stops at the remaining window, about 21000 tokens.

  The cap is the caller's `max-tokens`, or [[core/chat-max-output-tokens]] when the `window` is known,
  raised by [[raise-to-floors]]. It is sent only when [[estimated-prompt-tokens]] plus the cap fits the
  window: vLLM subtracts a sent cap from the admissible prompt and returns a 400 when the prompt no longer
  fits (https://github.com/vllm-project/vllm/blob/main/vllm/renderers/params.py). A cap that does not fit
  is dropped, not lowered. Uncapped, vLLM generates up to the remaining window, which then bounds the
  output by the exact prompt length rather than by an estimate.

  With an unknown window, only a caller's cap is sent."
  [body max-tokens forced? credentials window]
  (let [cap (some-> (or max-tokens (when window core/chat-max-output-tokens))
                    (raise-to-floors forced? credentials))]
    (when (and cap
               (or (nil? window)
                   (<= (+ (estimated-prompt-tokens body) cap) window)))
      cap)))

(mu/defn vllm-request-body
  "Build the Chat Completions request body for an LLM request.

  Matches what [[chat-completions/request-body]] emits, except that `max_tokens` is the one
  [[output-cap]] picks for the context window `max-model-len` (nil when unknown), and `temperature`
  falls back to [[adapter/default-temperature]]. Both stay adapter-local rather than moving into the shared
  builder, which would also change Z.AI, Mistral, and OpenRouter.

  Pure: [[server-raw]] looks the window up. The 1-arity, which Model Garden endpoints use, has none."
  ([opts :- core/LLMRequestOpts]
   (vllm-request-body opts nil))
  ([{:keys [max-tokens temperature schema tool_choice credentials] :as opts} :- core/LLMRequestOpts
    max-model-len                                                            :- [:maybe pos-int?]]
   (let [forced? (or (some? schema) (= "required" (some-> tool_choice name)))
         body    (chat-completions/request-body (cond-> (dissoc opts :max-tokens)
                                                  (nil? temperature) (assoc :temperature adapter/default-temperature)))
         cap     (output-cap body max-tokens forced? credentials max-model-len)]
     (cond-> body
       cap (assoc :max_tokens cap)))))

(defn- stream-io-ex
  "The error for a transport failure while *consuming* a response stream. Tagged
  `:retryable? false`: on a self-hosted server a stalled or severed response means \"too slow\" or
  \"it died\", not \"transient\", and a retry replays a full cold prefill at up to
  `llm-vllm-request-timeout-ms` (300s) apiece. The tag is required — `retryable-error?` walks the
  cause chain and would otherwise match the `IOException` below."
  [copy ^IOException e timeout-ms]
  (if (instance? SocketTimeoutException e)
    (ex-info ((:stopped-responding copy) (str timeout-ms))
             {:api-error  true
              :error-code :vllm-timeout
              :retryable? false}
             e)
    (ex-info ((:interrupted copy))
             {:api-error  true
              :error-code :vllm-stream-interrupted
              :retryable? false}
             e)))

(defn- request-io-ex
  "The error for a transport failure while *establishing* a request. `core/rethrow-api-error!`
  would render these as \"vllm API request failed: Read timed out\", naming neither the server's
  slowness nor the setting that governs it.

  Tagged `:retryable? false` for the same reason as [[stream-io-ex]], and more importantly: nothing
  has been emitted yet, so `call-llm`'s own \"nothing emitted\" predicate would not stop a replay."
  [copy ^IOException e base-url timeout-ms]
  (if (instance? SocketTimeoutException e)
    (ex-info ((:request-timeout copy) (str timeout-ms))
             {:api-error  true
              :error-code :vllm-timeout
              :retryable? false}
             e)
    (unreachable-ex copy e base-url {:retryable? false})))

(mu/defn server-raw
  "Perform a streaming request to the Chat Completions API of the kind of server `server` describes.
  Opts map takes `:credentials` (`{:base-url ... :api-key ...}`) from the connection serving this
  request, and throws without a base URL.
  `:ai-proxy?` is not supported and throws when true.
  Reads the served context window first, through [[served-max-model-len]]'s cache, to size `max_tokens`."
  [{:keys [provider copy]}              :- Server
   {:keys [model credentials] :as opts} :- core/LLMRequestOpts]
  (when (str/blank? model)
    (throw (ex-info ((:model-missing copy))
                    {:api-error  true
                     :error-code :model-missing})))
  (let [timeout-ms (llm/llm-vllm-request-timeout-ms)]
    (adapter/stream! provider opts
                     {:path             "/chat/completions"
                      :body             (vllm-request-body opts (served-max-model-len provider opts))
                      :request-options  (inference-timeouts)
                      :wrap-stream      #(adapter/io-guarded % (fn [e] (stream-io-ex copy e timeout-ms)))
                      ;; clj-http raises an `IOException` only when there is no response at all, so the
                      ;; IO branch cannot swallow a failure the provider's own messages would have translated.
                      :on-request-error (fn [e]
                                          (if (instance? IOException e)
                                            (throw (request-io-ex copy e (:base-url credentials) timeout-ms))
                                            (adapter/rethrow! provider e)))})))

(mu/defn vllm-raw
  "Perform a streaming request to a vLLM server's Chat Completions API. See [[server-raw]]."
  [opts :- core/LLMRequestOpts]
  (server-raw vllm-server opts))

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
    (eduction (vllm->aisdk-chunks-xf) (chat-completions/usage-once raw))))
