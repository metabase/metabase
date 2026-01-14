(ns metabase-enterprise.dependencies.models.analysis-finding-error
  "Model for the `analysis_finding_error` table which stores individual validation errors
   with source entity information. This enables querying errors by the data source that
   causes them (e.g., which cards are broken because table X removed column Y?)."
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/AnalysisFindingError [_model] :analysis_finding_error)

(derive :model/AnalysisFindingError :metabase/model)

(t2/deftransforms :model/AnalysisFindingError
  {:analyzed_entity_type mi/transform-keyword
   :error_type mi/transform-keyword
   :source_entity_type mi/transform-keyword})

(defn replace-errors-for-entity!
  "Delete existing errors for an entity and insert new ones.
   `errors` is a sequence of maps with keys:
   - `:error-type` - keyword like `:validate/missing-column`
   - `:error-detail` - string (column name, alias, message, etc.) or nil
   - `:source-entity-type` - keyword like `:table`, `:card`, or nil
   - `:source-entity-id` - int or nil"
  [entity-type entity-id errors]
  (t2/with-transaction [_conn]
    (t2/delete! :model/AnalysisFindingError
                :analyzed_entity_type entity-type
                :analyzed_entity_id entity-id)
    (when (seq errors)
      (t2/insert! :model/AnalysisFindingError
                  (mapv (fn [{:keys [error-type error-detail source-entity-type source-entity-id]}]
                          {:analyzed_entity_type (name entity-type)
                           :analyzed_entity_id entity-id
                           :error_type (name error-type)
                           :error_detail error-detail
                           :source_entity_type (some-> source-entity-type name)
                           :source_entity_id source-entity-id})
                        errors)))))

(defn errors-by-source
  "Get all errors caused by a specific source entity."
  [source-entity-type source-entity-id]
  (t2/select :model/AnalysisFindingError
             :source_entity_type source-entity-type
             :source_entity_id source-entity-id))

(defn errors-for-entity
  "Get all errors for a specific analyzed entity."
  [entity-type entity-id]
  (t2/select :model/AnalysisFindingError
             :analyzed_entity_type entity-type
             :analyzed_entity_id entity-id))
