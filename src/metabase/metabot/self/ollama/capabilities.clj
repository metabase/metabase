(ns metabase.metabot.self.ollama.capabilities
  "What the models behind an Ollama connection can do, and remembering it.

  Ollama reports this per model, from the model's own template, on `POST /api/show` — Cloud serves it
  too. It is the only thing that tells a chat model from an embedding model, which its
  OpenAI-compatible catalog lists side by side and marks neither of, and the only thing that says
  whether a model thinks. Names cannot: an Ollama tag is local (`qwen3:8b`, or whatever an operator
  called their own Modelfile), so nothing here can be settled the way it is for a hosted provider.

  A connection serves as many models as the operator has pulled, so every answer here is about one
  *model*, never about the connection. That is the whole point: Metabot and the mini model need not
  be on the same one, and a flag recorded once against the connection could only ever describe one
  of them.

  Keeping the answers fresh is this namespace's own business — see [[cached-capabilities]]. Nothing
  outside needs to know a cache exists, or to remember to fill it."
  (:require
   [clojure.core.cache :as cache]
   [clojure.set :as set]
   [clojure.string :as str]
   [com.climate.claypoole :as cp]
   [metabase.llm.settings :as llm]
   [metabase.metabot.self.adapter :as adapter]
   [metabase.metabot.self.ollama.connection :as conn]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.jvm :as u.jvm]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu])
  (:import
   (java.util.concurrent Semaphore)))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------- Asking the server ----------------------------------------------

(def ^:private native-api-timeout-ms
  "Upper bound on a `/api/show` lookup. It reads metadata Ollama already has in memory, so anything
  slower than this is a server in trouble — and the callers are a model being listed and a request
  about to be made, neither of which can wait on it."
  5000)

(def ^:private thinking-capability
  "The `capabilities` entry Ollama reports for a model whose template separates thinking from the
  answer — the same template that decides whether a `reasoning` field ever comes back."
  "thinking")

