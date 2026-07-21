(ns metabase-enterprise.semantic-search.core
  "Enterprise implementations of semantic search core functions using defenterprise."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase-enterprise.semantic-search.embedders]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.index-metadata :as semantic.index-metadata]
   [metabase-enterprise.semantic-search.pgvector-api :as semantic.pgvector-api]
   [metabase-enterprise.semantic-search.repair :as semantic.repair]
   [metabase-enterprise.semantic-search.settings :as semantic.settings]
   [metabase-enterprise.semantic-search.util :as semantic.util]
   [metabase.analytics-interface.core :as analytics]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.search.config :as search.config]
   [metabase.search.engine :as search.engine]
   [metabase.tracing.core :as tracing]
   [metabase.util.log :as log]
   [potemkin :as p]
   [toucan2.realize :as t2.realize]))

;; import-vars requires full namespace symbols, so it can't use the alias
#_{:clj-kondo/ignore [:aliased-namespace-symbol]}
(p/import-vars
 [metabase-enterprise.semantic-search.embedders
  active-embedding-model
  search-index-embedder]
 [metabase-enterprise.semantic-search.embedding
  get-embeddings-batch])

(defn- fallback-engine []
  (search.engine/fallback-engine :search.engine/semantic))

(defn- index-active? [pgvector index-metadata]
  (boolean (semantic.index-metadata/get-active-index-state pgvector index-metadata)))

(defenterprise supported?
  "Enterprise implementation of semantic search engine support check."
  :feature :semantic-search
  []
  ;; Gate engine selection on a usable embedder. App-db mode gives every Postgres instance a pgvector
  ;; store, so without this the engine auto-activates with no embedder configured and every index and
  ;; query embed fails. available?/capable? skip the gate on purpose: an existing index still needs
  ;; maintenance while the embedder is temporarily unconfigured.
  (and (semantic.util/semantic-search-available?)
       (semantic.embedding/embedding-supported? (semantic.embedding/get-configured-model))))

(defn build-hnsw-index-async!
  "Build the HNSW index on the active semantic search index in the background, returning promptly.

  No-ops when semantic search isn't active on this instance. Backs the just-in-time HNSW build, which
  runs only when an instance is configured to the `:hnsw` vector-search strategy."
  []
  (when (semantic.util/semantic-search-active?)
    (future
      (try
        (semantic.pgvector-api/ensure-active-hnsw-index! (semantic.env/get-pgvector-datasource!)
                                                         (semantic.env/get-index-metadata))
        (catch Throwable t
          (log/error t "Failed to build HNSW index for semantic search")))))
  nil)

