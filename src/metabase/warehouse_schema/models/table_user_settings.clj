(ns metabase.warehouse-schema.models.table-user-settings
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [metabase.warehouse-schema.db :as warehouse-schema.db]
   [metabase.warehouse-schema.models.table :as table]
   [metabase.warehouse-schema.schema :as warehouse-schema.schema]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/TableUserSettings [_model] :metabase_table_user_settings)

(t2/deftransforms :model/TableUserSettings
  {:entity_type     mi/transform-keyword
   :visibility_type mi/transform-keyword
   :field_order     mi/transform-keyword
   :data_layer      mi/transform-keyword
   :data_source     mi/transform-keyword
   :data_authority  mi/transform-keyword})

(doto :model/TableUserSettings
  (derive :metabase/model)
  (derive :hook/timestamped?))

(methodical/defmethod t2/primary-keys :model/TableUserSettings [_model] [:table_id])

(defn- complete-pairs
  "Fill in the other half of a Table setting that is really one choice over two columns, so the user's intent is
  recorded whole: `visibility_type`/`data_layer` are the same decision spelled two ways (the Table model keeps them in
  step through its own update path, which user values no longer take), and publishing means `is_published` and
  `collection_id` together."
  [settings table-id]
  (cond-> settings
    (and (contains? settings :visibility_type) (not (contains? settings :data_layer)))
    (assoc :data_layer (table/visibility-type->data-layer (some-> (:visibility_type settings) keyword)))

    (and (contains? settings :data_layer) (not (contains? settings :visibility_type)))
    (assoc :visibility_type (table/data-layer->visibility-type (some-> (:data_layer settings) keyword)))

    (and (contains? settings :collection_id) (not (contains? settings :is_published)))
    (assoc :is_published (boolean (:is_published (warehouse-schema.db/table table-id))))))

(mu/defn upsert-user-settings
  "Record the user-settable Table columns present in `settings` as the user values of `table`, flagging the
  [[warehouse-schema-overlay/table-user-settings-flags]] among them as set.

  Publishing is one choice over `is_published` and `collection_id`, so recording either records the pair: a Table
  published into the root collection has a NULL `collection_id` that must still beat the sync value."
  [{:keys [id]} :- [:map [:id ::lib.schema.id/table]]
   settings     :- ::warehouse-schema.schema/table.update]
  (let [settings (u/select-keys-when settings :present warehouse-schema-overlay/user-settable-table-columns)
        _        (table/validate-user-changes! settings (warehouse-schema.db/table id))
        settings (complete-pairs settings id)
        flags    (into {} (keep (fn [[k flag]] (when (contains? settings k) [flag true])))
                       warehouse-schema-overlay/table-user-settings-flags)]
    (when (seq settings)
      (when-not (warehouse-schema.db/table-user-settings-exist? id)
        (warehouse-schema.db/insert-table-user-settings! {:table_id id}))
      (warehouse-schema.db/update-table-user-settings! id (merge settings flags)))))

(mu/defn upsert-user-settings-for-tables!
  "Record `settings` as the user values of every Table in `table-ids`, in one statement rather than per Table.
  Bulk edits in Data Studio and publishing go through here; see [[upsert-user-settings]] for the semantics."
  [table-ids :- [:set ::lib.schema.id/table]
   settings  :- ::warehouse-schema.schema/table.update]
  (let [settings (u/select-keys-when settings :present warehouse-schema-overlay/user-settable-table-columns)]
    (when (and (seq settings) (seq table-ids))
      ;; each Table is validated against its own current values, the way a single update is
      (doseq [table (warehouse-schema.db/tables table-ids)]
        (table/validate-user-changes! settings table))
      (let [settings (complete-pairs settings (first table-ids))
            flags    (into {} (keep (fn [[k flag]] (when (contains? settings k) [flag true])))
                           warehouse-schema-overlay/table-user-settings-flags)
            existing (warehouse-schema.db/table-ids-with-user-settings table-ids)]
        (when-let [missing (not-empty (remove existing table-ids))]
          (warehouse-schema.db/insert-table-user-settings! (mapv (fn [id] {:table_id id}) missing)))
        (warehouse-schema.db/update-table-user-settings-for-tables! table-ids (merge settings flags))))))

(mu/defn unset-user-settings!
  "Drop the user values of the Table columns `ks` for `table`, so its sync values show again."
  [{:keys [id]} :- [:map [:id ::lib.schema.id/table]]
   ks           :- [:sequential (into [:enum] warehouse-schema-overlay/user-settable-table-columns)]]
  (when (warehouse-schema.db/table-user-settings-exist? id)
    (warehouse-schema.db/update-table-user-settings!
     id
     (into {} (mapcat (fn [k]
                        (cond-> [[k nil]]
                          (warehouse-schema-overlay/table-user-settings-flags k)
                          (conj [(warehouse-schema-overlay/table-user-settings-flags k) false]))))
           ks))))

