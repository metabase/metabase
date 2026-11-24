(ns metabase.warehouse-schema.models.field-user-settings
  (:require
   [malli.util :as mut]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.sql-errors :as sql-errors]
   [metabase.change-log.core :as change-log]
   [metabase.dependencies.core :as dependencies]
   [metabase.events.core :as events]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.serialization.core :as serialization]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.db :as warehouse-schema.db]
   [metabase.warehouse-schema.dependencies :as warehouse-schema.dependencies]
   [metabase.warehouse-schema.models.dimension :as dimension]
   [metabase.warehouse-schema.models.field :as field]
   [metabase.warehouse-schema.schema :as warehouse-schema.schema]
   [metabase.warehouse-schema.serialization :as warehouse-schema.serialization]
   [metabase.warehouse-schema.user-settings :as user-settings]
   [metabase.warehouse-schema.user-settings-writes :as user-settings-writes]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

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

(def ^:private writes-spec
  "The spec of FieldUserSettings for [[metabase.warehouse-schema.user-settings-writes]]."
  {:model                  :model/FieldUserSettings
   :topics                 {:create :event/field-user-settings-create
                            :update :event/field-user-settings-update
                            :delete :event/field-user-settings-delete}
   :settings-by-ids        warehouse-schema.db/field-user-settings-by-ids
   :empty-settings         warehouse-schema.db/empty-field-user-settings
   :delete-empty-settings! warehouse-schema.db/delete-empty-field-user-settings!})

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
                                      (user-settings-writes/add-updated writes writes-spec stored (constantly fk-target-unset)))
                                  writes)]
                     (dimension/delete-dimensions! (mapv :id (warehouse-schema.db/dimensions-of-field id :external)))
                     (user-settings-writes/delete-empty! writes writes-spec [id]))
                   writes)]
      (when-not (internal-remapping-allowed? base_type (:semantic_type settings))
        (dimension/delete-dimensions! (mapv :id (warehouse-schema.db/dimensions-of-field id :internal))))
      writes)))

(defn- mirror-onto-fields!
  "Write the columns each of the settings `rows` says a user set onto its Field, in one update."
  [rows]
  (when-let [field-rows (not-empty
                         (into []
                               (keep (fn [{:keys [field_id] :as settings}]
                                       (when-let [changes (not-empty
                                                           (select-keys settings (user-settings/user-set-field-columns settings)))]
                                         (assoc changes :id field_id))))
                               rows))]
    (field/update-fields! field-rows)))

(mu/defn create-field-user-settings! :- [:sequential ::warehouse-schema.schema/field-user-settings]
  "Insert the FieldUserSettings `rows`, write the columns they say a user set onto their Fields, and return the
  inserted instances, deleting again a row that holds no user value."
  [rows :- [:sequential ::warehouse-schema.schema/field-user-settings.create]]
  (mdb/create-batched! :model/FieldUserSettings rows
                       {:after-create (fn [inserted]
                                        (let [writes (-> (user-settings-writes/add-created {} inserted)
                                                         (user-settings-writes/delete-empty! writes-spec (map :field_id inserted)))]
                                          (mirror-onto-fields! inserted)
                                          (user-settings-writes/publish-writes! writes writes-spec)))}))

