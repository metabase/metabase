(ns metabase-enterprise.semantic-search.core
  "Enterprise implementations of semantic search core functions using defenterprise."
  (:require
   [medley.core :as m]
   [metabase-enterprise.semantic-search.db :as semantic.db]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.index-metadata :as semantic.index-metadata]
   [metabase-enterprise.semantic-search.pgvector-api :as semantic.pgvector-api]
   [metabase-enterprise.semantic-search.settings :as semantic.settings]
   [metabase.analytics.prometheus :as prometheus]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.search.engine :as search.engine]
   [metabase.util.log :as log]
   [next.jdbc :as jdbc]))

(defn- fallback-engine
  "Find the highest priority search engine available for fallback."
  []
  (first (filter search.engine/supported-engine?
                 search.engine/fallback-engine-priority)))

(defn- index-active? [pgvector index-metadata]
  (boolean (semantic.index-metadata/get-active-index-state pgvector index-metadata)))

(defenterprise supported?
  "Enterprise implementation of semantic search engine support check."
  :feature :semantic-search
  []
  (and
   (some? semantic.db/db-url)
   (semantic.settings/semantic-search-enabled)))

(defenterprise results
  "Enterprise implementation of semantic search results with fallback logic."
  :feature :semantic-search
  [search-ctx]
  (try
    (let [semantic-results (semantic.pgvector-api/query
                            (semantic.env/get-pgvector-datasource!
                             (semantic.env/get-index-metadata)
                             search-ctx))
          result-count (count semantic-results)]
      (if (>= result-count (semantic.settings/semantic-search-min-results-threshold))
        semantic-results
        (let [fallback (fallback-engine)]
          (log/debugf "Semantic search returned %d results (< %d), supplementing with %s search"
                      result-count (semantic.settings/semantic-search-min-results-threshold) fallback)
          (prometheus/inc! :metabase-search/semantic-fallback-triggered)
          (prometheus/observe! :metabase-search/semantic-fallback-results result-count)
          (let [fallback-results (search.engine/results (assoc search-ctx :search-engine fallback))
                combined-results (concat semantic-results fallback-results)
                deduped-results  (m/distinct-by (juxt :model :id) combined-results)]
            (take (semantic.settings/semantic-search-results-limit) deduped-results)))))
    (catch Exception e
      (log/error e "Error executing semantic search")
      [])))

(defenterprise update-index!
  "Enterprise implementation of semantic index updating."
  :feature :semantic-search
  [document-reducible]
  (let [pgvector       (semantic.env/get-pgvector-datasource!)
        index-metadata (semantic.env/get-index-metadata)]
    (if-not (index-active? pgvector index-metadata)
      (log/warn "update-index! called prior to init!")
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
      (log/warn "delete-from-index! called prior to init!")
      (semantic.pgvector-api/gate-deletes!
       pgvector
       index-metadata
       model
       ids))))

;; TODO: add reindexing/table-swapping logic when index is detected as stale
(defenterprise init!
  "Initialize the semantic search table and populate it with initial data."
  :feature :semantic-search
  [searchable-documents _opts]
  (let [pgvector        (semantic.env/get-pgvector-datasource!)
        index-metadata  (semantic.env/get-index-metadata)
        embedding-model (semantic.env/get-configured-embedding-model)]
    (jdbc/with-transaction [tx pgvector]
      (semantic.pgvector-api/init-semantic-search! tx index-metadata embedding-model))
    (semantic.pgvector-api/index-documents! pgvector index-metadata searchable-documents)))

(defenterprise reindex!
  "Reindex the semantic search index."
  :feature :semantic-search
  [searchable-documents _opts]
  (let [pgvector        (semantic.env/get-pgvector-datasource!)
        index-metadata  (semantic.env/get-index-metadata)
        embedding-model (semantic.env/get-configured-embedding-model)]
    ;; todo force a new index
    (jdbc/with-transaction [tx pgvector]
      (semantic.pgvector-api/init-semantic-search! tx index-metadata embedding-model))
    (semantic.pgvector-api/index-documents! pgvector index-metadata searchable-documents)))

;; TODO: implement
(defenterprise reset-tracking!
  "Enterprise implementation of semantic search tracking reset."
  :feature :semantic-search
  []
  nil)

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

  ;; reindex! testing
  (require '[metabase.search.ingestion :as search.ingestion])
  (def all-docs (search.ingestion/searchable-documents))
  (def subset-docs (eduction (take 2000) all-docs))
  (reindex! subset-docs {})
  (reindex! all-docs {}))
