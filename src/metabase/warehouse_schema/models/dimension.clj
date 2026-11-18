(ns metabase.warehouse-schema.models.dimension
  "Dimensions are used to define remappings for Fields handled automatically when those Fields are encountered by the
  Query Processor. For a more detailed explanation, refer to the documentation in
  `metabase.query-processor.middleware.add-remaps`."
  (:require
   [metabase.api.common :as api]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.serialization.core :as serialization]
   [metabase.util.i18n :refer [tru]]
   [metabase.warehouse-schema.db :as warehouse-schema.db]
   [metabase.warehouse-schema.schema :as warehouse-schema.schema]
   [metabase.warehouse-schema.serialization :as warehouse-schema.serialization]
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
  (derive :hook/events))

(defmethod events/spec :model/Dimension
  [_model]
  {:create :event/dimension-create
   :update :event/dimension-update
   :delete :event/dimension-delete})

(t2/deftransforms :model/Dimension
  {:type mi/transform-keyword})

;;; ----------------------------------------------------- Hooks ------------------------------------------------------

(defn- check-external-needs-field
  "Throws a 400 when `dimension`, with the columns a write leaves out at their stored or default values, is external
  without a Field."
  [{dimension-type :type, :keys [human_readable_field_id]}]
  (when (and (= :external (some-> dimension-type keyword)) (nil? human_readable_field_id))
    (throw (ex-info (tru "Foreign key based remappings require a human readable field id") {:status-code 400}))))

(defn- check-human-readable-field
  "Throws a 400 unless the `:human_readable_field_id` of `dimension` is a Field of the Database of its Field."
  [{:keys [field_id human_readable_field_id]}]
  (let [field-id->database-id (warehouse-schema.db/field-database-ids
                               (into #{} (remove nil?) [field_id human_readable_field_id]))
        target-database-id    (field-id->database-id human_readable_field_id)]
    (api/checkp target-database-id :human_readable_field_id (tru "Invalid target field"))
    (api/checkp (= target-database-id (field-id->database-id field_id))
                :human_readable_field_id (tru "Target field must belong to the same database"))))

(t2/define-before-insert :model/Dimension
  [dimension]
  (check-external-needs-field dimension)
  (when (:human_readable_field_id dimension)
    (check-human-readable-field dimension))
  dimension)

(t2/define-before-update :model/Dimension
  [dimension]
  (let [changes (t2/changes dimension)]
    (when (contains? changes :field_id)
      (throw (ex-info (tru "You cannot move a Dimension to another Field.") {:status-code 400})))
    (when (some #(contains? changes %) [:type :human_readable_field_id])
      (check-external-needs-field dimension))
    (when (:human_readable_field_id changes)
      (check-human-readable-field dimension))
    dimension))

;;; ------------------------------------------------- Serialization --------------------------------------------------

(defmethod serialization/spec :model/Dimension [_]
  {:schema        ::warehouse-schema.schema/external-dimension
   :identity      [:field_id]
   :copy          [:name :type :entity_id]
   :parent        {:model :model/Field :key :field_id :import-only? true}
   :transform     {:human_readable_field_id serialization/field-transform
                   :field_id                warehouse-schema.serialization/dimension-field-id-transform}
   :storage-paths warehouse-schema.serialization/dimension-storage-paths
   :rows-by-refs  serialization/dimension-rows-by-refs})

;;; -------------------------------------------------- Remote sync ---------------------------------------------------

(defmethod remote-sync/spec :model/Dimension
  [_model]
  {:synced-items         warehouse-schema.db/synced-dimension-items
   :synced-filter-clause warehouse-schema.db/synced-field-clause})