(defn- write-settings-updates!
  "Write each of `rows`, the id of one of the `stored` FieldUserSettings, `{id row}`, and the columns to change, one
  update per distinct change, and delete the settings it leaves without a user value, returning `writes` with these writes."
  [writes stored rows]
  (warehouse-schema.db/update-field-user-settings-rows! rows)
  (let [by-id (u/index-by :id rows)]
    (-> writes
        (user-settings-writes/add-updated writes-spec (map (comp stored :id) rows) #(dissoc (by-id (:id %)) :id))
        (user-settings-writes/delete-empty! writes-spec (map (comp :field_id stored :id) rows)))))

(mu/defn update-field-user-settings! :- [:sequential ::warehouse-schema.schema/field-user-settings.update]
  "Apply each of `rows`, the id of a FieldUserSettings and the columns to change, in one transaction and batches of
  [[mdb/update-partition-size]], write the columns the updated settings say a user set onto their Fields, publish one
  event of each kind for the creates, updates and deletes, and return them."
  [rows :- [:sequential ::warehouse-schema.schema/field-user-settings.update]]
  (when (seq rows)
    (t2/with-transaction [_conn]
      (let [stored  (user-settings-writes/settings-by-id writes-spec (map :id rows))
            written (filterv #(contains? stored (:id %)) rows)
            writes  (reduce #(write-settings-updates! %1 stored (vec %2)) {} (partition-all mdb/update-partition-size written))]
        (mirror-onto-fields! (map #(merge (stored (:id %)) %) written))
        (user-settings-writes/publish-writes! writes writes-spec))))
  (vec rows))

(defn- update-or-insert-settings!
  "Apply `changes` to the `stored` settings of the Field with `field-id`, or insert `row` when there are none and apply
  `changes` to the settings a concurrent insert stored first, returning `{:stored s}` or `{:inserted s}`."
  [field-id stored row changes]
  (if stored
    (do (warehouse-schema.db/update-field-user-settings! field-id changes)
        {:stored stored})
    (try
      {:inserted (warehouse-schema.db/insert-field-user-settings-row! row)}
      (catch Exception e
        (if-let [stored (when (sql-errors/duplicate-key? e) (warehouse-schema.db/field-user-settings field-id))]
          (update-or-insert-settings! field-id stored row changes)
          (throw e))))))

(mu/defn upsert-field-user-settings!
  "Record the user-settable Field columns present in `settings` as the user values of `field`, in its settings and its
  row; a nil for a column without a set flag unsets it."
  [{:keys [id] :as field} :- ::warehouse-schema.schema/field
   settings               :- (mut/dissoc ::warehouse-schema.schema/field.update :id)]
  (let [settings (u/select-keys-when settings :present user-settings/user-settable-field-columns)]
    (when (seq settings)
      (t2/with-transaction [_conn]
        (let [writes  (remove-remappings-ended-by! {} field settings)
              changes (with-set-flags settings settings)
              {:keys [stored inserted]} (update-or-insert-settings!
                                         id (warehouse-schema.db/field-user-settings id) (assoc settings :field_id id) changes)
              writes  (if stored
                        (user-settings-writes/add-updated writes writes-spec [stored] (constantly changes))
                        (user-settings-writes/add-created writes [inserted]))
              writes  (user-settings-writes/delete-empty! writes writes-spec [id])]
          (field/update-fields! [(assoc settings :id id)])
          (user-settings-writes/publish-writes! writes writes-spec)
          1)))))

(defn- remove-remappings-ended-by-all!
  "[[remove-remappings-ended-by!]] for each `[field settings]` of `field+settings`, with the settings read together
  and one write call per kind for all of them, returning `writes` with the writes of the settings."
  [writes field+settings]
  (let [semantic       (filterv (fn [[_field settings]] (contains? settings :semantic_type)) field+settings)
        fk-ended       (into [] (keep (fn [[{:keys [id semantic_type]} settings]]
                                        (when (and (fk-semantic-type? semantic_type)
                                                   (not (fk-semantic-type? (:semantic_type settings))))
                                          id)))
                             semantic)
        internal-ended (into #{} (keep (fn [[{:keys [id base_type]} settings]]
                                         (when-not (internal-remapping-allowed? base_type (:semantic_type settings))
                                           id)))
                             semantic)
        stored         (when (seq fk-ended)
                         (filterv #(some? (:fk_target_field_id %))
                                  (warehouse-schema.db/field-user-settings-for-fields fk-ended)))
        dimension-ids  (when-let [field-ids (not-empty (into internal-ended fk-ended))]
                         (into []
                               (comp (filter (fn [{:keys [field_id type]}]
                                               (case (keyword type)
                                                 :external (contains? (set fk-ended) field_id)
                                                 :internal (contains? internal-ended field_id)
                                                 false)))
                                     (map :id))
                               (warehouse-schema.db/dimensions-for-fields field-ids)))]
    (when (seq stored)
      (warehouse-schema.db/update-field-user-settings-by-ids! (mapv :id stored) fk-target-unset))
    (when (seq dimension-ids)
      (dimension/delete-dimensions! dimension-ids))
    (cond-> writes
      (seq stored)   (user-settings-writes/add-updated writes-spec stored (constantly fk-target-unset))
      (seq fk-ended) (user-settings-writes/delete-empty! writes-spec fk-ended))))

(mu/defn upsert-field-user-settings-for-fields! :- [:maybe :int]
  "[[upsert-field-user-settings!]] for each `[field settings]` of `field+settings`, whose Fields are distinct, with
  the settings read together and one write call per kind, one update of the Fields per distinct change, and one event
  of each kind, returning the number of Fields written."
  [field+settings :- [:sequential [:tuple
                                   ::warehouse-schema.schema/field
                                   (mut/dissoc ::warehouse-schema.schema/field.update :id)]]]
  (let [field+settings (into []
                             (keep (fn [[field settings]]
                                     (when-let [settings (not-empty (u/select-keys-when
                                                                     settings :present user-settings/user-settable-field-columns))]
                                       [field settings])))
                             field+settings)]
    (when (seq field+settings)
      (t2/with-transaction [_conn]
        (let [ids          (mapv (comp :id first) field+settings)
              id->settings (into {} (map (fn [[field settings]] [(:id field) settings])) field+settings)
              changes-of   (fn [field-id] (let [settings (id->settings field-id)] (with-set-flags settings settings)))
              writes       (remove-remappings-ended-by-all! {} field+settings)
              existing     (u/index-by :field_id (warehouse-schema.db/field-user-settings-for-fields ids))
              stored       (into [] (keep existing) ids)
              missing      (into [] (remove existing) ids)
              writes       (cond-> writes
                             (seq missing)
                             (user-settings-writes/add-created
                              (warehouse-schema.db/insert-field-user-settings-returning-instances!
                               (mapv #(assoc (id->settings %) :field_id %) missing))))]
          (when (seq stored)
            (warehouse-schema.db/update-field-user-settings-rows!
             (mapv #(assoc (changes-of (:field_id %)) :id (:id %)) stored)))
          (let [writes (-> writes
                           (user-settings-writes/add-updated writes-spec stored (comp changes-of :field_id))
                           (user-settings-writes/delete-empty! writes-spec ids))]
            (field/update-fields! (mapv (fn [[field settings]] (assoc settings :id (:id field))) field+settings))
            (user-settings-writes/publish-writes! writes writes-spec)
            (count field+settings)))))))

(mu/defn set-custom-positions!
  "Record `field-id->position` as the Fields' user `custom_position`s, in their settings and their rows."
  [field-id->position :- [:map-of ::lib.schema.id/field :int]]
  (t2/with-transaction [_conn]
    (let [existing (warehouse-schema.db/field-user-settings-for-fields (vec (keys field-id->position)))
          missing  (remove (into #{} (map :field_id) existing) (keys field-id->position))
          writes   (cond-> {}
                     (seq missing)
                     (user-settings-writes/add-created
                      (warehouse-schema.db/insert-field-user-settings-returning-instances!
                       (mapv (fn [id] {:field_id id :custom_position (field-id->position id)}) missing))))]
      (when (seq existing)
        (warehouse-schema.db/update-field-user-settings-custom-positions!
         (select-keys field-id->position (map :field_id existing))))
      (u/prog1 (field/set-custom-positions! field-id->position)
        (user-settings-writes/publish-writes!
         (user-settings-writes/add-updated writes writes-spec existing #(hash-map :custom_position (field-id->position (:field_id %))))
         writes-spec)))))

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
        (user-settings-writes/publish-writes! (-> {}
                                                  (user-settings-writes/add-updated writes-spec [stored] (constantly changes))
                                                  (user-settings-writes/delete-empty! writes-spec [id]))
                                              writes-spec)))))

(def ^:private fk-targets-cleared
  "The changes that unset the user-set FK semantic type and target of a Field in its settings."
  {:semantic_type nil, :semantic_type_set false, :fk_target_field_id nil, :fk_target_field_id_set false})

(mu/defn unset-field-user-settings-for-fields!
  "Drop the user values of the Field columns `ks` for each of the Fields with `field-ids` from their settings, leaving
  their rows as they are for sync to take over: one read and one statement for all of them, however many there are."
  [field-ids :- [:sequential ::lib.schema.id/field]
   ks        :- [:sequential (into [:enum] user-settings/user-settable-field-columns)]]
  (when-let [stored (when (seq field-ids)
                      (not-empty (warehouse-schema.db/field-user-settings-for-fields (vec field-ids))))]
    (t2/with-transaction [_conn]
      (let [changes (into {} (mapcat (fn [k]
                                       (cond-> [[k nil]]
                                         (user-settings/field-set-flags k) (conj [(user-settings/field-set-flags k) false]))))
                          ks)]
        (warehouse-schema.db/update-field-user-settings-by-ids! (mapv :id stored) changes)
        (user-settings-writes/publish-writes! (-> {}
                                                  (user-settings-writes/add-updated writes-spec stored (constantly changes))
                                                  (user-settings-writes/delete-empty! writes-spec (mapv :field_id stored)))
                                              writes-spec)))))

(defn- clear-fk-targets-to-fields!
  "Unset the user-set foreign keys to the Fields with `field-ids` in the settings of the Fields that target them,
  deleting the settings left without a user value."
  [field-ids]
  (when (seq field-ids)
    (t2/with-transaction [_conn]
      (let [targeting (warehouse-schema.db/field-user-settings-targeting field-ids)]
        (when (seq targeting)
          (warehouse-schema.db/clear-user-settings-fk-targets-to-fields! field-ids)
          (user-settings-writes/publish-writes! (-> {}
                                                    (user-settings-writes/add-updated writes-spec targeting (constantly fk-targets-cleared))
                                                    (user-settings-writes/delete-empty! writes-spec (map :field_id targeting)))
                                                writes-spec))))))

(defmethod field/clear-for-deactivated-fields! :model/FieldUserSettings
  [_model field-ids]
  (clear-fk-targets-to-fields! field-ids))

(mu/defn ids-of-fields :- [:sequential ms/PositiveInt]
  "The ids of the FieldUserSettings of the Fields with `field-ids`."
  [field-ids :- [:sequential ::lib.schema.id/field]]
  (mapv :id (warehouse-schema.db/field-user-settings-for-fields field-ids)))

(mu/defn delete-field-user-settings! :- :nil
  "Delete the FieldUserSettings with `ids` in one transaction, publishing their delete event, leaving their Fields as
  they are for sync to take over."
  [ids :- [:sequential ms/PositiveInt]]
  (mdb/delete-batched! :model/FieldUserSettings ids
                       {:before-delete #(events/publish-event! :event/field-user-settings-delete (events/delete-event %))}))

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
   :update!       #(do (update-field-user-settings! %) %)
   :delete!       delete-field-user-settings!
   :rows-by-refs  serialization/field-user-settings-rows-by-refs})

(defmethod remote-sync/spec :model/FieldUserSettings
  [_model]
  {:synced-items         warehouse-schema.db/synced-field-user-settings-items
   :synced-filter-clause warehouse-schema.db/synced-field-clause})

(defmethod dependencies/spec :model/FieldUserSettings [_model]
  {:part-of      {:type :table :key :field_id :via [:model/Field :table_id]}
   :part-columns (conj warehouse-schema.dependencies/field-columns :custom_position :json_unfolding)})
