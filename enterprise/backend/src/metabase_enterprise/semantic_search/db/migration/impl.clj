(ns metabase-enterprise.semantic-search.db.migration.impl
  (:require
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase-enterprise.semantic-search.index-metadata :as semantic.index-metadata]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(def code-version
  "Version to compare the [[metabase-enterprise.semantic-search.db.migration/db-version]] with."
  0)

(defn migrate!
  "Execute migration, proper docstring tbd."
  [tx {:keys [index-metadata embedding-model] :as _opts}]
  ;; called async on application startup see task/search_index.clj for the job entrypoint.
  ;; called under cluster lock, should not race across nodes.
  ;; each node does call this function independently so we should avoid redundant work
  ;; each node _should_ have the same environmental settings, and therefore the same global model
  (let [_                  (semantic.index-metadata/create-tables-if-not-exists! tx index-metadata)
        _                  (semantic.index-metadata/ensure-control-row-exists! tx index-metadata)
        active-index-state (semantic.index-metadata/get-active-index-state tx index-metadata)
        active-index       (:index active-index-state)
        active-model       (:embedding-model active-index)
        ;; Model switching: compare configured embedding-model vs currently active model.
        ;; If different, find/create appropriate index and activate it. This handles
        ;; environment changes (model config updates) without losing existing indexes.
        ;; nil active-model (no active index) is treated as model change so that a new index is created and made active
        model-changed      (not= embedding-model active-model)
        model-switching    (and active-model model-changed)]
    (when model-switching
      (log/infof "Configured model does not match active index, switching. Previous active: %s" (u/pprint-to-str active-index)))
    (when model-changed
      (let [{:keys [index metadata-row]}
            (semantic.index-metadata/find-best-index! tx index-metadata embedding-model)]
        ;; Metadata might exist without table (deleted manually) or table without metadata
        ;; (created outside this system). Both cases are handled gracefully.
        ;; We might delete some of this fancyness later once schema / setup etc solidifies
        (semantic.index/create-index-table-if-not-exists! tx index)
        (let [index-id (or (:id metadata-row) (semantic.index-metadata/record-new-index-table! tx index-metadata index))]
          (semantic.index-metadata/activate-index! tx index-metadata index-id))))))

