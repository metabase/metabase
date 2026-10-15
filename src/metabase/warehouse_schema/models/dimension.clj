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

(defmethod serdes/generate-path "Dimension" [_ {:keys [field_id entity_id]}]
  (conj (serdes/generate-path "Field" {:id field_id})
        {:model "Dimension" :id entity_id}))

(defmethod serdes/load-find-local "Dimension" [path]
  (or ((get-method serdes/load-find-local :default) path)
      (when-let [field (serdes/load-find-local (pop path))]
        (warehouse-schema.db/dimension-for-field (:id field)))))

(defmethod serdes/load-update! "Dimension" [model-name ingested local]
  ((get-method serdes/load-update! :default) model-name (merge {:human_readable_field_id nil} ingested) local))

(defmethod serdes/make-spec "Dimension" [_model-name _opts]
  {:copy      [:name :type :entity_id]
   :skip      []
   :transform {:created_at              (serdes/date)
               :human_readable_field_id (serdes/fk :model/Field)
               :field_id                {::serdes/fk true
                                         :export     (constantly ::serdes/skip)
                                         :import-with-context
                                         (fn [current _ field-id]
                                           (or field-id
                                               (serdes/*import-field-fk*
                                                (serdes/field-path->field-ref (pop (serdes/path current))))))}}})

(def ^:private dimension-slug "___dimension")

(defmethod serdes/storage-path "Dimension" [dimension _ctx]
  (let [field-path (serdes/storage-path-prefixes (pop (serdes/path dimension)))]
    (update field-path (dec (count field-path))
            (fn [segment] (assoc segment :suffix dimension-slug)))))
