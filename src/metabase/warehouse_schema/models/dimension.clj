(ns metabase.warehouse-schema.models.dimension
  "Dimensions are used to define remappings for Fields handled automatically when those Fields are encountered by the
  Query Processor. For a more detailed explanation, refer to the documentation in
  `metabase.query-processor.middleware.add-remaps`."
  (:require
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as mdb]
   [metabase.eid-translation.spec :as eid-translation]
   [metabase.events.core :as events]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.serialization.core :as serialization]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
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
  (derive :hook/timestamped?))

(t2/deftransforms :model/Dimension
  {:type mi/transform-keyword})

;;; ----------------------------------------------------- Hooks ------------------------------------------------------

(defn- check-external-needs-field
  "Throws a 400 when `dimension`, with the columns a write leaves out at their stored or default values, is external
  without a Field."
  [{dimension-type :type, :keys [human_readable_field_id]}]
  (when (and (= :external (some-> dimension-type keyword)) (nil? human_readable_field_id))
    (throw (ex-info (tru "Foreign key based remappings require a human readable field id") {:status-code 400}))))

(t2/define-before-insert :model/Dimension
  [dimension]
  (check-external-needs-field dimension)
  dimension)

(t2/define-before-update :model/Dimension
  [dimension]
  (let [changes (t2/changes dimension)]
    (when (contains? changes :field_id)
      (throw (ex-info (tru "You cannot move a Dimension to another Field.") {:status-code 400})))
    (when (some #(contains? changes %) [:type :human_readable_field_id])
      (check-external-needs-field dimension))
    dimension))

;;; ----------------------------------------------------- Writes -----------------------------------------------------

(defn- check-human-readable-fields
  "Throw a 400 unless every one of `dimensions` satisfies this rule, the Databases of all of them read in one query:

  - its human-readable Field, a Field that exists, is a Field of the Database of its own Field"
  [dimensions]
  (when (seq dimensions)
    (let [field-id->database-id (warehouse-schema.db/field-database-ids
                                 (into #{} (comp (mapcat (juxt :field_id :human_readable_field_id)) (remove nil?))
                                       dimensions))]
      (doseq [{:keys [field_id human_readable_field_id]} dimensions]
        (when-some [target-database-id (field-id->database-id human_readable_field_id)]
          (api/checkp (= target-database-id (field-id->database-id field_id))
                      :human_readable_field_id (tru "Target field must belong to the same database")))))))

(defn- check-new-dimensions
  "Throw a 400 unless every one of the new Dimension `rows` satisfies this rule:

  - its human-readable Field, a Field that exists, is a Field of the Database of its own Field"
  [rows]
  (check-human-readable-fields (filter :human_readable_field_id rows)))

(mu/defn create-dimensions! :- [:sequential ::warehouse-schema.schema/dimension]
  "Insert the Dimension `rows` in one transaction, publishing their create event, and return the inserted Dimensions,
  refusing a human-readable Field outside the Database of the Dimension's Field."
  [rows :- [:sequential ::warehouse-schema.schema/dimension.create]]
  (mdb/create-batched! :model/Dimension rows
                       {:before-create check-new-dimensions
                        :after-create  #(events/publish-event! :event/dimension-create (events/create-event %))}))

(defn- check-dimension-updates
  "Throw a 400 unless every one of `updates`, the id of one of the `id->stored` Dimensions and its changes, satisfies
  this rule, the Databases read in one query:

  - a new human-readable Field, a Field that exists, is a Field of the Database of the Dimension's Field"
  [updates id->stored]
  (check-human-readable-fields
   (for [{:keys [id human_readable_field_id]} updates
         :let  [dimension (id->stored id)]
         :when (and dimension
                    human_readable_field_id
                    (not= human_readable_field_id (:human_readable_field_id dimension)))]
     (assoc dimension :human_readable_field_id human_readable_field_id))))

(defn- publish-dimension-updates!
  "Publish the update event of `updates` over the `id->stored` Dimensions, when any of them exists."
  [updates id->stored _id->updated]
  (when (seq id->stored)
    (events/publish-event! :event/dimension-update (events/update-event id->stored updates))))

(mu/defn update-dimensions! :- :nil
  "Apply `updates`, each the `:id` of a Dimension and the columns to change, in one transaction, publishing their update
  event, refusing a new human-readable Field outside the Database of the Dimension's Field."
  [updates :- [:sequential ::warehouse-schema.schema/dimension.update]]
  (mdb/update-batched! :model/Dimension updates
                       {:before-update check-dimension-updates
                        :after-update  publish-dimension-updates!}))

(mu/defn delete-dimensions! :- :nil
  "Delete the Dimensions with `ids` in one transaction, publishing their delete event."
  [ids :- [:sequential ::lib.schema.id/dimension]]
  (mdb/delete-batched! :model/Dimension ids
                       {:before-delete #(events/publish-event! :event/dimension-delete (events/delete-event %))}))

(mu/defn rename-dimensions-for-fields!
  "Name the Dimension of each Field in `field-id->name` after it, in one statement."
  [field-id->name :- [:map-of ::lib.schema.id/field :string]]
  (when (seq field-id->name)
    (t2/with-transaction [_conn]
      (when-let [dimensions (not-empty (warehouse-schema.db/dimensions-for-fields (set (keys field-id->name))))]
        (warehouse-schema.db/rename-dimensions-for-fields! field-id->name)
        (events/publish-event! :event/dimension-update
                               (events/update-event (zipmap (map :id dimensions) dimensions)
                                                    (mapv (fn [{:keys [id field_id]}] {:id id :name (field-id->name field_id)})
                                                          dimensions)))))))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/Dimension [_model]
  {:skip? false})

(defmethod serialization/spec :model/Dimension [_]
  {:schema        ::warehouse-schema.schema/external-dimension
   :identity      [:field_id]
   :copy          [:name :type :entity_id]
   :parent        {:model :model/Field :key :field_id :import-only? true}
   :transform     {:human_readable_field_id serialization/field-transform
                   :field_id                warehouse-schema.serialization/dimension-field-id-transform}
   :storage-paths warehouse-schema.serialization/dimension-storage-paths
   :insert!       create-dimensions!
   :update!       #(do (update-dimensions! %) %)
   :delete!       delete-dimensions!
   :rows-by-refs  serialization/dimension-rows-by-refs})

(defmethod remote-sync/spec :model/Dimension
  [_model]
  {:synced-items         warehouse-schema.db/synced-dimension-items
   :synced-filter-clause warehouse-schema.db/synced-field-clause})

(defmethod eid-translation/spec :model/Dimension [_model]
  {:names [:dimension]})
