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
   [metabase.util :as u]
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
  "Insert the Dimension `rows` in one transaction and batches of [[mdb/create-partition-size]] and return the inserted
  instances, refusing a human-readable Field outside the Database of the Dimension's Field."
  [rows :- [:sequential ::warehouse-schema.schema/dimension.create]]
  (if (empty? rows)
    []
    (t2/with-transaction [_conn]
      (u/prog1 (into []
                     (mapcat (fn [batch]
                               (check-human-readable-fields (filter :human_readable_field_id batch))
                               (warehouse-schema.db/insert-dimensions! (vec batch))))
                     (partition-all mdb/create-partition-size rows))
        (events/publish-event! :event/dimension-create (events/create-event <>))))))

(defn- dimensions-by-id
  "The Dimensions with `ids`, `{id row}`, read in batches of [[mdb/delete-partition-size]] ids."
  [ids]
  (into {}
        (comp (mapcat #(warehouse-schema.db/dimensions-by-ids (vec %))) (map (juxt :id identity)))
        (partition-all mdb/delete-partition-size ids)))

(defn- check-dimension-updates
  "Throw unless every one of `rows`, the id of one of the `stored` Dimensions, `{id row}`, and its changes, satisfies this
  rule, the Databases read in one query:

  - a new human-readable Field, a Field that exists, is a Field of the Database of the Dimension's Field"
  [stored rows]
  (check-human-readable-fields
   (for [{:keys [id human_readable_field_id]} rows
         :let  [dimension (stored id)]
         :when (and dimension
                    human_readable_field_id
                    (not= human_readable_field_id (:human_readable_field_id dimension)))]
     (assoc dimension :human_readable_field_id human_readable_field_id))))

(defn- write-dimension-updates!
  "Write each of `rows`, the id of a Dimension and the columns to change, over the `stored` Dimensions, `{id row}`,
  returning the rows of the Dimensions that exist."
  [stored rows]
  (let [rows (filterv #(contains? stored (:id %)) rows)]
    (when (seq rows)
      (warehouse-schema.db/update-dimensions! rows))
    rows))

(defn- publish-dimension-updates!
  "Publish the update event of `rows`, the rows written over the `stored` Dimensions, `{id row}`, when there are any."
  [stored rows]
  (when (seq rows)
    (events/publish-event! :event/dimension-update (events/update-event stored rows))))

(mu/defn update-dimensions! :- [:sequential ::warehouse-schema.schema/dimension.update]
  "Apply each of `rows`, the id of a Dimension and the columns to change, in one transaction and batches of
  [[mdb/update-partition-size]], publish one event for all of them, and return them, refusing a new human-readable
  Field outside the Database of the Dimension's Field."
  [rows :- [:sequential ::warehouse-schema.schema/dimension.update]]
  (when (seq rows)
    (t2/with-transaction [_conn]
      (let [stored  (dimensions-by-id (map :id rows))
            written (into []
                          (mapcat (fn [batch]
                                    (check-dimension-updates stored batch)
                                    (write-dimension-updates! stored batch)))
                          (partition-all mdb/update-partition-size rows))]
        (publish-dimension-updates! stored written))))
  (vec rows))

(mu/defn delete-dimensions! :- :nil
  "Delete the Dimensions with `ids` in one transaction: one event for all of them before the statements, which run in
  batches of [[mdb/delete-partition-size]]."
  [ids :- [:sequential ::lib.schema.id/dimension]]
  (when (seq ids)
    (t2/with-transaction [_conn]
      (when-let [dimensions (not-empty (vec (vals (dimensions-by-id ids))))]
        (events/publish-event! :event/dimension-delete (events/delete-event dimensions))
        (run! #(warehouse-schema.db/delete-dimensions! (mapv :id %)) (partition-all mdb/delete-partition-size dimensions)))))
  nil)

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
   :update!       update-dimensions!
   :delete!       delete-dimensions!
   :rows-by-refs  serialization/dimension-rows-by-refs})

(defmethod remote-sync/spec :model/Dimension
  [_model]
  {:synced-items         warehouse-schema.db/synced-dimension-items
   :synced-filter-clause warehouse-schema.db/synced-field-clause})

(defmethod eid-translation/spec :model/Dimension [_model]
  {:names [:dimension]})
