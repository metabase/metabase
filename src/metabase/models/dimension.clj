(ns metabase.models.dimension
  "Dimensions are used to define remappings for Fields handled automatically when those Fields are encountered by the
  Query Processor. For a more detailed explanation, refer to the documentation in
  `metabase.query-processor.middleware.add-dimension-projections`."
  (:require [metabase.models.serialization.base :as serdes.base]
            [metabase.models.serialization.hash :as serdes.hash]
            [metabase.models.serialization.util :as serdes.util]
            [metabase.util :as u]
            [toucan.models :as models]))

(def dimension-types
  "Possible values for `Dimension.type`"
  #{:internal
    :external})

(models/defmodel Dimension :dimension)

(u/strict-extend #_{:clj-kondo/ignore [:metabase/disallow-class-or-type-on-model]} (class Dimension)
  models/IModel
  (merge models/IModelDefaults
         {:types      (constantly {:type :keyword})
          :properties (constantly {:timestamped? true
                                   :entity_id    true})}))

(defmethod serdes.hash/identity-hash-fields Dimension
  [_dimension]
  [(serdes.hash/hydrated-hash :field "<none>")
   (serdes.hash/hydrated-hash :human_readable_field "<none>")
   :created_at])

;;; ------------------------------------------------- Serialization --------------------------------------------------
(defmethod serdes.base/extract-one "Dimension"
  [_model-name _opts dim]
  ;; The field IDs are converted to {:field [db schema table field]} portable values.
  (-> (serdes.base/extract-one-basics "Dimension" dim)
      (update :field_id serdes.util/export-field-fk)
      (update :human_readable_field_id #(some-> % serdes.util/export-field-fk))))

(defmethod serdes.base/load-xform "Dimension"
  [dim]
  (-> dim
      serdes.base/load-xform-basics
      (update :field_id serdes.util/import-field-fk)
      (update :human_readable_field_id #(some-> % serdes.util/import-field-fk))))

(defmethod serdes.base/serdes-dependencies "Dimension"
  [{:keys [field_id human_readable_field_id]}]
  ;; The Field depends on the Table, and Table on the Database.
  (let [base  (serdes.util/field->path field_id)]
    (if-let [human (some-> human_readable_field_id serdes.util/field->path)]
      [base human]
      [base])))