(def ^:private inline-field-setting-keys
  "The FieldUserSettings columns written inline under a Table's `:fields`. `:name` identifies the Field within the
  Table, which travels between instances where an id does not."
  [:name :display_name :description :semantic_type :visibility_type :has_field_values :effective_type
   :coercion_strategy :caveats :points_of_interest :json_unfolding :data_sensitivity
   :description_set :semantic_type_set :fk_target_field_id_set])

(defn- export-field-settings
  "The user settings of a Table's Fields, inline and keyed by Field name."
  [table-id]
  (->> (warehouse-schema.db/field-user-settings-with-names-for-table table-id)
       (mapv (fn [fus] (into {} (keep (fn [k] (when (contains? fus k) [k (get fus k)])))
                             inline-field-setting-keys)))
       not-empty
       vec))

(defn- import-field-settings!
  "Write inline `:fields` settings back, matching each entry to a Field of the Table by name. A name with no Field is
  skipped: the Table may have been synced from a warehouse that no longer has that column."
  [table-id fields]
  (when (seq fields)
    (let [name->id (warehouse-schema.db/field-ids-by-name-for-table table-id)]
      (doseq [{field-name :name :as settings} fields
              :let [field-id (get name->id field-name)]
              :when field-id]
        (when-not (warehouse-schema.db/field-user-settings-exist? field-id)
          (warehouse-schema.db/insert-field-user-settings! {:field_id field-id}))
        (warehouse-schema.db/update-field-user-settings! field-id (dissoc settings :name))))))

;;; ------------------------------------------------- Serialization -------------------------------------------------

(defmethod serdes/entity-id "TableUserSettings" [_ _] nil)

(defmethod serdes/generate-path "TableUserSettings" [_ {:keys [table_id]}]
  (conj (serdes/table->path (serdes/*export-table-fk* table_id))
        {:model "TableUserSettings" :id "1"}))

(defmethod serdes/deserialization-dependencies "TableUserSettings" [tus]
  ;; The parent Table is synthesized on import if missing, so only the Database -- and the target Collection, when one
  ;; is recorded -- has to exist first.
  (let [db-path (first (serdes/path tus))]
    (cond-> [[db-path]]
      (:collection_id tus) (conj [{:model "Collection" :id (:collection_id tus)}]))))

(defmethod serdes/load-find-local "TableUserSettings" [path]
  ;; Delegate to finding the parent Table, then look up its corresponding TableUserSettings.
  (let [found-table (serdes/load-find-local (pop path))]
    (warehouse-schema.db/table-user-settings (:id found-table))))

(defn- table-path->table-ref [tus-path]
  (let [[db schema table-name :as table-ref] (mapv :id (pop tus-path))]
    (if table-name
      table-ref
      ;; It's too short, so no schema. Shift them over and add a nil schema.
      [db nil schema])))

(defmethod serdes/make-spec "TableUserSettings" [_model-name _opts]
  {:copy      [:display_name :description :entity_type :visibility_type :field_order :caveats :points_of_interest
               :show_in_getting_started :data_authority :data_source :owner_email :is_published
               :display_name_set :description_set :entity_type_set :visibility_type_set :caveats_set
               :points_of_interest_set :data_layer_set :data_source_set :owner_email_set :owner_user_id_set]
   :defaults  {:display_name_set       false
               :description_set        false
               :entity_type_set        false
               :visibility_type_set    false
               :caveats_set            false
               :points_of_interest_set false
               :data_layer_set         false
               :data_source_set        false
               :owner_email_set        false
               :owner_user_id_set      false}
   :transform {;; remote sync asks for user edits only, and a Table's Fields' settings ride inline here rather than
               ;; as a file each: one file per Table is what a git-synced instance wants to review
               :fields        {:export-with-context (fn [current _ _] (export-field-settings (:table_id current)))
                               :import-with-context (fn [current _ fields]
                                                      (import-field-settings! (:table_id current) fields)
                                                      ::serdes/skip)}
               :created_at    (serdes/date)
               :collection_id (serdes/fk :model/Collection)
               :owner_user_id (serdes/fk :model/User)
               :data_layer    (serdes/optional-kw)
               :table_id      {::serdes/fk true
                               :export     (constantly ::serdes/skip)
                               :import-with-context (fn [current _ _]
                                                      (serdes/*import-table-fk* (table-path->table-ref (serdes/path current))))}}})

(def ^:private table-user-settings-slug "___tableusersettings")

(defmethod serdes/storage-path "TableUserSettings" [tus _]
  ;; [path to table dir "table-name___tableusersettings"] next to the Table's own YAML, since there is zero or one
  ;; TableUserSettings per Table.
  (let [table-path (pop (serdes/path tus))]
    (conj (serdes/storage-path-prefixes table-path)
          {:label (str (:id (peek table-path)) table-user-settings-slug)})))