(defn- with-zero-semantic-distance-score
  "Record a 0 `:semantic-distance` score on `results` that lack it, for a consistent merged-result score breakdown."
  [search-ctx results]
  ;; Fallback (appdb/in-place) results never went through vector search, so they carry no semantic distance.
  ;; Score them as least-relevant: the 0 below is a score, not a distance -- the opposite of a zero cosine
  ;; distance, which would be a perfect match.
  (let [entry {:name         :semantic-distance
               :score        0
               :weight       (search.config/weight search-ctx :semantic-distance)
               :contribution 0}]
    (map (fn [result]
           (cond-> result
             (and (contains? result :all-scores)
                  (not-any? (comp #{:semantic-distance} :name) (:all-scores result)))
             (update :all-scores conj entry)))
         results)))

(defenterprise results
  "Enterprise implementation of semantic search results with improved fallback logic. Falls back to appdb search only
  when semantic search returns too few results and some results were filtered out (e.g. due to permission checks)."
  :feature :semantic-search
  [search-ctx]
  (tracing/with-span :search "search.semantic.execute" {:search/query-length (count (:search-string search-ctx))}
    (try
      (let [{:keys [results raw-count]}
            (semantic.pgvector-api/query (semantic.env/get-pgvector-datasource!)
                                         (semantic.env/get-index-metadata)
                                         search-ctx)
            final-count (count results)
            threshold (semantic.settings/semantic-search-min-results-threshold)]
        (if (or (>= final-count threshold)
                (and (zero? raw-count)
                     ;; :search-string is nil when using search to populate the list of tables for a given database in
                     ;; the native query editor. Semantic search doesn't support this, so fallback in this case.
                     (not (str/blank? (:search-string search-ctx)))))
          results
          ;; Fallback: semantic search found results but some were filtered out (e.g. due to permission checks), so try to
          ;; supplement with appdb search.
          (let [fallback (fallback-engine)]
            (log/debugf "Semantic search returned %d final results (< %d) from %d raw results, supplementing with %s search"
                        final-count threshold raw-count fallback)
            (analytics/inc! :metabase-search/semantic-fallback-triggered {:fallback-engine fallback})
            (analytics/observe! :metabase-search/semantic-results-before-fallback final-count)
            (when (some-> (:offset-int search-ctx) pos?)
              (log/warn "Using an offset with semantic search will produce strange results, e.g. missing expected results, or duplicating them across pages"))
            (let [total-limit      (semantic.settings/semantic-search-results-limit)
                  fallback-results (try
                                     (cond->> (search.engine/results (assoc search-ctx :search-engine fallback))
                                       ;; The in-place engine returns a reducible (but not seqable) result that needs to
                                       ;; be realized before we concat and dedup with the semantic engine results.
                                       (= :search.engine/in-place fallback)
                                       (into [] (comp (map t2.realize/realize)
                                                      (take total-limit))))
                                     (catch Throwable t
                                       (log/warn t "Semantic search fallback errored, ignoring")
                                       []))
                  fallback-results (take total-limit fallback-results)
                  _                (analytics/observe! :metabase-search/semantic-fallback-results-usage (count fallback-results))
                  combined-results (concat results (with-zero-semantic-distance-score search-ctx fallback-results))
                  deduped-results  (m/distinct-by (juxt :model :id) combined-results)]
              (take total-limit deduped-results)))))
      (catch Exception e
        (log/error e "Error executing semantic search, falling back to appdb")
        (let [fallback (fallback-engine)]
          (analytics/inc! :metabase-search/semantic-error-fallback {:fallback-engine fallback})
          (if fallback
            (search.engine/results (assoc search-ctx :search-engine fallback))
            (throw (ex-info "Error executing semantic search" {:type :semantic-search-error} e))))))))

(defenterprise update-index!
  "Enterprise implementation of semantic index updating."
  :feature :semantic-search
  [document-reducible]
  (let [pgvector       (semantic.env/get-pgvector-datasource!)
        index-metadata (semantic.env/get-index-metadata)]
    (if-not (index-active? pgvector index-metadata)
      (log/debug "update-index! called prior to init!")
      (semantic.pgvector-api/gate-updates!
       pgvector
       index-metadata
       document-reducible))))

(defenterprise delete-from-index!
  "Enterprise implementation of semantic index deletion."
  :feature :semantic-search
  [model ids]
  (let [pgvector       (semantic.env/get-pgvector-datasource!)
        index-metadata (semantic.env/get-index-metadata)]
    (if-not (index-active? pgvector index-metadata)
      (log/debug "delete-from-index! called prior to init!")
      (semantic.pgvector-api/gate-deletes!
       pgvector
       index-metadata
       model
       ids))))

(defenterprise diagnose
  "Enterprise implementation of the semantic search engine-owned diagnostic stages."
  :feature :semantic-search
  [search-ctx expected-model expected-id]
  (let [pgvector       (semantic.env/get-pgvector-datasource!)
        index-metadata (semantic.env/get-index-metadata)]
    (if-not (index-active? pgvector index-metadata)
      {:type :missing-from-index :details {:reason :no-active-index}}
      (semantic.pgvector-api/diagnose pgvector index-metadata search-ctx expected-model expected-id))))

;; NOTE:
;; we're currently not returning stats from `init!` as the async nature means
;; we'd report skewed values for the `metabase-search` metrics.

(defenterprise init!
  "Initialize the semantic search table and populate it with initial data."
  :feature :semantic-search
  [searchable-documents opts]
  (let [pgvector        (semantic.env/get-pgvector-datasource!)
        index-metadata  (semantic.env/get-index-metadata)
        embedding-model (semantic.env/get-configured-embedding-model)]
    (semantic.pgvector-api/init-semantic-search! pgvector index-metadata embedding-model opts)
    (semantic.pgvector-api/gate-updates! pgvector index-metadata searchable-documents)
    nil))

(defenterprise repair-index!
  "Brings the semantic search index into consistency with the provided document set.
  Does not fully reinitialize the index, but will add missing documents and remove stale ones.
  Returns the number of stale orphans (garbage the indexer hasn't cleaned since it was gated for deletion),
  so callers can feed the garbage health metric."
  :feature :semantic-search
  [searchable-documents]
  (let [pgvector       (semantic.env/get-pgvector-datasource!)
        index-metadata (semantic.env/get-index-metadata)
        active-state   (semantic.index-metadata/get-active-index-state pgvector index-metadata)]
    (if-not active-state
      ;; Semantic can become active at runtime (license applied, or added to additional-search-engines)
      ;; without init! ever having run; initializing here lets the periodic repair task backfill the index.
      ;; A fresh init has no lost deletes, so return 0 orphans to keep the garbage-metric contract.
      (do
        (log/info "No active semantic index, initializing it instead of repairing")
        (init! searchable-documents {})
        0)
      (semantic.repair/with-repair-table!
        pgvector
        index-metadata
        (fn [repair-table-name]
          ;; Re-gate all provided documents, populating the repair table as we go
          (semantic.pgvector-api/gate-updates! pgvector index-metadata searchable-documents
                                               :repair-table repair-table-name)
          ;; Counted BEFORE this run's gate-deletes, so the lost deletes found below (in-flight cleanup the
          ;; indexer typically clears within minutes) don't read as a garbage spike that stands until the
          ;; next hourly repair; see [[semantic.repair/count-stale-orphans]] for the full contract.
          (let [orphans (semantic.repair/count-stale-orphans pgvector
                                                             (-> active-state :index :table-name)
                                                             (:gate-table-name index-metadata)
                                                             repair-table-name
                                                             (:metadata-row active-state))]
            ;; Gate deletes for documents absent from the current searchable set.
            (when-let [ids-by-model
                       (semantic.repair/find-lost-deletes-by-model
                        pgvector (:gate-table-name index-metadata) repair-table-name)]
              (doseq [[model ids] ids-by-model]
                (log/infof "Repairing lost deletes for model %s: deleting %d documents" model (count ids))
                (semantic.pgvector-api/gate-deletes! pgvector index-metadata model ids)))
            orphans))))))

(comment
  (update-index! [{:model "card"
                   :id "1"
                   :searchable_text "This is a test card"}
                  {:model "card"
                   :id "2"
                   :searchable_text "This is a test card too"}
                  {:model "dashboard"
                   :id "3"
                   :searchable_text "This is a test dashboard"}])
  (delete-from-index! "card" ["1" "2"])

  ;; repair-index! testing
  (require '[metabase.search.ingestion :as search.ingestion])
  (def all-docs (search.ingestion/searchable-documents))
  (repair-index! all-docs))
