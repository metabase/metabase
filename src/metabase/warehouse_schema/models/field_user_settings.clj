(ns metabase.warehouse-schema.models.field-user-settings
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.change-log.core :as change-log]
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
   [metabase.warehouse-schema.dependencies :as warehouse-schema.dependencies]
   [metabase.warehouse-schema.models.dimension :as dimension]
   [metabase.warehouse-schema.models.field :as field]
   [metabase.warehouse-schema.schema :as warehouse-schema.schema]
   [metabase.warehouse-schema.serialization :as warehouse-schema.serialization]
   [metabase.warehouse-schema.user-settings :as user-settings]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.tools.before-update :as t2.before-update]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/FieldUserSettings [_model] :metabase_field_user_settings)

(t2/deftransforms :model/FieldUserSettings
  {:effective_type    field/transform-field-effective-type
   :coercion_strategy field/transform-field-coercion-strategy
   :semantic_type     field/transform-field-semantic-type
   :visibility_type   mi/transform-keyword
   :has_field_values  mi/transform-keyword
   :data_sensitivity  mi/transform-keyword
   :settings          mi/transform-json})

(doto :model/FieldUserSettings
  (derive :metabase/model)
  (derive :hook/timestamped?))

(defn- with-set-flags
  "Set the `_set` flag of every flagged column `effective` writes, unless `effective` sets the flag itself."
  [settings effective]
  (reduce-kv (fn [m column flag]
               (cond-> m
                 (and (contains? effective column) (not (contains? effective flag)))
                 (assoc flag true)))
             settings
             user-settings/field-set-flags))

(t2/define-before-insert :model/FieldUserSettings
  [settings]
  (with-set-flags settings settings))

(t2/define-before-update :model/FieldUserSettings
  [settings]
  (with-set-flags settings (t2/changes settings)))

;;; ----------------------------------------------------- Writes -----------------------------------------------------

