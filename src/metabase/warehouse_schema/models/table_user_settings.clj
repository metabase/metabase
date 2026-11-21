(ns metabase.warehouse-schema.models.table-user-settings
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.collections.models.collection :as collection]
   [metabase.dependencies.core :as dependencies]
   [metabase.events.core :as events]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.serialization.core :as serialization]
   [metabase.util :as u]
   [metabase.util.events :as u.events]
   [metabase.util.malli :as mu]
   [metabase.warehouse-schema.db :as warehouse-schema.db]
   [metabase.warehouse-schema.models.field-user-settings :as field-user-settings]
   [metabase.warehouse-schema.models.table :as table]
   [metabase.warehouse-schema.schema :as warehouse-schema.schema]
   [metabase.warehouse-schema.serialization :as warehouse-schema.serialization]
   [metabase.warehouse-schema.user-settings :as user-settings]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.tools.before-update :as t2.before-update]))

(set! *warn-on-reflection* true)

;;; --------------------------------------------------- Definition ---------------------------------------------------

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
  (derive :hook/timestamped?))

;;; ----------------------------------------------------- Hooks ------------------------------------------------------

(defn- complete-pairs
  "Fill in the other half of the two-column choices in `settings`: `visibility_type`/`data_layer`, derived from a
  changing half or else kept from `table`, and `is_published`/`collection_id`."
  [settings table]
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
      (assoc :is_published (boolean (:is_published table))))))

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

(t2/define-before-insert :model/TableUserSettings
  [settings]
  (with-set-flags settings settings settings))

(t2/define-before-update :model/TableUserSettings
  [settings]
  (let [changes (t2/changes settings)]
    (with-set-flags settings changes changes)))

;;; ----------------------------------------------------- Writes -----------------------------------------------------

(defn- completed-changes
  "`explicit`, the columns a write sets, with its two-column pairs completed from `table` and the flags of what it
  sets."
  [explicit table]
  (let [completed (cond-> explicit
                    (pair-columns-written? explicit) (complete-pairs table))]
    (with-set-flags completed completed explicit)))

(defn- changed-columns
  "The columns of `row` whose values differ from those of `stored`."
  [row stored]
  (into {} (remove (fn [[k v]] (= v (get stored k)))) row))

