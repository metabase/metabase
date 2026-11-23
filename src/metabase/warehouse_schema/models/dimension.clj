(ns metabase.warehouse-schema.models.dimension
  "Dimensions are used to define remappings for Fields handled automatically when those Fields are encountered by the
  Query Processor. For a more detailed explanation, refer to the documentation in
  `metabase.query-processor.middleware.add-remaps`."
  (:require
   [malli.util :as mut]
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.eid-translation.spec :as eid-translation]
   [metabase.events.core :as events]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.serialization.core :as serialization]
   [metabase.util :as u]
   [metabase.util.events :as u.events]
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

(mu/defn create-dimensions! :- [:sequential ::warehouse-schema.schema/dimension]
  "Insert the Dimension `rows` and return the inserted instances, refusing a human-readable Field outside the Database
  of the Dimension's Field."
  [rows :- [:sequential ::warehouse-schema.schema/dimension.create]]
  (if (empty? rows)
    []
    (t2/with-transaction [_conn]
      (check-human-readable-fields (filter :human_readable_field_id rows))
      (u/prog1 (vec (warehouse-schema.db/insert-dimensions! rows))
        (events/publish-event! :event/dimension-create (events/create-event <>))))))

(mu/defn update-dimensions!
  "Apply `changes` to the Dimensions with `ids` and publish one update event, refusing a new human-readable Field
  outside the Database of the Dimension's Field: one read and one statement per distinct stored state, with the check
  before them."
  [ids     :- [:sequential ::lib.schema.id/dimension]
   changes :- (mut/dissoc ::warehouse-schema.schema/dimension.update :id)]
  (when (seq ids)
    (t2/with-transaction [_conn]
      (let [stored       (u/index-by :id (warehouse-schema.db/dimensions-by-ids ids))
            existing-ids (filterv stored ids)]
        (when (seq existing-ids)
          (when-let [human-readable-field-id (:human_readable_field_id changes)]
            (check-human-readable-fields
             (for [id existing-ids
                   :when (not= human-readable-field-id (:human_readable_field_id (stored id)))]
               (assoc (stored id) :human_readable_field_id human-readable-field-id))))
          (warehouse-schema.db/update-dimensions! stored changes)
          (events/publish-event! :event/dimension-update
                                 (events/update-event stored (mapv #(assoc changes :id %) existing-ids))))))))

(mu/defn update-dimensions-for-import!
  "Apply each of `rows`, the id of a Dimension and the columns to change, one statement for the rows with the same changes."
  [rows :- [:sequential ::warehouse-schema.schema/dimension.update]]
  (doseq [[changes rows] (group-by #(dissoc % :id) rows)]
    (update-dimensions! (mapv :id rows) changes)))

(mu/defn delete-dimensions!
  "Delete the Dimensions with `ids`, read once for the delete event published right before the statement."
  [ids :- [:sequential ::lib.schema.id/dimension]]
  (when (seq ids)
    (t2/with-transaction [_conn]
      (when-let [dimensions (not-empty (warehouse-schema.db/dimensions-by-ids ids))]
        (events/publish-event! :event/dimension-delete {:changes (u.events/delete-changes (vec dimensions)) :user-id (mi/current-user-id)})
        (warehouse-schema.db/delete-dimensions! (mapv :id dimensions))))))

(mu/defn rename-dimensions-for-fields!
  "Name the Dimension of each Field in `field-id->name` after it, in one statement."
  [field-id->name :- [:map-of ::lib.schema.id/field :string]]
  (when (seq field-id->name)
    (t2/with-transaction [_conn]
      (when-let [dimensions (not-empty (warehouse-schema.db/dimensions-for-fields (set (keys field-id->name))))]
        (warehouse-schema.db/rename-dimensions-for-fields! field-id->name)
        (events/publish-event! :event/dimension-update
                               (events/update-event (u/index-by :id dimensions)
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
   :update!       update-dimensions-for-import!
   :delete!       delete-dimensions!
   :rows-by-refs  serialization/dimension-rows-by-refs})

(defmethod remote-sync/spec :model/Dimension
  [_model]
  {:synced-items         warehouse-schema.db/synced-dimension-items
   :synced-filter-clause warehouse-schema.db/synced-field-clause})

(defmethod eid-translation/spec :model/Dimension [_model]
  {:names [:dimension]})
