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
  ;; the enum-validating transforms are the Table's own: a user value ends up on a Table when read, so a value the
  ;; Table would have rejected must be rejected here too -- stored, it would make every later read of that Table throw
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
  (derive :hook/timestamped?)
  ;; the Table search entry is built from the values users see, so it has to be rebuilt when those change
  (derive :hook/search-index))

(methodical/defmethod t2/primary-keys :model/TableUserSettings [_model] [:table_id])

(defn- complete-pairs
  "Fill in the other half of a Table setting that is really one choice over two columns, so the user's intent is
  recorded whole: `visibility_type`/`data_layer` are the same decision spelled two ways (the Table model keeps them in
  step through its own update path, which user values no longer take), and publishing means `is_published` and
  `collection_id` together."
  [settings table]
  (let [changing? (fn [k] (and (contains? settings k)
                               ;; only a real change derives the other half. A caller resending the value it already
                               ;; has must not silently rewrite its partner: `visibility_type` reads nil for several
                               ;; data layers, so echoing that nil back would demote the table to :internal.
                               (not= (some-> (get settings k) keyword)
                                     (some-> (get table k) keyword))))]
    (cond-> settings
      (and (changing? :visibility_type) (not (contains? settings :data_layer)))
      (assoc :data_layer (table/visibility-type->data-layer (some-> (:visibility_type settings) keyword)))

      (and (changing? :data_layer) (not (contains? settings :visibility_type)))
      (assoc :visibility_type (table/data-layer->visibility-type (some-> (:data_layer settings) keyword)))

      (and (contains? settings :collection_id) (not (contains? settings :is_published)))
      (assoc :is_published (boolean (:is_published table))))))

(defn- with-set-flags
  "Record a `_set` flag for every user-settable column in `effective`, unless the writer set that flag itself in
  `explicit` -- which is how [[unset-user-settings!]] takes a value back. The flag is what makes a user's NULL beat
  the synced value."
  [settings effective explicit]
  (reduce-kv (fn [m column flag]
               (cond-> m
                 (and (contains? effective column) (not (contains? explicit flag)))
                 (assoc flag true)))
             settings
             warehouse-schema-overlay/table-user-settings-flags))

(defn- enforce-invariants
  "Apply to `settings` what has to hold of a TableUserSettings row however it was written -- the API, a bulk edit, or
  a serdes import: the change is one a user is allowed to make, both halves of a two-column choice move together, and
  a written column carries its `_set` flag."
  [settings explicit]
  (let [table     (warehouse-schema.db/table (:table_id settings))
        completed (complete-pairs explicit table)]
    (table/validate-user-changes! explicit table)
    (-> (merge settings completed)
        (with-set-flags completed explicit))))

(t2/define-before-insert :model/TableUserSettings
  [settings]
  (enforce-invariants settings settings))

(t2/define-before-update :model/TableUserSettings
  [settings]
  (enforce-invariants settings (t2/changes settings)))

(mu/defn upsert-user-settings
  "Record the user-settable Table columns present in `settings` as the user values of `table`, flagging the
  [[warehouse-schema-overlay/table-user-settings-flags]] among them as set.

  Publishing is one choice over `is_published` and `collection_id`, so recording either records the pair: a Table
  published into the root collection has a NULL `collection_id` that must still beat the sync value."
  [{:keys [id]} :- [:map [:id ::lib.schema.id/table]]
   settings     :- ::warehouse-schema.schema/table.update]
  (let [settings (u/select-keys-when settings :present warehouse-schema-overlay/user-settable-table-columns)]
    (when (seq settings)
      (when-not (warehouse-schema.db/table-user-settings-exist? id)
        (warehouse-schema.db/insert-table-user-settings! {:table_id id}))
      ;; the flags are stated here rather than left to the model hook: setting a column to the NULL it already holds
      ;; is not a change the hook can see, and recording that the user chose it is the whole point of the flag
      (warehouse-schema.db/update-table-user-settings! id (with-set-flags settings settings settings)))))

(mu/defn upsert-user-settings-for-tables!
  "Record `settings` as the user values of every Table in `table-ids`, in one statement rather than per Table.
  Bulk edits in Data Studio and publishing go through here; see [[upsert-user-settings]] for the semantics."
  [table-ids :- [:set ::lib.schema.id/table]
   settings  :- ::warehouse-schema.schema/table.update]
  (let [settings (u/select-keys-when settings :present warehouse-schema-overlay/user-settable-table-columns)]
    (when (and (seq settings) (seq table-ids))
      (let [existing (warehouse-schema.db/table-ids-with-user-settings table-ids)]
        (when-let [missing (not-empty (remove existing table-ids))]
          (warehouse-schema.db/insert-table-user-settings! (mapv (fn [id] {:table_id id}) missing)))
        (warehouse-schema.db/update-table-user-settings-for-tables!
         table-ids (with-set-flags settings settings settings))))))

(defn- valid-field-order?
  "Field ordering is valid if all the fields from a given table are present and only from that table."
  [table field-ordering]
  (= (warehouse-schema.db/active-field-ids-for-table (u/the-id table))
     (set field-ordering)))

(defn custom-order-fields!
  "Set field order to `field-order`."
  [table field-order]
  {:pre [(valid-field-order? table field-order)]}
  (t2/with-transaction [_]
    ;; a custom order is the user's choice, so it belongs with their other Table values rather than in
    ;; `metabase_table`, which sync owns
    (upsert-user-settings table {:field_order :custom})
    (dorun
     (map-indexed (fn [position field-id]
                    (warehouse-schema.db/update-field! field-id {:position        position
                                                                 :custom_position position}))
                  field-order))))

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

;;; ------------------------------------------------- Serialization -------------------------------------------------

(defmethod serdes/extract-query "TableUserSettings" [_model-name {:keys [filter-column filter-ids]}]
  ;; see [[metabase.warehouse-schema.models.field-user-settings]]: only rows that record something
  (warehouse-schema.db/table-user-settings-recording-something filter-column filter-ids))

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
               :points_of_interest_set :data_layer_set :data_source_set]
   :defaults  {:display_name_set       false
               :description_set        false
               :entity_type_set        false
               :visibility_type_set    false
               :caveats_set            false
               :points_of_interest_set false
               :data_layer_set         false
               :data_source_set        false}
   :transform {:created_at    (serdes/date)
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
