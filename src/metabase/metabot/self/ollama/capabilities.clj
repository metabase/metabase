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

  A server that will not answer rules nothing in and nothing out: an unknown model is offered like
  any other, and reads as not reasoning.

  Keeping the answers fresh is this namespace's own business — see [[cached-capabilities]]. Nothing
  outside needs to know a cache exists, or to remember to fill it."
  (:require
   [clojure.core.cache :as cache]
   [clojure.core.cache.wrapped :as cache.wrapped]
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase.llm.settings :as llm]
   [metabase.metabot.self.core :as core]
   [metabase.metabot.self.ollama.connection :as conn]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

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

(def ^:private cache-ttl-ms
  "How long a model's reported capabilities are reused.

  Sized for the answers that go stale rather than the ones that do not. A real capability set is
  near-immutable for a given server and tag, but not quite — Ollama tags are mutable, so a re-pull or
  a rebuilt Modelfile can change a template under the same name, and this bounds how long a model
  that has just gained thinking runs on the smaller token budget. A nil answer is the transient one:
  a server that was down, or too old to report, recovers on its own."
  600000)

(defonce ^:private capabilities-cache
  (atom (cache/ttl-cache-factory {} :ttl cache-ttl-ms)))

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
  [(hash ((juxt :hosting :base-url :api-key) credentials)) model])

(defn- capabilities
  "`model`'s capability set, fetching and caching it when it is not already known. Nil when the server
  would not say.

  Makes an HTTP call, so callers have to be somewhere one is acceptable — see [[cached-capabilities]]
  for the one that is not."
  [credentials model]
  (when-not (str/blank? model)
    (cache.wrapped/lookup-or-miss capabilities-cache
                                  (cache-key credentials model)
                                  (fn [_] (fetch-capabilities credentials model)))))

;; The cache keys a background lookup is already in flight for. Without this, a burst of page loads
;; against a cold cache would each start their own: `cache.wrapped/lookup-or-miss` gives every caller
;; its own `delay`, so it deduplicates within a thread but not across them.
(defonce ^:private refreshing
  (atom #{}))

(defn- refresh-in-background!
  "Fill the cache for `model` on another thread, unless a lookup for it is already in flight.

  Returns the future doing the work, or nil when another thread got there first. Nothing needs the
  return value: a caller that could wait for it would not have come here."
  [credentials model]
  (let [k          (cache-key credentials model)
        [claimed?] (swap-vals! refreshing conj k)]
    ;; `swap-vals!` hands back the set as it was, so exactly one thread sees `k` missing from it
    (when-not (contains? claimed? k)
      (future
        (try
          (capabilities credentials model)
          (finally
            (swap! refreshing disj k)))))))

(defn- cached-capabilities
  "`model`'s capability set if a lookup already has it, and nil otherwise — including when the server
  was asked and would not say.

  There is exactly one such reader, and it is the reason this exists: the public
  `llm-metabot-supports-reasoning?` setting, read on page load by every client, which must never make
  that client wait on the operator's Ollama. Everything else — the request path, the model listing —
  uses [[capabilities]] and blocks.

  A miss does still *start* a lookup, on another thread, rather than leaving the answer wrong until
  something else happens to ask. So a cold read costs one outbound request — collapsed across
  concurrent readers, and only ever for the model the setting was asked about — but never a wait."
  [credentials model]
  ;; the same guard [[capabilities]] has, and here it is load-bearing: a model reference with no model
  ;; segment would never fill the cache, so every page load would hand a future the same nothing to do
  (when-not (str/blank? model)
    (let [k (cache-key credentials model)
          c @capabilities-cache]
      (if (cache/has? c k)
        (cache/lookup c k)
        (do (refresh-in-background! credentials model)
            nil)))))

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

  A server that will not say reads as not reasoning. That costs a smaller token budget, not
  correctness — the `reasoning` field is forwarded whenever it appears, so thinking still renders."
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
