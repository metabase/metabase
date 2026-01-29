(ns metabase-enterprise.semantic-search.core
  "Enterprise implementations of semantic search core functions using defenterprise."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.index-metadata :as semantic.index-metadata]
   [metabase-enterprise.semantic-search.pgvector-api :as semantic.pgvector-api]
   [metabase-enterprise.semantic-search.repair :as semantic.repair]
   [metabase-enterprise.semantic-search.settings :as semantic.settings]
   [metabase.analytics.core :as analytics]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.search.engine :as search.engine]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.realize :as t2.realize]))

(defn- fallback-engine
  "Find the highest priority search engine available for fallback."
  []
  (u/seek #(not= :search.engine/semantic %) (search.engine/supported-engines)))

(defn- index-active? [pgvector index-metadata]
  (boolean (semantic.index-metadata/get-active-index-state pgvector index-metadata)))

;; TODO: url should likely reside in settings
(defenterprise supported?
  "Enterprise implementation of semantic search engine support check."
  :feature :semantic-search
  []
  (and
   (some? semantic.db.datasource/db-url)
   (semantic.settings/semantic-search-enabled)))

(defenterprise results
  "Enterprise implementation of semantic search results with improved fallback logic. Falls back to appdb search only
  when semantic search returns too few results and some results were filtered out (e.g. due to permission checks)."
  :feature :semantic-search
  [search-ctx]
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
                combined-results (concat results fallback-results)
                deduped-results  (m/distinct-by (juxt :model :id) combined-results)]
            (take total-limit deduped-results)))))
    (catch Exception e
      (log/error e "Error executing semantic search, falling back to appdb")
      (let [fallback (fallback-engine)]
        (analytics/inc! :metabase-search/semantic-error-fallback {:fallback-engine fallback})
        (if fallback
          (search.engine/results (assoc search-ctx :search-engine fallback))
          (throw (ex-info "Error executing semantic search" {:type :semantic-search-error} e)))))))

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
  Does not fully reinitialize the index, but will add missing documents and remove stale ones."
  :feature :semantic-search
  [searchable-documents]
  (let [pgvector       (semantic.env/get-pgvector-datasource!)
        index-metadata (semantic.env/get-index-metadata)]
    (if-not (index-active? pgvector index-metadata)
      (log/debug "repair-index! called prior to init!")
      (semantic.repair/with-repair-table!
        pgvector
        (fn [repair-table-name]
          ;; Re-gate all provided documents, populating the repair table as we go
          (semantic.pgvector-api/gate-updates! pgvector index-metadata searchable-documents
                                               :repair-table repair-table-name)
          ;; Find documents in the gate table that are not in the provided searchable-documents, and gate deletes for them
          (when-let [ids-by-model (semantic.repair/find-lost-deletes-by-model pgvector (:gate-table-name index-metadata) repair-table-name)]
            (doseq [[model ids] ids-by-model]
              (log/infof "Repairing lost deletes for model %s: deleting %d documents" model (count ids))
              (semantic.pgvector-api/gate-deletes! pgvector index-metadata model ids))))))))

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