(def ^:private chat-capabilities
  "What a model has to report to be worth offering Metabot. Embedding models report neither."
  #{"completion" "tools"})

(def ^:private lookup-concurrency
  "How many models to ask about at once. A catalog listing asks about every model it offers, and
  `/api/show` opens a fresh connection per call — against Cloud that is a TLS handshake each, to one
  host. Unbounded, a 40-model catalog is how an instance earns a 429, and a 429 is cached as \"would
  not say\" until [[retry-after-ms]] passes, so one burst would cost reasoning detection for every
  model on the connection meanwhile."
  8)

(defonce ^:private lookup-permits
  ;; Taken by every `/api/show` call, cold or background, so [[lookup-concurrency]] bounds all the
  ;; calls open at once rather than the calls one fan-out makes.
  (Semaphore. lookup-concurrency))

(defn- with-permit
  "Call `f` holding one of [[lookup-permits]]."
  [f]
  (.acquire ^Semaphore lookup-permits)
  (try
    (f)
    (finally
      (.release ^Semaphore lookup-permits))))

(defn- fetch-capabilities
  "Ask Ollama what `model` can do: `{:caps #{...}-or-nil, :answered? bool}`.

  `:caps` is nil whenever the server would not say, and `:answered?` separates the two reasons it
  might not. An Ollama too old to report `capabilities` answers, so asking again will not help; one
  that errored or timed out did not, and probably will next time — see [[stale?]], which is the only
  thing the distinction is for.

  Never throws: this is metadata that sharpens a decision the adapter can still make without it, so a
  server that will not answer must not take down the request or the page that asked."
  [credentials model]
  (try
    (let [res  (with-permit
                 #(adapter/request! conn/native-provider
                                    {:credentials credentials
                                     :method      :post
                                     :path        "/api/show"
                                     :as          :json
                                     :body        (json/encode {:model model})}
                                    {:socket-timeout     native-api-timeout-ms
                                     :connection-timeout (llm/llm-connection-timeout-ms)}))
          caps (get-in res [:body :capabilities])]
      {:answered? true
       :caps      (when (sequential? caps)
                    (into #{} (map str) caps))})
    (catch Exception e
      (log/debug e "Ollama did not report capabilities" {:model model})
      {:answered? false})))

;;; -------------------------------------------------- The cache --------------------------------------------------

(def ^:private refresh-after-ms
  "How old an answer may get before the next read re-asks behind the caller.

  A real capability set is near-immutable for a given server and tag, but not quite — Ollama tags are
  mutable, so a re-pull or a rebuilt Modelfile can change a template under the same name."
  600000)

(def ^:private cache-threshold
  "How many models the capabilities cache holds before it evicts the least recently used."
  256)

(defonce ^:private capabilities-cache
  ;; `{cache-key {:caps #{...}-or-nil :at ms}}`. LRU rather than TTL because age must not mean
  ;; forgetting: an entry that has gone stale is still the best answer we have, and an expired one is
  ;; not evidence that a model stopped thinking. `:at` says when to re-ask, `:caps` what to believe
  ;; meanwhile, and the bound is on size instead.
  (atom (cache/lru-cache-factory {} :threshold cache-threshold)))

(defn- cache-key
  "What a model's capabilities are filed under: the destination and credential that would be asked,
  reduced to a hash, plus the model.

  Hashed rather than held as-is for the reason `metabase.llm.api.provider`'s model cache does it —
  the API key is in there, and a cache entry outlives the connection that produced it. Only the
  fields that decide *which server answers* are in the key, so an entry survives the rest of a
  connection being edited and, more to the point, survives the connect path storing what it learned
  back onto the very config it probed with. Repointing at another address or rotating the key retires
  it, since the same tag on another server is another model."
  [credentials model]
  [(hash (select-keys credentials [:base-url :api-key])) model])

(def ^:private retry-after-ms
  "How long an entry that holds no answer, from a server that did not give one, is left alone.

  Much shorter than [[refresh-after-ms]] because there is nothing to serve meanwhile: until this
  elapses, every model behind a server that was briefly unreachable reads as not reasoning and runs on
  the smaller token budget. Not shorter still, so a server that is properly down is not asked once per
  read."
  60000)

(defn- stale?
  "Whether `entry` is old enough to re-ask for.

  An entry holding no answer from a server that never gave one is re-asked on [[retry-after-ms]]: it
  records a failure rather than a fact, and unlike a real answer there is nothing to serve while it
  stands. An Ollama that answered without `capabilities` is not that case — it will answer the same way
  for as long as it runs that build — and neither is a failed re-ask over an answer we already hold."
  [{:keys [caps answered? at]}]
  (< (if (or caps answered?) refresh-after-ms retry-after-ms)
     (u/since-ms at)))

(defn- remember!
  "Record what a lookup returned, and return the capability set now believed.

  A lookup that came back with nothing keeps whatever was believed before — a server that would not
  answer is not evidence that a model changed — but still stamps `:at`, so a broken endpoint is
  re-asked on an interval rather than once per read."
  [k {:keys [caps answered?]}]
  (-> (swap! capabilities-cache
             (fn [c]
               (cache/miss c k {:caps      (or caps (:caps (cache/lookup c k)))
                                :answered? answered?
                                :at        (u/start-timer)})))
      (cache/lookup k)
      :caps))

(defn- read-entry
  "The cache entry for `k`, counted as a use so the LRU evicts by reads as well as writes."
  [k]
  (-> (swap! capabilities-cache #(cond-> % (cache/has? % k) (cache/hit k)))
      (cache/lookup k)))

;; Lookups in flight, by cache key. Callers after the same key share one, so a burst for one model —
;; page loads against a stale entry, or requests for a model with none — asks once.
(defonce ^:private in-flight
  (atom {}))

(defn- shared-lookup
  "The lookup for `model`, joining the one in flight or starting one: `[started? lookup]`, where
  `lookup` is a delay that asks the server and records the answer. Whoever gets `started?` is
  responsible for it running; everyone else may deref it or leave it.

  The lookup re-reads the cache first and asks only if the entry is still missing or stale. A caller
  decides to start one from a read taken earlier, and a lookup that finished in between has already
  answered."
  [credentials model]
  (let [k              (cache-key credentials model)
        lookup         (delay
                         (try
                           (let [entry (cache/lookup @capabilities-cache k)]
                             (if (and entry (not (stale? entry)))
                               (:caps entry)
                               (remember! k (fetch-capabilities credentials model))))
                           (finally
                             (swap! in-flight dissoc k))))
        ;; `swap-vals!` hands back the map as it was, so exactly one thread finds `k` missing from it
        [before after] (swap-vals! in-flight #(cond-> % (not (contains? % k)) (assoc k lookup)))]
    [(not (contains? before k)) (get after k)]))

(defn- refresh-in-background!
  "Re-ask for `model` on another thread, unless a lookup for it is already in flight."
  [credentials model]
  (let [[started? lookup] (shared-lookup credentials model)]
    (when started?
      (u.jvm/in-virtual-thread* @lookup))))

(defn- capabilities
  "`model`'s capability set, or nil when nothing is known about it.

  Serves what is believed whenever there is an entry, re-asking behind the caller once it is stale.
  Only a model with no entry at all is fetched in front of the caller."
  [credentials model]
  (when-not (str/blank? model)
    (let [k (cache-key credentials model)]
      (if-let [entry (read-entry k)]
        (do (when (stale? entry)
              (refresh-in-background! credentials model))
            (:caps entry))
        @(second (shared-lookup credentials model))))))

(defn- cached-capabilities
  "[[capabilities]] without the cold fetch: nil rather than a wait when nothing is known yet.

  There is exactly one such reader, and it is the reason this exists: the public
  `llm-metabot-supports-reasoning?` setting, read on page load by every client, which must never make
  that client wait on the operator's Ollama."
  [credentials model]
  ;; the same guard [[capabilities]] has, and here it is load-bearing: a model reference with no model
  ;; segment would never fill the cache, so every page load would hand a future the same nothing to do
  (when-not (str/blank? model)
    (let [k     (cache-key credentials model)
          entry (read-entry k)]
      (when (or (nil? entry) (stale? entry))
        (refresh-in-background! credentials model))
      (:caps entry))))

(defn clear-cache!
  "Forget every lookup. For tests, which must not inherit each other's servers."
  []
  (reset! in-flight {})
  (swap! capabilities-cache cache/seed {}))

;;; --------------------------------------------- What callers ask for --------------------------------------------

(mu/defn reasoning-model? :- :boolean
  "Whether the connection's `model` streams its reasoning back to us, asking Ollama if we have not
  asked recently. The ordinary accessor: a caller already making a generation request does not notice
  one cached metadata lookup.

  A server that will not say reads as not reasoning. Thinking still renders either way — the
  `reasoning` field is forwarded whenever it appears — but the request keeps the smaller token
  budget, which a thinking model can exhaust. That surfaces as truncation, not as a wrong answer."
  [credentials :- conn/Credentials
   model       :- [:maybe :string]]
  (contains? (capabilities credentials model) thinking-capability))

(mu/defn cached-reasoning-model? :- :boolean
  "[[reasoning-model?]] for the one caller that cannot make an HTTP call — see [[cached-capabilities]],
  which also arranges for the next such read to be right."
  [credentials :- conn/Credentials
   model       :- [:maybe :string]]
  (contains? (cached-capabilities credentials model) thinking-capability))

(mu/defn chat-capable? :- :boolean
  "Whether `model` is one Metabot could run on. Unknown capabilities count as capable: only a server
  that answers is allowed to rule a model out, so an older Ollama goes on offering what it always did."
  [credentials :- conn/Credentials
   model       :- [:maybe :string]]
  (let [caps (capabilities credentials model)]
    (or (nil? caps) (set/subset? chat-capabilities caps))))

(mu/defn chat-capable-ids :- [:set :string]
  "Which of `model-ids` Ollama offers for chat at all, asked [[lookup-concurrency]] at a time."
  [credentials :- conn/Credentials
   model-ids   :- [:sequential :string]]
  (into #{}
        (filter some?)
        (cp/pmap lookup-concurrency
                 #(when (chat-capable? credentials %) %)
                 model-ids)))