(defn- tables-for
  "The Tables, by id, of those of the settings `rows` that write a column of a two-column pair, read in one query."
  [rows]
  (if-let [ids (not-empty (into #{} (comp (filter pair-columns-written?) (keep :table_id)) rows))]
    (u/index-by :id (warehouse-schema.db/tables ids))
    {}))

(defn- updated-settings
  "The settings `previous`, an instance, as an update of `changes` leaves them, with the flags their before-update sets
  and the `:updated_at` they had."
  [previous changes]
  (-> (t2.before-update/before-update :model/TableUserSettings (merge previous changes))
      (assoc :updated_at (:updated_at previous))))

(defn- with-created
  "`writes`, the writes of one call as `{id {:before row :after row}}`, with `:before` nil for a row the call created
  and `:after` `::deleted` for one it deleted, with the creation of the settings `rows`, the inserted instances."
  [writes rows]
  (reduce #(assoc %1 (:id %2) {:before nil :after %2}) writes rows))

(defn- with-updated
  "`writes` with the update of the settings `rows`, as they were read, by the changes `changes-of` gives for each."
  [writes rows changes-of]
  (reduce (fn [writes row]
            (let [{:keys [before after] :as write} (get writes (:id row))
                  current                          (if write after row)]
              (cond-> writes
                (not= ::deleted current)
                (assoc (:id row) {:before (if write before row)
                                  :after  (updated-settings current (changes-of row))}))))
          writes
          rows))

(defn- with-deleted
  "`writes` with the delete of the settings `rows`, as they were read, whose delete `changes` carry the captures."
  [writes rows changes]
  (reduce (fn [writes [row change]]
            (let [write (get writes (:id row))]
              (assoc writes (:id row) {:before   (if write (:before write) row)
                                       :after    ::deleted
                                       :captures (:captures change)})))
          writes
          (map vector rows changes)))

(defn- written-events
  "The events of `writes`: a create, an update that changes something or a delete for each row, none for a row the
  call both created and deleted."
  [writes]
  (let [writes (vals writes)]
    [[:event/table-user-settings-create
      (into [] (keep (fn [{:keys [before after]}] (when (and (nil? before) (not= ::deleted after)) {:object after}))) writes)]
     [:event/table-user-settings-update
      (into [] (keep (fn [{:keys [before after]}]
                       (when (and before (not= ::deleted after))
                         (let [change {:previous-object before :object after}]
                           (when (seq (u.events/changed-keys change)) change)))))
            writes)]
     [:event/table-user-settings-delete
      (into [] (keep (fn [{:keys [before after captures]}]
                       (when (and before (= ::deleted after))
                         (cond-> {:previous-object before} (seq captures) (assoc :captures captures)))))
            writes)]]))

(defn- delete-read!
  "Delete the settings `rows`, as they were read, with `delete!`, a function of no arguments, returning `writes` with
  their deletes."
  [writes rows delete!]
  (if (empty? rows)
    writes
    (let [changes (events/delete-changes :model/TableUserSettings (vec rows))]
      (delete!)
      (with-deleted writes rows changes))))

(defn- delete-empty!
  "Delete the settings, among those of the Tables with `table-ids`, that hold no user value and no true flag,
  returning `writes` with their deletes."
  [writes table-ids]
  (if (empty? table-ids)
    writes
    (let [table-ids (into [] (distinct) table-ids)]
      (delete-read! writes
                    (warehouse-schema.db/empty-table-user-settings table-ids)
                    #(warehouse-schema.db/delete-empty-table-user-settings! table-ids)))))

(defn- publish-writes!
  "Publish the events of `writes`."
  [writes]
  (events/publish-lifecycle! (written-events writes)))

(defn- without-derived-half
  "Drop from `changes` the half of a `visibility_type`/`data_layer` pair the Table's own update derives from the other."
  [{:keys [visibility_type data_layer] :as changes}]
  (if (and (contains? changes :visibility_type) (contains? changes :data_layer))
    (if (= (some-> data_layer keyword) (table/visibility-type->data-layer (some-> visibility_type keyword)))
      (dissoc changes :data_layer)
      (dissoc changes :visibility_type))
    changes))

(defn- mirror-onto-tables!
  "Write the columns each of the settings `rows` says a user set onto its Table."
  [rows]
  (table/update-tables! (into []
                              (keep (fn [{:keys [table_id] :as settings}]
                                      (when-let [changes (not-empty
                                                          (without-derived-half
                                                           (select-keys settings (user-settings/user-set-table-columns settings))))]
                                        (assoc changes :id table_id))))
                              rows)))

(defn- update-settings!
  "Apply to each of the `stored` settings rows its `row` of changes, with its two-column pairs completed from its Table
  among `tables` and its flags set, with one statement per distinct set of changes, returning `writes` with the
  updates."
  [writes stored+rows tables]
  (let [changes-of (fn [[stored row]]
                     (merge row (completed-changes (changed-columns row stored) (tables (:table_id stored)))))]
    (doseq [[changes pairs] (group-by changes-of stored+rows)
            :when (seq changes)]
      (warehouse-schema.db/update-table-user-settings-by-ids! (mapv (comp :id first) pairs) changes))
    (let [by-id (into {} (map (fn [pair] [(:id (first pair)) (changes-of pair)])) stored+rows)]
      (with-updated writes (map first stored+rows) (comp by-id :id)))))

(mu/defn create-table-user-settings! :- [:sequential ::warehouse-schema.schema/table-user-settings]
  "Insert the TableUserSettings `rows`, their two-column pairs completed from their Tables, write the columns they say a
  user set onto their Tables, and return the inserted instances; a row that holds no user value is deleted again."
  [rows :- [:sequential ::warehouse-schema.schema/table-user-settings.update]]
  (if (empty? rows)
    []
    (t2/with-transaction [_conn]
      (let [tables   (tables-for rows)
            inserted (vec (warehouse-schema.db/insert-table-user-settings-returning-instances!
                           (mapv #(completed-changes % (tables (:table_id %))) rows)))
            writes   (delete-empty! (with-created {} inserted) (map :table_id inserted))]
        (mirror-onto-tables! inserted)
        (publish-writes! writes)
        inserted))))

(mu/defn update-table-user-settings-rows! :- [:sequential [:map [:id pos-int?]]]
  "Apply each of `rows`, the id of a TableUserSettings and the columns to change, their two-column pairs completed from
  their Tables, write the columns the updated settings say a user set onto their Tables, and return the rows of the
  settings that exist: one read per kind and one statement per distinct set of changes."
  [rows :- [:sequential ::warehouse-schema.schema/table-user-settings.update-row]]
  (if (empty? rows)
    []
    (t2/with-transaction [_conn]
      (let [stored (u/index-by :id (warehouse-schema.db/table-user-settings-by-ids (mapv :id rows)))
            rows   (filterv #(contains? stored (:id %)) rows)
            tables (tables-for (map #(merge (dissoc % :table_id) (select-keys (stored (:id %)) [:table_id])) rows))
            writes (-> {}
                       (update-settings! (map (fn [row] [(stored (:id row)) (dissoc row :id)]) rows) tables)
                       (delete-empty! (map (comp :table_id stored :id) rows)))]
        (mirror-onto-tables! (map #(merge (stored (:id %)) %) rows))
        (publish-writes! writes)
        rows))))

(mu/defn upsert-table-user-settings!
  "Record the user-settable Table columns present in `settings` as the user values of `table`, in its settings and its
  row; a nil for a column without a set flag unsets it."
  [{:keys [id]} :- ::warehouse-schema.schema/table
   settings     :- ::warehouse-schema.schema/table.update]
  (let [settings (u/select-keys-when settings :present user-settings/user-settable-table-columns)]
    (when (seq settings)
      (t2/with-transaction [_conn]
        (let [stored-table (when (pair-columns-written? settings) (warehouse-schema.db/table id))
              existing     (volatile! nil)
              written      (volatile! nil)
              pk           (warehouse-schema.db/update-or-insert-table-user-settings!
                            id (fn [stored]
                                 (vreset! existing stored)
                                 (vreset! written
                                          (let [row (cond-> settings stored (with-set-flags settings settings))]
                                            (if stored
                                              (merge row (completed-changes (changed-columns row stored) stored-table))
                                              (completed-changes row stored-table))))))
              writes       (-> (if-let [stored @existing]
                                 (with-updated {} [stored] (constantly @written))
                                 (with-created {} (warehouse-schema.db/table-user-settings-by-ids [pk])))
                               (delete-empty! [id]))]
          (u/prog1 (table/update-table! id settings)
            (publish-writes! writes)))))))

(mu/defn upsert-table-user-settings-for-tables!
  "[[upsert-table-user-settings!]] for every Table in `table-ids`, with one statement per kind for the settings and one for
  the rows."
  [table-ids :- [:set ::lib.schema.id/table]
   settings  :- ::warehouse-schema.schema/table.update]
  (let [settings (u/select-keys-when settings :present user-settings/user-settable-table-columns)]
    (when (and (seq settings) (seq table-ids))
      (t2/with-transaction [_conn]
        (let [tables   (if (pair-columns-written? settings)
                         (u/index-by :id (warehouse-schema.db/tables table-ids))
                         {})
              existing (u/index-by :table_id (warehouse-schema.db/table-user-settings-for-tables table-ids))
              writes   (if-let [missing (not-empty (remove existing table-ids))]
                         (with-created {} (warehouse-schema.db/insert-table-user-settings-returning-instances!
                                           (mapv #(completed-changes (assoc settings :table_id %) (tables %)) missing)))
                         {})
              writes   (-> writes
                           (update-settings! (for [table-id table-ids
                                                   :let [stored (existing table-id)]
                                                   :when stored]
                                               [stored (with-set-flags settings settings settings)])
                                             tables)
                           (delete-empty! table-ids))]
          (u/prog1 (table/update-tables-with-changes! table-ids settings)
            (publish-writes! writes)))))))

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
    (table/update-field-positions! (warehouse-schema.db/table (u/the-id table)))))

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
        (publish-writes! (-> {}
                             (update-settings! [[stored row]] (tables-for [(assoc row :table_id id)]))
                             (delete-empty! [id])))))))

(mu/defn delete-table-user-settings!
  "Delete the settings of the Tables with `table-ids`, leaving their rows as they are for sync to take over."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (when (seq table-ids)
    (t2/with-transaction [_conn]
      (publish-writes!
       (reduce (fn [writes batch]
                 (delete-read! writes
                               (warehouse-schema.db/table-user-settings-for-tables (set batch))
                               #(warehouse-schema.db/delete-table-user-settings! batch)))
               {}
               (partition-all 1000 table-ids))))))

(defn- delete-table-user-settings-rows!
  "Delete the TableUserSettings with `ids`, as remote sync deletes them."
  [ids]
  (when (seq ids)
    (t2/with-transaction [_conn]
      (publish-writes! (delete-read! {}
                                     (warehouse-schema.db/table-user-settings-by-ids (vec ids))
                                     #(warehouse-schema.db/delete-table-user-settings-by-ids! (vec ids)))))))

(defn- load-legacy-fields!
  "Loads the FieldUserSettings that the settings `items` of an older export carry under `:fields`, deleting the other
  FieldUserSettings of their Tables."
  [items]
  (doseq [{{:keys [table_id]} :instance {:keys [fields]} :entity} (filter #(contains? (:entity %) :fields) items)]
    (let [kept (into #{} (map :field_id)
                     (serialization/load :model/FieldUserSettings (mapv serialization/restore-identity fields)))]
      (field-user-settings/delete-field-user-settings!
       (vec (remove kept (warehouse-schema.db/field-ids-with-user-settings-for-table table_id)))))))

(defn- after-load
  "Loads the FieldUserSettings that the loaded TableUserSettings `items` of an older export carry, then sets the
  positions of the Fields of the Tables whose field order they load."
  [items]
  (load-legacy-fields! items)
  (doseq [{{:keys [table_id field_order]} :instance} items
          :when field_order]
    (table/update-field-positions! (warehouse-schema.db/table table_id))))

(defmethod collection/archive-in-collections! :model/TableUserSettings
  [_model collection-ids]
  (when-let [ids (not-empty (warehouse-schema.db/table-user-settings-ids-of-published-tables-in-collections (vec collection-ids)))]
    (update-table-user-settings-rows! (mapv (fn [id] {:id id :collection_id nil :is_published false}) ids))))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/TableUserSettings [_model]
  {:skip? false})

(defmethod serialization/spec :model/TableUserSettings [_]
  {:schema              ::warehouse-schema.schema/external-table-user-settings
   :identity            [:table_id]
   :copy                [:display_name :description :entity_type :visibility_type :field_order :caveats
                         :points_of_interest :show_in_getting_started :data_authority :data_source :data_layer
                         :owner_email :is_published :description_set :visibility_type_set :data_layer_set
                         :data_source_set]
   :skip                [:caveats_set :points_of_interest_set]
   :defaults            {:description_set     false
                         :visibility_type_set false
                         :data_layer_set      false
                         :data_source_set     false}
   :transform           {:collection_id (serialization/fk-transform :model/Collection)
                         :owner_user_id serialization/user-transform
                         :table_id      serialization/table-transform}
   :storage-paths       warehouse-schema.serialization/table-user-settings-storage-paths
   :import-dependencies warehouse-schema.serialization/table-user-settings-import-dependencies
   :insert!             create-table-user-settings!
   :update!             update-table-user-settings-rows!
   :delete!             delete-table-user-settings-rows!
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