(defn- updated-settings
  "The settings `previous`, an instance, as an update of `changes` leaves them, with the flags their before-update sets
  and the `:updated_at` they had."
  [previous changes]
  (-> (t2.before-update/before-update :model/FieldUserSettings (merge previous changes))
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
    [[:event/field-user-settings-create
      (into [] (keep (fn [{:keys [before after]}] (when (and (nil? before) (not= ::deleted after)) {:object after}))) writes)]
     [:event/field-user-settings-update
      (into [] (keep (fn [{:keys [before after]}]
                       (when (and before (not= ::deleted after))
                         (let [change {:previous-object before :object after}]
                           (when (seq (u.events/changed-keys change)) change)))))
            writes)]
     [:event/field-user-settings-delete
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
    (let [changes (events/delete-changes :model/FieldUserSettings (vec rows))]
      (delete!)
      (with-deleted writes rows changes))))

(defn- delete-empty!
  "Delete the settings, among those of the Fields with `field-ids`, that hold no user value and no true flag,
  returning `writes` with their deletes."
  [writes field-ids]
  (if (empty? field-ids)
    writes
    (let [field-ids (into [] (distinct) field-ids)]
      (delete-read! writes
                    (warehouse-schema.db/empty-field-user-settings field-ids)
                    #(warehouse-schema.db/delete-empty-field-user-settings! field-ids)))))

(defn- publish-writes!
  "Publish the events of `writes`."
  [writes]
  (events/publish-lifecycle! (written-events writes)))

(defn- fk-semantic-type?
  "Whether `semantic-type` marks a foreign key."
  [semantic-type]
  (isa? (some-> semantic-type keyword) :type/FK))

(defn- internal-remapping-allowed?
  "Whether a Field of `base-type` and `semantic-type` can hold an internal remapping."
  [base-type semantic-type]
  (let [semantic-type (some-> semantic-type keyword)]
    (and (isa? (keyword base-type) :type/Integer)
         (or (nil? semantic-type)
             (isa? semantic-type :type/Category)
             (isa? semantic-type :type/Enum)))))

(def ^:private fk-target-unset
  "The changes that unset the user-set FK target of a Field in its settings."
  {:fk_target_field_id nil, :fk_target_field_id_set false})

(defn- remove-remappings-ended-by!
  "Removes what the user's new semantic type in `settings` ends for `field`: its foreign key target and external
  remapping when it stops being a foreign key, and its internal remapping when it can no longer hold one, returning
  `writes` with the writes of the settings."
  [writes {:keys [id base_type semantic_type]} settings]
  (if-not (contains? settings :semantic_type)
    writes
    (let [writes (if (and (fk-semantic-type? semantic_type)
                          (not (fk-semantic-type? (:semantic_type settings))))
                   (let [stored (filterv #(some? (:fk_target_field_id %))
                                         (keep identity [(warehouse-schema.db/field-user-settings id)]))
                         writes (if (seq stored)
                                  (do (warehouse-schema.db/unset-user-settings-fk-target! id)
                                      (with-updated writes stored (constantly fk-target-unset)))
                                  writes)]
                     (dimension/delete-dimensions-of-type-for-field! id :external)
                     (delete-empty! writes [id]))
                   writes)]
      (when-not (internal-remapping-allowed? base_type (:semantic_type settings))
        (dimension/delete-dimensions-of-type-for-field! id :internal))
      writes)))

(defn- mirror-onto-fields!
  "Write the columns each of the settings `rows` says a user set onto its Field."
  [rows]
  (field/update-fields! (into []
                              (keep (fn [{:keys [field_id] :as settings}]
                                      (when-let [changes (not-empty
                                                          (select-keys settings (user-settings/user-set-field-columns settings)))]
                                        (assoc changes :id field_id))))
                              rows)))

(mu/defn create-field-user-settings! :- [:sequential ::warehouse-schema.schema/field-user-settings]
  "Insert the FieldUserSettings `rows`, write the columns they say a user set onto their Fields, and return the
  inserted instances; a row that holds no user value is deleted again."
  [rows :- [:sequential ::warehouse-schema.schema/field-user-settings.update]]
  (if (empty? rows)
    []
    (t2/with-transaction [_conn]
      (let [inserted (vec (warehouse-schema.db/insert-field-user-settings-returning-instances! rows))
            writes   (delete-empty! (with-created {} inserted) (map :field_id inserted))]
        (mirror-onto-fields! inserted)
        (publish-writes! writes)
        inserted))))

(mu/defn update-field-user-settings-rows! :- [:sequential [:map [:id pos-int?]]]
  "Apply each of `rows`, the id of a FieldUserSettings and the columns to change, write the columns the updated
  settings say a user set onto their Fields, and return the rows of the settings that exist: one read and one
  statement per distinct set of changes."
  [rows :- [:sequential ::warehouse-schema.schema/field-user-settings.update-row]]
  (if (empty? rows)
    []
    (t2/with-transaction [_conn]
      (let [stored (u/index-by :id (warehouse-schema.db/field-user-settings-by-ids (mapv :id rows)))
            rows   (filterv #(contains? stored (:id %)) rows)
            by-id  (u/index-by :id rows)]
        (doseq [[changes rows] (group-by #(dissoc % :id) rows)
                :when (seq changes)]
          (warehouse-schema.db/update-field-user-settings-by-ids! (mapv :id rows) changes))
        (let [writes (-> {}
                         (with-updated (map (comp stored :id) rows) #(dissoc (by-id (:id %)) :id))
                         (delete-empty! (map (comp :field_id stored :id) rows)))]
          (mirror-onto-fields! (map #(merge (stored (:id %)) %) rows))
          (publish-writes! writes))
        rows))))

(mu/defn upsert-field-user-settings!
  "Record the user-settable Field columns present in `settings` as the user values of `field`, in its settings and its
  row; a nil for a column without a set flag unsets it."
  [{:keys [id] :as field} :- ::warehouse-schema.schema/field
   settings               :- ::warehouse-schema.schema/field.update]
  (let [settings (u/select-keys-when settings :present user-settings/user-settable-field-columns)]
    (when (seq settings)
      (t2/with-transaction [_conn]
        (let [writes   (remove-remappings-ended-by! {} field settings)
              existing (volatile! nil)
              pk       (warehouse-schema.db/update-or-insert-field-user-settings!
                        id (fn [stored]
                             (vreset! existing stored)
                             (cond->> settings stored (with-set-flags settings))))
              writes   (if-let [stored @existing]
                         (with-updated writes [stored] (constantly (with-set-flags settings settings)))
                         (with-created writes (warehouse-schema.db/field-user-settings-by-ids [pk])))
              writes   (delete-empty! writes [id])]
          (u/prog1 (field/update-field! id settings)
            (publish-writes! writes)))))))

(mu/defn set-custom-positions!
  "Record `field-id->position` as the Fields' user `custom_position`s, in their settings and their rows."
  [field-id->position :- [:map-of ::lib.schema.id/field :int]]
  (t2/with-transaction [_conn]
    (let [existing (warehouse-schema.db/field-user-settings-for-fields (vec (keys field-id->position)))
          missing  (remove (into #{} (map :field_id) existing) (keys field-id->position))
          writes   (cond-> {}
                     (seq missing)
                     (with-created (warehouse-schema.db/insert-field-user-settings-returning-instances!
                                    (mapv (fn [id] {:field_id id :custom_position (field-id->position id)}) missing))))]
      (when (seq existing)
        (warehouse-schema.db/update-field-user-settings-custom-positions!
         (select-keys field-id->position (map :field_id existing))))
      (u/prog1 (field/set-custom-positions! field-id->position)
        (publish-writes! (with-updated writes existing #(hash-map :custom_position (field-id->position (:field_id %)))))))))

(mu/defn unset-field-user-settings!
  "Drop the user values of the Field columns `ks` for `field` from its settings, leaving its row as it is for sync to
  take over."
  [{:keys [id]} :- ::warehouse-schema.schema/field
   ks           :- [:sequential (into [:enum] user-settings/user-settable-field-columns)]]
  (when-let [stored (warehouse-schema.db/field-user-settings id)]
    (t2/with-transaction [_conn]
      (let [changes (into {} (mapcat (fn [k]
                                       (cond-> [[k nil]]
                                         (user-settings/field-set-flags k) (conj [(user-settings/field-set-flags k) false]))))
                          ks)]
        (warehouse-schema.db/update-field-user-settings! id changes)
        (publish-writes! (-> {}
                             (with-updated [stored] (constantly changes))
                             (delete-empty! [id])))))))

(def ^:private fk-targets-cleared
  "The changes that unset the user-set FK semantic type and target of a Field in its settings."
  {:semantic_type nil, :semantic_type_set false, :fk_target_field_id nil, :fk_target_field_id_set false})

(mu/defn clear-fk-targets-to-fields!
  "Unset the user-set foreign keys to the Fields with `field-ids` in the settings of the Fields that target them,
  deleting the settings left without a user value."
  [field-ids :- [:sequential ::lib.schema.id/field]]
  (when (seq field-ids)
    (t2/with-transaction [_conn]
      (let [targeting (warehouse-schema.db/field-user-settings-targeting field-ids)]
        (when (seq targeting)
          (warehouse-schema.db/clear-user-settings-fk-targets-to-fields! field-ids)
          (publish-writes! (-> {}
                               (with-updated targeting (constantly fk-targets-cleared))
                               (delete-empty! (map :field_id targeting)))))))))

(defmethod field/clear-for-deactivated-fields! :model/FieldUserSettings
  [_model field-ids]
  (clear-fk-targets-to-fields! field-ids))

(mu/defn delete-field-user-settings!
  "Delete the settings of the Fields with `field-ids`, leaving their rows as they are for sync to take over."
  [field-ids :- [:sequential ::lib.schema.id/field]]
  (when (seq field-ids)
    (t2/with-transaction [_conn]
      (publish-writes!
       (reduce (fn [writes batch]
                 (delete-read! writes
                               (warehouse-schema.db/field-user-settings-for-fields (vec batch))
                               #(warehouse-schema.db/delete-field-user-settings! batch)))
               {}
               (partition-all 1000 field-ids))))))

(defn- delete-field-user-settings-rows!
  "Delete the FieldUserSettings with `ids`, as remote sync and an import delete them."
  [ids]
  (when (seq ids)
    (t2/with-transaction [_conn]
      (publish-writes! (delete-read! {}
                                     (warehouse-schema.db/field-user-settings-by-ids (vec ids))
                                     #(warehouse-schema.db/delete-field-user-settings-by-ids! (vec ids)))))))

(mu/defn delete-field-user-settings-for-table!
  "[[delete-field-user-settings!]] for every Field of the Table with `table-id`."
  [table-id :- ::lib.schema.id/table]
  (delete-field-user-settings! (vec (warehouse-schema.db/field-ids-with-user-settings-for-table table-id))))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/FieldUserSettings [_model]
  {:skip? false})

(defmethod change-log/spec :model/FieldUserSettings [_model]
  {:track [:field_id :semantic_type :description :display_name :visibility_type :fk_target_field_id :has_field_values
           :effective_type :coercion_strategy :caveats :points_of_interest :nfc_path :json_unfolding :settings
           :data_sensitivity :description_set :semantic_type_set :fk_target_field_id_set :custom_position]
   :skip  []})

(defmethod serialization/spec :model/FieldUserSettings [_]
  {:schema        ::warehouse-schema.schema/external-field-user-settings
   :identity      [:field_id]
   :copy          [:semantic_type :description :display_name :visibility_type
                   :has_field_values :effective_type :coercion_strategy :caveats
                   :points_of_interest :json_unfolding :settings :data_sensitivity :custom_position
                   :description_set :semantic_type_set :fk_target_field_id_set]
   :skip          [:nfc_path]
   :defaults      {:description_set        false
                   :semantic_type_set      false
                   :fk_target_field_id_set false}
   :transform     {:fk_target_field_id serialization/field-transform
                   :field_id           serialization/field-transform}
   :storage-paths warehouse-schema.serialization/field-user-settings-storage-paths
   :insert!       create-field-user-settings!
   :update!       update-field-user-settings-rows!
   :delete!       delete-field-user-settings-rows!
   :rows-by-refs  serialization/field-user-settings-rows-by-refs})

(defmethod remote-sync/spec :model/FieldUserSettings
  [_model]
  {:synced-items         warehouse-schema.db/synced-field-user-settings-items
   :synced-filter-clause warehouse-schema.db/synced-field-clause})

(defmethod dependencies/spec :model/FieldUserSettings [_model]
  {:part-of      {:type :table :key :field_id :via [:model/Field :table_id]}
   :part-columns (conj warehouse-schema.dependencies/field-columns :custom_position :json_unfolding)})
