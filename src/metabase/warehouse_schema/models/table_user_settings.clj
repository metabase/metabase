(ns metabase.warehouse-schema.models.table-user-settings
  (:require
   [malli.util :as mut]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.sql-errors :as sql-errors]
   [metabase.audit-app.spec :as audit]
   [metabase.collections.models.collection :as collection]
   [metabase.dependencies.core :as dependencies]
   [metabase.events.core :as events]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.serialization.core :as serialization]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.audit :as warehouse-schema.audit]
   [metabase.warehouse-schema.db :as warehouse-schema.db]
   [metabase.warehouse-schema.models.field-user-settings :as field-user-settings]
   [metabase.warehouse-schema.models.table :as table]
   [metabase.warehouse-schema.schema :as warehouse-schema.schema]
   [metabase.warehouse-schema.serialization :as warehouse-schema.serialization]
   [metabase.warehouse-schema.user-settings :as user-settings]
   [metabase.warehouse-schema.user-settings-writes :as user-settings-writes]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- Model setup ---------------------------------------------------

(methodical/defmethod t2/table-name :model/TableUserSettings [_model] :metabase_table_user_settings)

(t2/deftransforms :model/TableUserSettings
  {:entity_type     mi/transform-keyword
   :visibility_type mi/transform-keyword
   :field_order     mi/transform-keyword
   :data_layer      (mi/transform-validator-with-fixes
                     mi/transform-keyword
                     (partial mi/assert-optional-enum table/data-layers)
                     (some-fn table/legacy-data-layer->current identity))
   :data_source     (mi/transform-validator-with-fixes
                     mi/transform-keyword
                     (partial mi/assert-optional-enum table/data-sources)
                     (some-fn keyword identity))
   :data_authority  table/transform-data-authority})

(doto :model/TableUserSettings
  (derive :metabase/model)
  (derive :hook/worktree-id)
  (derive :hook/timestamped?)
  (derive :search/indexed))

;;; ----------------------------------------------------- Hooks ------------------------------------------------------

(defn- complete-pairs
  "Fill in the other half of the two-column choices in `settings`: `visibility_type`/`data_layer`, derived from a
  changing half or else kept from `table`, and `is_published`/`collection_id`, kept from `row`, the settings as
  stored, if any."
  [settings table row]
  (let [changing? (fn [k] (not= (some-> (get settings k) keyword)
                                (some-> (get table k) keyword)))]
    (cond-> settings
      (and (contains? settings :visibility_type) (not (contains? settings :data_layer)))
      (assoc :data_layer (if (changing? :visibility_type)
                           (table/visibility-type->data-layer (some-> (:visibility_type settings) keyword))
                           (:data_layer table)))

      (and (contains? settings :data_layer) (not (contains? settings :visibility_type)))
      (assoc :visibility_type (if (changing? :data_layer)
                                (table/data-layer->visibility-type (some-> (:data_layer settings) keyword))
                                (:visibility_type table)))

      (and (contains? settings :collection_id) (not (contains? settings :is_published)))
      (assoc :is_published (boolean (:is_published row))))))

(defn- with-set-flags
  "Set the `_set` flag of every flagged column in `effective`, unless `explicit` sets the flag itself."
  [settings effective explicit]
  (reduce-kv (fn [m column flag]
               (cond-> m
                 (and (contains? effective column) (not (contains? explicit flag)))
                 (assoc flag true)))
             settings
             user-settings/table-set-flags))

