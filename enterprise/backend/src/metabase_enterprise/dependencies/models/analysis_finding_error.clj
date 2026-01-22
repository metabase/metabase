(ns metabase-enterprise.dependencies.models.analysis-finding-error
  "Model for the `analysis_finding_error` table which stores individual validation errors
   with source entity information. This enables querying errors by the data source that
   causes them (e.g., which cards are broken because table X removed column Y?)."
  (:require
   [metabase-enterprise.dependencies.dependency-types :as deps.dependency-types]
   [metabase.lib.schema.validate :as lib.schema.validate]
   [metabase.models.interface :as mi]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/AnalysisFindingError [_model] :analysis_finding_error)

(derive :model/AnalysisFindingError :metabase/model)

(mr/def ::analysis-finding-error
  "Schema for an AnalysisFindingError record."
  [:map
   [:id                    ms/PositiveInt]
   [:analyzed_entity_type  ::deps.dependency-types/dependency-types]
   [:analyzed_entity_id    ms/PositiveInt]
   [:error_type            ::lib.schema.validate/validate-error-type]
   [:error_detail          {:optional true} [:maybe :string]]
   [:source_entity_type    {:optional true} [:maybe ::lib.schema.validate/source-entity-type]]
   [:source_entity_id      {:optional true} [:maybe ms/PositiveInt]]])

(t2/deftransforms :model/AnalysisFindingError
  {:analyzed_entity_type mi/transform-keyword
   :error_type mi/transform-keyword
   :source_entity_type mi/transform-keyword})

(mr/def ::error-input
  "Schema for error input maps passed to replace-errors-for-entity!"
  [:map
   [:error-type         ::lib.schema.validate/validate-error-type]
   [:error-detail       {:optional true} [:maybe :string]]
   [:source-entity-type {:optional true} [:maybe ::lib.schema.validate/source-entity-type]]
   [:source-entity-id   {:optional true} [:maybe ms/PositiveInt]]])

(mu/defn replace-errors-for-entity!
  "Delete existing errors for an entity and insert new ones.
   `errors` is a sequence of maps with keys:
   - `:error-type` - keyword like `:missing-column`
   - `:error-detail` - string (column name, alias, message, etc.) or nil
   - `:source-entity-type` - keyword like `:table`, `:card`, or nil
   - `:source-entity-id` - int or nil"
  [entity-type :- ::deps.dependency-types/dependency-types
   entity-id   :- ms/PositiveInt
   errors      :- [:sequential ::error-input]]
  (t2/with-transaction [_conn]
    (t2/delete! :model/AnalysisFindingError
                :analyzed_entity_type entity-type
                :analyzed_entity_id entity-id)
    (when (seq errors)
      (t2/insert! :model/AnalysisFindingError
                  (mapv (fn [{:keys [error-type error-detail source-entity-type source-entity-id]}]
                          {:analyzed_entity_type (name entity-type)
                           :analyzed_entity_id entity-id
                           :error_type error-type
                           :error_detail error-detail
                           :source_entity_type (some-> source-entity-type name)
                           :source_entity_id source-entity-id})
                        errors)))))

(mu/defn errors-by-source :- [:sequential ::analysis-finding-error]
  "Get all errors caused by a specific source entity."
  [source-entity-type :- [:maybe ::lib.schema.validate/source-entity-type]
   source-entity-id   :- ms/PositiveInt]
  (t2/select :model/AnalysisFindingError
             :source_entity_type source-entity-type
             :source_entity_id source-entity-id))

(mu/defn errors-for-entity :- [:sequential ::analysis-finding-error]
  "Get all errors for a specific analyzed entity."
  [entity-type :- ::deps.dependency-types/dependency-types
   entity-id   :- ms/PositiveInt]
  (t2/select :model/AnalysisFindingError
             :analyzed_entity_type entity-type
             :analyzed_entity_id entity-id))
