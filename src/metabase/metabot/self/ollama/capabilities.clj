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
   [metabase.metabot.self.core :as core]
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

(defn- fetch-capabilities
  "What Ollama says `model` can do, as a set of capability names, or nil when it would not say — an
  Ollama too old to report `capabilities`, or one that answered `/api/show` with an error.

  Never throws: this is metadata that sharpens a decision the adapter can still make without it, so a
  server that will not answer must not take down the request or the page that asked. nil is cached
  like any other answer, so a broken endpoint is asked once per TTL rather than once per request."
  [credentials model]
  (try
    (let [res  (core/request (conn/native-auth credentials)
                             {:method             :post
                              :url                "/api/show"
                              :as                 :json
                              :headers            {"Content-Type" "application/json"}
                              :body               (json/encode {:model model})
                              :socket-timeout     native-api-timeout-ms
                              :connection-timeout (llm/llm-connection-timeout-ms)})
          caps (get-in res [:body :capabilities])]
      (when (sequential? caps)
        (into #{} (map str) caps)))
    (catch Exception e
      (log/debug e "Ollama did not report capabilities" {:model model})
      nil)))

;;; -------------------------------------------------- The cache --------------------------------------------------

(def ^:private refresh-after-ms
  "How old an answer may get before the next read re-asks behind the caller.

  A real capability set is near-immutable for a given server and tag, but not quite — Ollama tags are
  mutable, so a re-pull or a rebuilt Modelfile can change a template under the same name."
  600000)

(defonce ^:private capabilities-cache
  ;; `{cache-key {:caps #{...}-or-nil :at ms}}`. LRU rather than TTL because age must not mean
  ;; forgetting: an entry that has gone stale is still the best answer we have, and an expired one is
  ;; not evidence that a model stopped thinking. `:at` says when to re-ask, `:caps` what to believe
  ;; meanwhile, and the bound is on size instead.
  (atom (cache/lru-cache-factory {} :threshold 256)))

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
  [(hash (select-keys credentials [:hosting :base-url :api-key])) model])

(defn- stale?
  "Whether `entry` is old enough to re-ask for."
  [{:keys [at]}]
  (< refresh-after-ms (u/since-ms at)))

(defn- remember!
  "Record what a lookup returned, and return the capability set now believed.

  A lookup that came back with nothing keeps whatever was believed before — a server that would not
  answer is not evidence that a model changed — but still stamps `:at`, so a broken endpoint is
  re-asked on the usual interval rather than once per read."
  [k caps]
  (-> (swap! capabilities-cache
             (fn [c]
               (cache/miss c k {:caps (or caps (:caps (cache/lookup c k)))
                                :at   (u/start-timer)})))
      (cache/lookup k)
      :caps))

(defn- fetch-and-remember!
  "Ask the server about `model` and record the answer. Blocks."
  [credentials model]
  (remember! (cache-key credentials model) (fetch-capabilities credentials model)))

(def ^:private lookup-concurrency
  "How many models to ask about at once. A catalog listing asks about every model it offers, and
  `/api/show` opens a fresh connection per call — against Cloud that is a TLS handshake each, to one
  host. Unbounded, a 40-model catalog is how an instance earns a 429, and a 429 is cached as \"would
  not say\" for the whole TTL, so one burst would cost reasoning detection for every model on the
  connection."
  8)

;; The cache keys a background lookup is already in flight for. Without this, a burst of page loads
;; against a stale entry would each start their own.
(defonce ^:private refreshing
  (atom #{}))

(defonce ^:private refresh-permits
  ;; Background refreshes honour the same bound as the fan-out that triggers them. Serving a believed
  ;; answer costs nanoseconds, so a stale catalog walks its whole listing in microseconds and would
  ;; otherwise hand every model its own thread at once — the burst [[lookup-concurrency]] exists to
  ;; prevent, arriving by the back door.
  (Semaphore. lookup-concurrency))

(defn- refresh-in-background!
  "Re-ask for `model` on another thread, unless a lookup for it is already in flight.

  Goes straight to [[fetch-and-remember!]]: the read paths serve what is already believed, so routing
  a refresh through them would never actually re-ask."
  [credentials model]
  (let [k          (cache-key credentials model)
        [claimed?] (swap-vals! refreshing conj k)]
    ;; `swap-vals!` hands back the set as it was, so exactly one thread sees `k` missing from it
    (when-not (contains? claimed? k)
      (u.jvm/in-virtual-thread*
       (try
         (.acquire ^Semaphore refresh-permits)
         (try
           (fetch-and-remember! credentials model)
           (finally
             (.release ^Semaphore refresh-permits)))
         (finally
           (swap! refreshing disj k)))))))

(defn- capabilities
  "`model`'s capability set, or nil when nothing is known about it.

  Serves what is believed whenever there is an entry, re-asking behind the caller once it is stale.
  Only a model with no entry at all is fetched in front of the caller."
  [credentials model]
  (when-not (str/blank? model)
    (let [k (cache-key credentials model)]
      (if-let [entry (cache/lookup @capabilities-cache k)]
        (do (when (stale? entry)
              (refresh-in-background! credentials model))
            (:caps entry))
        (fetch-and-remember! credentials model)))))

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
          entry (cache/lookup @capabilities-cache k)]
      (when (or (nil? entry) (stale? entry))
        (refresh-in-background! credentials model))
      (:caps entry))))

(defn clear-cache!
  "Forget every lookup. For tests, which must not inherit each other's servers."
  []
  (reset! refreshing #{})
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