(defn- pair-columns-written?
  "Whether `explicit` writes a column whose pair [[complete-pairs]] completes."
  [explicit]
  (boolean (some #(contains? explicit %) [:visibility_type :data_layer :collection_id])))

(defn- check-publication
  "Throws a 400 when `settings` put a Table in a Collection without publishing it."
  [{:keys [is_published collection_id]}]
  (when (and (not is_published) (some? collection_id))
    (throw (ex-info (tru "Only a published Table can be in a Collection.") {:status-code 400}))))

(t2/define-before-insert :model/TableUserSettings
  [settings]
  (check-publication settings)
  (with-set-flags settings settings settings))

(t2/define-before-update :model/TableUserSettings
  [settings]
  (let [changes (t2/changes settings)]
    (when (some #(contains? changes %) user-settings/settings-only-table-columns)
      (check-publication settings))
    (with-set-flags settings changes changes)))

;;; ----------------------------------------------------- Writes -----------------------------------------------------

(defn- check-allowed-contents
  "Throws unless each Collection among `collection-ids` can hold Tables, all read in one query and checked in the order
  of their first appearance."
  [collection-ids]
  (when-let [ids (not-empty (into [] (comp (remove nil?) (distinct)) collection-ids))]
    (let [collections (warehouse-schema.db/collections-for-content-checks (set ids))]
      (run! #(collection/check-allowed-content :table (collections %)) ids))))

(defn- completed-changes
  "`explicit`, the columns a write sets, with its two-column pairs completed from `table` and from `stored`, the
  settings as stored, if any, and the flags of what it sets."
  [explicit table stored]
  (let [completed (cond-> explicit
                    (pair-columns-written? explicit) (complete-pairs table stored))]
    (with-set-flags completed completed explicit)))

(defn- changed-columns
  "The columns of `row` whose values differ from those of `stored`."
  [row stored]
  (into {} (remove (fn [[k v]] (= v (get stored k)))) row))

(defn- tables-for
  "The Tables, by id, of those of the settings `rows` that write a column of a two-column pair."
  [rows]
  (into {}
        (map (juxt :id identity))
        (warehouse-schema.db/tables (into #{} (comp (filter pair-columns-written?) (keep :table_id)) rows))))

(def ^:private writes-spec
  "The spec of TableUserSettings for [[metabase.warehouse-schema.user-settings-writes]]."
  {:model                  :model/TableUserSettings
   :topics                 {:create :event/table-user-settings-create
                            :update :event/table-user-settings-update
                            :delete :event/table-user-settings-delete}
   :settings-by-ids        warehouse-schema.db/table-user-settings-by-ids
   :empty-settings         warehouse-schema.db/empty-table-user-settings
   :delete-empty-settings! warehouse-schema.db/delete-empty-table-user-settings!})

(defn- without-derived-half
  "Drop from `changes` the half of a `visibility_type`/`data_layer` pair the Table's own update derives from the other."
  [{:keys [visibility_type data_layer] :as changes}]
  (if (and (contains? changes :visibility_type) (contains? changes :data_layer))
    (if (= (some-> data_layer keyword) (table/visibility-type->data-layer (some-> visibility_type keyword)))
      (dissoc changes :data_layer)
      (dissoc changes :visibility_type))
    changes))

(defn- write-tables!
  "Write each of `table-rows`, the `:id` of a Table and the columns to change, onto its Table with `opts` for the
  events; in a remote sync worktree, which leaves the main app's Tables as they are, only check the changes."
  [table-rows opts]
  (if (mdb/non-default-worktree?)
    (let [tables (warehouse-schema.db/tables-by-ids (mapv :id table-rows))]
      (doseq [{:keys [id] :as row} table-rows]
        (table/check-changes (dissoc row :id) (tables id))))
    (table/update-tables! table-rows opts)))

(defn- update-field-positions!
  "Set the positions of the Fields of `tables` from their field order, outside a remote sync worktree, which leaves the
  main app's Fields as they are."
  [tables]
  (when-not (mdb/non-default-worktree?)
    (table/update-field-positions! tables)))

(defn- mirror-onto-tables!
  "Write the columns each of the settings `rows` says a user set onto its Table, in one update, with `opts` for the
  events."
  [rows opts]
  (when-let [table-rows (not-empty
                         (into []
                               (keep (fn [{:keys [table_id] :as settings}]
                                       (when-let [changes (not-empty
                                                           (without-derived-half
                                                            (user-settings/table-row-columns
                                                             (select-keys settings (user-settings/user-set-table-columns settings)))))]
                                         (assoc changes :id table_id))))
                               rows))]
    (write-tables! table-rows opts)))

(defn- update-settings!
  "Apply to each of the `stored` settings rows its `row` of changes, with its two-column pairs completed from its Table
  among `tables` and its flags set, one update per distinct change, returning `writes` with the updates."
  [writes stored+rows tables]
  (let [by-id (into {}
                    (map (fn [[stored row]]
                           [(:id stored) (merge row (completed-changes (changed-columns row stored) (tables (:table_id stored)) stored))]))
                    stored+rows)]
    (warehouse-schema.db/update-table-user-settings-rows! (mapv (fn [[id changes]] (assoc changes :id id)) by-id))
    (user-settings-writes/add-updated writes writes-spec (map first stored+rows) (comp by-id :id))))

(defn- completed-rows
  "The new settings `rows` with their two-column pairs completed from their Tables; a Collection that cannot hold Tables
  throws."
  [rows]
  (check-allowed-contents (map :collection_id rows))
  (let [tables (tables-for rows)]
    (mapv #(completed-changes % (tables (:table_id %)) nil) rows)))

(mu/defn create-table-user-settings! :- [:sequential ::warehouse-schema.schema/table-user-settings]
  "Insert the TableUserSettings `rows`, their two-column pairs completed from their Tables, write the columns they say a
  user set onto their Tables, and return the inserted instances; a row that holds no user value is deleted again."
  [rows :- [:sequential ::warehouse-schema.schema/table-user-settings.create]]
  (mdb/create-batched! :model/TableUserSettings rows
                       {:before-create completed-rows
                        :after-create  (fn [inserted]
                                         (let [writes (-> (user-settings-writes/add-created {} inserted)
                                                          (user-settings-writes/delete-empty! writes-spec (map :table_id inserted)))]
                                           (mirror-onto-tables! inserted nil)
                                           (user-settings-writes/publish-writes! writes writes-spec)))}))

(defn- write-settings-updates!
  "Write each of `rows`, the id of one of the `stored` TableUserSettings, `{id row}`, and the columns to change, with its
  two-column pairs completed from its Table, and delete the settings it leaves without a user value, returning
  `writes` with these writes; a Collection that cannot hold Tables throws when a row moves its Table there."
  [writes stored rows]
  (check-allowed-contents (for [{:keys [id collection_id]} rows
                                :when (not= collection_id (:collection_id (stored id)))]
                            collection_id))
  (let [tables (tables-for (map #(merge (dissoc % :table_id) (select-keys (stored (:id %)) [:table_id])) rows))]
    (-> writes
        (update-settings! (map (fn [row] [(stored (:id row)) (dissoc row :id)]) rows) tables)
        (user-settings-writes/delete-empty! writes-spec (map (comp :table_id stored :id) rows)))))

(mu/defn update-table-user-settings! :- [:sequential ::warehouse-schema.schema/table-user-settings.update]
  "Apply each of `rows`, the id of a TableUserSettings and the columns to change, in one transaction and batches of
  [[mdb/update-partition-size]], their two-column pairs completed from their Tables, write the columns the updated
  settings say a user set onto their Tables, publish one create, update and delete event with `opts`, and return them."
  ([rows :- [:sequential ::warehouse-schema.schema/table-user-settings.update]]
   (update-table-user-settings! rows nil))
  ([rows :- [:sequential ::warehouse-schema.schema/table-user-settings.update]
    opts :- :metabase.events.schema/write-opts]
   (when (seq rows)
     (t2/with-transaction [_conn]
       (let [stored  (user-settings-writes/settings-by-id writes-spec (map :id rows))
             written (filterv #(contains? stored (:id %)) rows)
             writes  (reduce #(write-settings-updates! %1 stored (vec %2))
                             {}
                             (partition-all mdb/update-partition-size written))]
         (mirror-onto-tables! (map #(merge (stored (:id %)) %) written) opts)
         (user-settings-writes/publish-writes! writes writes-spec opts))))
   (vec rows)))

(defn- update-or-insert-settings!
  "Write `settings` as the user values of the Table with `table-id`, its pairs completed from `stored-table`: as changes
  to its `stored` settings, or as a new row when there are none, and as changes to the settings a concurrent insert
  stored first; returns `{:stored s :changes c}` or `{:inserted s}`."
  [table-id stored settings stored-table]
  (if stored
    (let [flagged (with-set-flags settings settings settings)
          changes (merge flagged (completed-changes (changed-columns flagged stored) stored-table stored))]
      (warehouse-schema.db/update-table-user-settings! table-id changes)
      {:stored stored :changes changes})
    (try
      {:inserted (warehouse-schema.db/insert-table-user-settings-row!
                  (assoc (completed-changes settings stored-table nil) :table_id table-id))}
      (catch Exception e
        (if-let [stored (when (sql-errors/duplicate-key? e) (warehouse-schema.db/table-user-settings table-id))]
          (update-or-insert-settings! table-id stored settings stored-table)
          (throw e))))))

(mu/defn upsert-table-user-settings!
  "Record the user-settable Table columns present in `settings` as the user values of `table`: in its settings, and in
  its row outside a remote sync worktree, which reads them through the settings. In a worktree, throws a 400 for a
  change the Table cannot take. A nil for a column without a set flag unsets it."
  [{:keys [id]} :- ::warehouse-schema.schema/table
   settings     :- (mut/dissoc ::warehouse-schema.schema/table-user-settings.update :id)]
  (let [settings (u/select-keys-when settings :present user-settings/user-settable-table-columns)]
    (when (seq settings)
      (t2/with-transaction [_conn]
        (check-allowed-contents [(:collection_id settings)])
        (let [stored-table (when (pair-columns-written? settings) (warehouse-schema.db/table id))
              {:keys [stored changes inserted]} (update-or-insert-settings!
                                                 id (warehouse-schema.db/table-user-settings id) settings stored-table)
              writes       (-> (if stored
                                 (user-settings-writes/add-updated {} writes-spec [stored] (constantly changes))
                                 (user-settings-writes/add-created {} [inserted]))
                               (user-settings-writes/delete-empty! writes-spec [id]))]
          (when-let [changes (not-empty (user-settings/table-row-columns settings))]
            (write-tables! [(assoc changes :id id)] nil))
          (user-settings-writes/publish-writes! writes writes-spec)
          1)))))

(mu/defn upsert-table-user-settings-for-tables!
  "Applies [[upsert-table-user-settings!]] to every Table in `table-ids`.
  It inserts the missing settings rows and updates the existing ones, once per distinct change.
  Settings rows the change leaves empty are deleted, and the Tables are updated."
  [table-ids :- [:set ::lib.schema.id/table]
   settings  :- (mut/dissoc ::warehouse-schema.schema/table-user-settings.update :id)]
  (let [settings (u/select-keys-when settings :present user-settings/user-settable-table-columns)]
    (when (and (seq settings) (seq table-ids))
      (t2/with-transaction [_conn]
        (check-allowed-contents [(:collection_id settings)])
        (let [tables   (if (pair-columns-written? settings)
                         (u/index-by :id (warehouse-schema.db/tables table-ids))
                         {})
              existing (u/index-by :table_id (warehouse-schema.db/table-user-settings-for-tables table-ids))
              writes   (if-let [missing (not-empty (remove existing table-ids))]
                         (user-settings-writes/add-created
                          {}
                          (warehouse-schema.db/insert-table-user-settings-returning-instances!
                           (mapv #(completed-changes (assoc settings :table_id %) (tables %) nil) missing)))
                         {})
              writes   (-> writes
                           (update-settings! (for [table-id table-ids
                                                   :let [stored (existing table-id)]
                                                   :when stored]
                                               [stored (with-set-flags settings settings settings)])
                                             tables)
                           (user-settings-writes/delete-empty! writes-spec table-ids))]
          (when-let [changes (not-empty (user-settings/table-row-columns settings))]
            (write-tables! (for [id table-ids] (assoc changes :id id)) nil))
          (user-settings-writes/publish-writes! writes writes-spec)
          (count table-ids))))))

(defn- valid-field-order?
  "Field ordering is valid if all the fields from a given table are present and only from that table."
  [table field-ordering]
  (= (warehouse-schema.db/active-field-ids-for-table (u/the-id table))
     (set field-ordering)))

(defn custom-order-fields!
  "Set field order to `field-order`."
  [table field-order]
  {:pre [(valid-field-order? table field-order)]}
  (t2/with-transaction [_conn]
    (upsert-table-user-settings! table {:field_order :custom})
    (field-user-settings/set-custom-positions! (zipmap field-order (range)))
    (update-field-positions! [(warehouse-schema.db/table (u/the-id table))])))

(mu/defn unset-table-user-settings!
  "Drop the user values of the Table columns `ks` for `table` from its settings, leaving its row as it is for sync to
  take over."
  [{:keys [id]} :- ::warehouse-schema.schema/table
   ks           :- [:sequential (into [:enum] user-settings/user-settable-table-columns)]]
  (when-let [stored (warehouse-schema.db/table-user-settings id)]
    (t2/with-transaction [_conn]
      (let [row (into {} (mapcat (fn [k]
                                   (cond-> [[k nil]]
                                     (user-settings/table-set-flags k) (conj [(user-settings/table-set-flags k) false]))))
                      ks)]
        (user-settings-writes/publish-writes! (-> {}
                                                  (update-settings! [[stored row]] (tables-for [(assoc row :table_id id)]))
                                                  (user-settings-writes/delete-empty! writes-spec [id]))
                                              writes-spec)))))

(mu/defn ids-of-tables :- [:sequential ms/PositiveInt]
  "The ids of the TableUserSettings of the Tables with `table-ids`."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (mapv :id (warehouse-schema.db/table-user-settings-for-tables (set table-ids))))

(mu/defn delete-table-user-settings! :- :nil
  "Delete the TableUserSettings with `ids` in one transaction, publishing their delete event, leaving their Tables as
  they are for sync to take over."
  [ids :- [:sequential ms/PositiveInt]]
  (mdb/delete-batched! :model/TableUserSettings ids
                       {:before-delete #(events/publish-event! :event/table-user-settings-delete (events/delete-event %))}))

(defn- load-legacy-fields!
  "Loads the FieldUserSettings that the settings `items` of an older export carry under `:fields`, deleting the other
  FieldUserSettings of their Tables, all of them in one load and one delete."
  [items]
  (when-let [legacy (not-empty (filterv #(contains? (:entity %) :fields) items))]
    (let [kept (into #{} (map :field_id)
                     (serialization/load :model/FieldUserSettings
                                         (into [] (mapcat #(map serialization/restore-identity (:fields (:entity %)))) legacy)))]
      (field-user-settings/delete-field-user-settings!
       (field-user-settings/ids-of-fields
        (vec (remove kept (warehouse-schema.db/field-ids-with-user-settings-for-tables
                           (into #{} (map #(:table_id (:instance %))) legacy)))))))))

(defn- after-load
  "Loads the FieldUserSettings that the loaded TableUserSettings `items` of an older export carry, then sets the
  positions of the Fields of the Tables whose field order they load."
  [items]
  (load-legacy-fields! items)
  (when-let [table-ids (not-empty (into #{} (comp (filter #(:field_order (:instance %))) (map #(:table_id (:instance %)))) items))]
    (update-field-positions! (vec (vals (u/index-by :id (warehouse-schema.db/tables table-ids)))))))

(defmethod collection/archive-in-collections! :model/TableUserSettings
  [_model collection-ids opts]
  (when-let [ids (not-empty (warehouse-schema.db/table-user-settings-ids-of-published-tables-in-collections (vec collection-ids)))]
    (update-table-user-settings! (for [id ids] {:id id :collection_id nil :is_published false}) opts)))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/TableUserSettings [_model]
  {:skip? false})

(defmethod audit/spec :model/TableUserSettings [_model]
  {:track          [:table_id]
   :track-redacted [:caveats :caveats_set :collection_id :data_authority :data_layer :data_layer_set :data_source
                    :data_source_set :description :description_set :display_name :entity_type :field_order
                    :is_published :owner_email :owner_user_id :points_of_interest :points_of_interest_set
                    :show_in_getting_started :visibility_type :visibility_type_set]
   :skip           []
   :topics         {}
   :subject        (fn [{:keys [object previous-object]}]
                     [:model/Table (:table_id (or object previous-object))])
   :moments        [{:topic :table-publish, :when warehouse-schema.audit/published?
                     :details warehouse-schema.audit/moment-details}
                    {:topic :table-unpublish, :when warehouse-schema.audit/unpublished?
                     :details warehouse-schema.audit/moment-details}]})

(defn- import-data-authorities
  "A transform fn importing data authorities.
  Older exports can hold the retired `authoritative`, which imports as not set by a user, so the Table keeps its own
  value: `ingested` for an upload, `unconfigured` otherwise."
  [_store _entities values _opts]
  (mapv #(when-not (table/retired-data-authority? %) (some-> % keyword)) values))

(defmethod serialization/spec :model/TableUserSettings [_]
  {:schema              ::warehouse-schema.schema/external-table-user-settings
   :identity            [:table_id]
   :copy                [:display_name :description :entity_type :visibility_type :field_order :caveats
                         :points_of_interest :show_in_getting_started :data_source :data_layer
                         :owner_email :is_published :description_set :visibility_type_set :data_layer_set
                         :data_source_set]
   :skip                [:caveats_set :points_of_interest_set]
   :defaults            {:description_set     false
                         :visibility_type_set false
                         :data_layer_set      false
                         :data_source_set     false}
   :transform           {:collection_id  (serialization/fk-transform :model/Collection)
                         :owner_user_id  serialization/user-transform
                         :table_id       serialization/table-transform
                         :data_authority {:export serialization/export-unchanged :import import-data-authorities}}
   :storage-paths       warehouse-schema.serialization/table-user-settings-storage-paths
   :import-dependencies warehouse-schema.serialization/table-user-settings-import-dependencies
   :insert!             create-table-user-settings!
   :update!             #(do (update-table-user-settings! %) %)
   :delete!             delete-table-user-settings!
   :after-load          after-load
   :rows-by-refs        serialization/table-user-settings-rows-by-refs})

(defmethod remote-sync/spec :model/TableUserSettings
  [_model]
  {:name                 (fn [{:keys [display_name table_id]}] (or display_name (last table_id)))
   :synced-items         warehouse-schema.db/synced-table-user-settings-items
   :synced-filter-clause warehouse-schema.db/synced-table-user-settings-clause})

(defmethod dependencies/spec :model/TableUserSettings [_model]
  {:part-of      {:type :table :key :table_id}
   :part-columns #{:display_name :visibility_type :data_layer :field_order}})
