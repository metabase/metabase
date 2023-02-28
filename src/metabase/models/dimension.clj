(ns metabase.models.dimension
  "Dimensions are used to define remappings for Fields handled automatically when those Fields are encountered by the
  Query Processor. For a more detailed explanation, refer to the documentation in
  `metabase.query-processor.middleware.add-dimension-projections`."
  (:require
   [metabase.models.interface :as mi]
   [metabase.models.serialization.base :as serdes.base]
   [metabase.models.serialization.hash :as serdes.hash]
   [metabase.models.serialization.util :as serdes.util]
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

(defmethod serdes.hash/identity-hash-fields Dimension
  [_dimension]
  [(serdes.hash/hydrated-hash :field "<none>")
   (serdes.hash/hydrated-hash :human_readable_field "<none>")
   :created_at])

;;; ------------------------------------------------- Serialization --------------------------------------------------
;; Dimensions are inlined onto their parent Fields.
;; We can reuse the [[serdes.base/load-one!]] logic by implementing [[serdes.base/load-xform]] though.
(defmethod serdes.base/load-xform "Dimension"
  [dim]
  (-> dim
      serdes.base/load-xform-basics
      ;; No need to handle :field_id, it was just added as the raw ID by the caller; see Field's load-one!
      (update            :human_readable_field_id serdes.util/import-field-fk)
      (update            :created_at              u.date/parse)))
