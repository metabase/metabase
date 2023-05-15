(ns metabase.models.dimension
  "Dimensions are used to define remappings for Fields handled automatically when those Fields are encountered by the
  Query Processor. For a more detailed explanation, refer to the documentation in
  `metabase.query-processor.middleware.add-dimension-projections`."
  (:require
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.util.date-2 :as u.date]
   [toucan.models :as models]))

;;; Possible values for Dimension.type :
;;;
;;; :internal
;;; :external

(models/defmodel Dimension :dimension)

(mi/define-methods
 Dimension
 {:types      (constantly {:type :keyword})
  :properties (constantly {::mi/timestamped? true
                           ::mi/entity-id    true})})

(defmethod serdes/hash-fields Dimension
  [_dimension]
  [(serdes/hydrated-hash :field)
   (serdes/hydrated-hash :human_readable_field)
   :created_at])

;;; ------------------------------------------------- Serialization --------------------------------------------------
;; Dimensions are inlined onto their parent Fields.
;; We can reuse the [[serdes/load-one!]] logic by implementing [[serdes/load-xform]] though.
(defmethod serdes/load-xform "Dimension"
  [dim]
  (-> dim
      serdes/load-xform-basics
      ;; No need to handle :field_id, it was just added as the raw ID by the caller; see Field's load-one!
      (update            :human_readable_field_id serdes/*import-field-fk*)
      (update            :created_at              u.date/parse)))
