(ns metabase.warehouse-schema.models.dimension
  "Dimensions are used to define remappings for Fields handled automatically when those Fields are encountered by the
  Query Processor. For a more detailed explanation, refer to the documentation in
  `metabase.query-processor.middleware.add-remaps`."
  (:require
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.warehouse-schema.db :as warehouse-schema.db]
   [metabase.warehouse-schema.schema]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; Possible values for Dimension.type :
;;;
;;; :internal
;;; :external

(methodical/defmethod t2/table-name :model/Dimension [_model] :dimension)

(doto :model/Dimension
  (derive :metabase/model)
  (derive :hook/entity-id)
  (derive :hook/timestamped?))

(t2/deftransforms :model/Dimension
  {:type mi/transform-keyword})

(defmethod serdes/extract-query "Dimension" [model-name {:keys [filter-column filter-ids] :as opts}]
  (if (= filter-column :table_id)
    (warehouse-schema.db/dimensions-for-tables filter-ids)
    ((get-method serdes/extract-query :default) model-name opts)))

(defmethod serdes/make-spec "Dimension" [_model-name _opts]
  {:copy      [:name :type :entity_id]
   :skip      []
   :transform {:created_at              (serdes/date)
               :human_readable_field_id (serdes/fk :model/Field)
               :field_id                {::serdes/fk true
                                         :export     serdes/*export-field-fk*
                                         :import     #(if (vector? %) (serdes/*import-field-fk* %) %)}}})
