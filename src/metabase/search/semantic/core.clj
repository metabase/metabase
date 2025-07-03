(ns metabase.search.semantic.core
  "Semantic search engine implementation."
  (:require
   [java-time.api :as t]
   [metabase.app-db.core :as app-db]
   [metabase.search.engine :as search.engine]
   [metabase.search.semantic.index :as semantic.index]
   [metabase.settings.models.setting :refer [defsetting]]
   [metabase.util.log :as log]))

;;; ---------------------------------------- Engine Registration ----------------------------------------

(defsetting semantic-search-enabled
  "Whether to enable semantic search. If enabled, the engine will be available for use."
  :type :boolean
  :default false
  :visibility :internal
  :description "Enable semantic search engine.")

(def supported-db?
  "All the databases which we have implemented semantic search for."
  #{:postgres})

(defmethod search.engine/supported-engine? :search.engine/semantic [_]
  (boolean
   (and (supported-db? (app-db/db-type))
        (semantic-search-enabled))))

;;; ---------------------------------------- Search Implementation ----------------------------------------

(defmethod search.engine/results :search.engine/semantic
  [search-ctx]
  ;; TODO: Implement semantic search query logic
  (log/info "Semantic search results called with context:" search-ctx)
  [])

(defmethod search.engine/model-set :search.engine/semantic
  [search-ctx]
  ;; TODO: Return set of models that have results for the query
  (log/info "Semantic search model-set called with context:" search-ctx)
  #{})

(defmethod search.engine/score :search.engine/semantic
  [search-ctx result]
  ;; TODO: Implement semantic scoring logic
  {:result (dissoc result :score)
   :score  (:score result 0)})

;;; ---------------------------------------- Index Management ----------------------------------------

(defmethod search.engine/update! :search.engine/semantic
  [_engine document-reducible]
  ;; TODO: Update semantic index with new/changed documents
  (log/info "Semantic search update called")
  {})

(defmethod search.engine/delete! :search.engine/semantic
  [_engine model ids]
  ;; TODO: Remove documents from semantic index
  (log/info "Semantic search delete called for model:" model "ids:" ids)
  {})

(defmethod search.engine/init! :search.engine/semantic
  [_engine opts]
  (log/info "Semantic search init called with opts:" opts)
  (let [index-created (semantic.index/when-index-created)]
    (if (and index-created (< 3 (t/time-between (t/instant index-created) (t/instant) :days)))
      (do
        (log/debug "TODO: implement reindex when index is old"))

      (let [created? (semantic.index/ensure-ready! opts)]))))

(defmethod search.engine/reindex! :search.engine/semantic
  [_engine opts]
  ;; TODO: Perform full reindex of semantic search
  (log/info "Semantic search reindex called with opts:" opts)
  {})

(defmethod search.engine/reset-tracking! :search.engine/semantic [_]
  ;; TODO: Reset any internal tracking state
  (log/info "Semantic search reset-tracking called"))
