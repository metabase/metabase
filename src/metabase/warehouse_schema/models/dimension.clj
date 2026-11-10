(ns metabase.warehouse-schema.models.dimension
  "Dimensions are used to define remappings for Fields handled automatically when those Fields are encountered by the
  Query Processor. For a more detailed explanation, refer to the documentation in
  `metabase.query-processor.middleware.add-remaps`."
  (:require
   [metabase.models.interface :as mi]
   [metabase.serialization.core :as serialization]
   [metabase.warehouse-schema.schema :as warehouse-schema.schema]
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
  (derive :hook/timestamped?)
  (derive :hook/dependencies))

(t2/deftransforms :model/Dimension
  {:type mi/transform-keyword})

(def ^:private dimension-slug "___dimension")

(def ^:private field-id-transform
  "The transform of `field_id`, which keeps the Field id that a Dimension nested in its Field's entity loads with."
  (assoc serialization/field-transform
         :import (fn [store _ field-ids opts]
                   (mapv (fn [field-id imported] (if (int? field-id) field-id imported))
                         field-ids
                         (serialization/column-ids store :model/Field (mapv #(when-not (int? %) %) field-ids) opts)))))

(defmethod serialization/spec :model/Dimension [_]
  {:schema    ::warehouse-schema.schema/external-dimension
   :identity  [:field_id]
   :copy      [:name :type :entity_id]
   :parent    {:model :model/Field :key :field_id :import-only? true}
   :transform {:human_readable_field_id serialization/field-transform
               :field_id                field-id-transform}})

(defmethod serialization/storage-paths :model/Dimension [_ entities _ctx]
  (mapv (fn [dimension]
          (let [field-path (serialization/storage-path-prefixes (:field_id dimension))]
            (update field-path (dec (count field-path))
                    (fn [segment] (assoc segment :suffix dimension-slug)))))
        entities))
