(ns metabase.models.dimension
  "Dimensions are used to define remappings for Fields handled automatically when those Fields are encountered by the
  Query Processor. For a more detailed explanation, refer to the documentation in
  `metabase.query-processor.middleware.add-dimension-projections`."
  (:require
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; Possible values for Dimension.type :
;;;
;;; :internal
;;; :external

(def Dimension
  "Used to be the toucan1 model name defined using [[toucan.models/defmodel]], now it's a reference to the toucan2 model name.
  We'll keep this till we replace all the symbols in our codebase."
  :model/Dimension)

(methodical/defmethod t2/table-name :model/Dimension [_model] :dimension)

(doto :model/Dimension
  (derive :metabase/model)
  (derive :hook/entity-id)
  (derive :hook/timestamped?))

(t2/deftransforms :model/Dimension
  {:type mi/transform-keyword})

(defmethod serdes/hash-fields :model/Dimension
  [_dimension]
  [(serdes/hydrated-hash :field)
   (serdes/hydrated-hash :human_readable_field)
   :created_at])

;;; ------------------------------------------------- Serialization --------------------------------------------------

(defmethod serdes/make-spec "Dimension" [_model-name _opts]
  {:copy      [:name :type :entity_id]
   :skip      []
   :transform {:created_at              (serdes/date)
               :human_readable_field_id (serdes/fk :model/Field)
               :field_id                (serdes/parent-ref)}})
