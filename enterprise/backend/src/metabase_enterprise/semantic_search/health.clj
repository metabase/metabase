(ns metabase-enterprise.semantic-search.health
  "Health-inspector check for semantic search, plus the embedding-service probe shared with the NLQ
  retrieval check ([[metabase-enterprise.entity-retrieval.health]]).

  Semantic search degrades silently -- no active index, a stalled indexer, or an unreachable embedding
  service just falls back to appdb search, and nobody notices; this check surfaces that.
  Health is status-style: 100 = serving the good path, 0 = enabled but degraded (the `:message` names the
  failing condition).
  A not-enabled instance returns nil, so the check is omitted rather than reported as a misleading 100."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.index-metadata :as semantic.index-metadata]
   [metabase-enterprise.semantic-search.settings :as semantic-settings]
   [metabase-enterprise.semantic-search.util :as semantic.util]
   [metabase.health-inspector.core :as health-inspector]
   [metabase.util.log :as log]
   [next.jdbc :as jdbc]))

(set! *warn-on-reflection* true)

(defn- healthy [message] {:health 100 :message message})
(defn- degraded [message] {:health 0 :message message})

(defn embedding-service-reachable?
  "Probe the embedding service by embedding a trivial string.
  Returns `{:reachable? <bool> :error <msg-or-nil>}`."
  []
  (try
    ;; Bypass the breaker so the probe is an independent signal and can't itself trip or reset it.
    (binding [semantic.embedding/*bypass-circuit-breaker* true]
      (semantic.embedding/get-embedding (semantic.embedding/get-configured-model)
                                        "health check"
                                        {:type :query :record-tokens? false}))
    {:reachable? true :error nil}
    (catch Throwable e
      (log/debug e "Embedding service health probe failed")
      {:reachable? false :error (ex-message e)})))

(defn- active-index-queryable?
  "Whether a trivial `SELECT ... LIMIT 1` against the active index table succeeds -- i.e. pgvector is
  reachable and the table exists and is queryable."
  [pgvector table-name]
  (try
    (jdbc/execute-one! pgvector [(format "SELECT 1 FROM \"%s\" LIMIT 1" table-name)])
    true
    (catch Throwable _ false)))

(defn index-health-check
  "Health-inspector check for semantic search, registered as `:semantic-search-index`.
  Returns nil when semantic search isn't enabled (so the check is omitted), otherwise a `{:health :message}`
  map: healthy when an active index is present, queryable, un-stalled, and the embedding service is
  reachable; degraded (naming the failing conditions) otherwise."
  []
  ;; Mirror the engine's own gate (semantic-search core/supported?): beyond pgvector + license this respects
  ;; the semantic-search-enabled kill switch, so a disabled instance neither records runs nor probes the embedder.
  (when (and (semantic.util/semantic-search-available?)
             (semantic-settings/semantic-search-enabled))
    (let [pgvector       (semantic.env/get-pgvector-datasource!)
          index-metadata (semantic.env/get-index-metadata)
          active         (try
                           {:state (semantic.index-metadata/get-active-index-state pgvector index-metadata)}
                           (catch Throwable e {:error e}))]
      (cond
        (:error active)
        (degraded (str "pgvector store unreachable: " (ex-message (:error active)) "."))

        (nil? (:state active))
        (degraded "No active semantic search index.")

        :else
        (let [state         (:state active)
              table-name    (-> state :index :table-name)
              stalled-at    (-> state :metadata-row :indexer_stalled_at)
              circuit-open? (semantic.embedding/embedder-circuit-open?)
              ;; An open circuit already tells us the embedder is failing under real traffic; skip the
              ;; (bypassing) probe to avoid a needless slow call, and report the stricter signal.
              reach         (when-not circuit-open? (embedding-service-reachable?))
              problems      (cond-> []
                              (not (active-index-queryable? pgvector table-name))
                              (conj "active index table not queryable")

                              (some? stalled-at)
                              (conj (str "indexer stalled since " stalled-at))

                              circuit-open?
                              (conj "embedding service circuit open")

                              (and reach (not (:reachable? reach)))
                              (conj (str "embedding service unreachable: " (:error reach))))]
          (if (seq problems)
            (degraded (str "Semantic search degraded: " (str/join "; " problems) "."))
            (healthy "Semantic search index active, fresh, and serving.")))))))

(health-inspector/register-check! :semantic-search-index index-health-check)
