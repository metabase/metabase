(ns metabase.warehouse-schema.models.table-user-settings
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.warehouse-schema.db :as warehouse-schema.db]
   [metabase.warehouse-schema.models.field-user-settings :as field-user-settings]
   [metabase.warehouse-schema.models.table :as table]
   [metabase.warehouse-schema.schema :as warehouse-schema.schema]
   [metabase.warehouse-schema.user-settings :as user-settings]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

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
  (derive :hook/timestamped?)
  (derive :hook/dependencies))

(methodical/defmethod t2/primary-keys :model/TableUserSettings [_model] [:table_id])

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

(defn- enforce-invariants
  "Validate `explicit`, complete its two-column pairs and set its flags, merged into `settings`."
  [settings explicit]
  (let [table     (warehouse-schema.db/table (:table_id settings))
        completed (complete-pairs explicit table)]
    (table/validate-user-changes! explicit table)
    (-> (merge settings completed)
        (with-set-flags completed explicit))))

(defn- delete-when-empty!
  "Delete `settings` when it holds no user value and no true flag, returning it either way."
  [settings]
  (when (and (every? #(nil? (get settings %)) user-settings/user-settable-table-columns)
             (not-any? #(get settings %) (vals user-settings/table-set-flags)))
    (warehouse-schema.db/delete-table-user-settings! (:table_id settings)))
  settings)

(t2/define-before-insert :model/TableUserSettings
  [settings]
  (enforce-invariants settings settings))

(t2/define-after-insert :model/TableUserSettings
  [settings]
  (delete-when-empty! settings))

(t2/define-before-update :model/TableUserSettings
  [settings]
  (enforce-invariants settings (t2/changes settings)))

(t2/define-after-update :model/TableUserSettings
  [settings]
  (delete-when-empty! settings))

(defn- without-derived-half
  "Drop from `changes` the half of a `visibility_type`/`data_layer` pair the Table's own update derives from the other."
  [{:keys [visibility_type data_layer] :as changes}]
  (if (and (contains? changes :visibility_type) (contains? changes :data_layer))
    (if (= (some-> data_layer keyword) (table/visibility-type->data-layer (some-> visibility_type keyword)))
      (dissoc changes :data_layer)
      (dissoc changes :visibility_type))
    changes))

(defn- write-user-values!
  "Write `values` into the Table with `table-id` with a new `updated_at`, so that sync skips an update it read the row
  for before this edit."
  [table-id values]
  (warehouse-schema.db/update-table! table-id (assoc values :updated_at (mi/current-timestamp))))

(mu/defn upsert-table-user-settings!
  "Record the user-settable Table columns present in `settings` as the user values of `table`, in its settings and its
  row; a nil for a column without a set flag unsets it."
  [{:keys [id]} :- ::warehouse-schema.schema/table
   settings     :- ::warehouse-schema.schema/table.update]
  (let [settings (u/select-keys-when settings :present user-settings/user-settable-table-columns)]
    (when (seq settings)
      (t2/with-transaction [_]
        (let [existing (warehouse-schema.db/table-user-settings id)]
          (if existing
            (warehouse-schema.db/update-table-user-settings! id (with-set-flags settings settings settings))
            (warehouse-schema.db/insert-table-user-settings! (assoc settings :table_id id)))
          (write-user-values! id settings))))))

(mu/defn upsert-table-user-settings-for-tables!
  "[[upsert-table-user-settings!]] for every Table in `table-ids`, with one statement per kind for the settings and one for
  the rows."
  [table-ids :- [:set ::lib.schema.id/table]
   settings  :- ::warehouse-schema.schema/table.update]
  (let [settings (u/select-keys-when settings :present user-settings/user-settable-table-columns)]
    (when (and (seq settings) (seq table-ids))
      (t2/with-transaction [_]
        (let [existing (warehouse-schema.db/table-ids-with-user-settings table-ids)]
          (when-let [missing (not-empty (remove existing table-ids))]
            (warehouse-schema.db/insert-table-user-settings! (mapv #(assoc settings :table_id %) missing)))
          (when (seq existing)
            (warehouse-schema.db/update-table-user-settings-for-tables!
             existing (with-set-flags settings settings settings))))
        (warehouse-schema.db/update-tables! table-ids (assoc settings :updated_at (mi/current-timestamp)))))))

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
    (upsert-table-user-settings! table {:field_order :custom})
    (field-user-settings/set-custom-positions! (zipmap field-order (range)))
    (table/update-field-positions! (warehouse-schema.db/table (u/the-id table)))))

(mu/defn unset-table-user-settings!
  "Drop the user values of the Table columns `ks` for `table` from its settings, leaving its row as it is for sync to
  take over."
  [{:keys [id]} :- ::warehouse-schema.schema/table
   ks           :- [:sequential (into [:enum] user-settings/user-settable-table-columns)]]
  (when (warehouse-schema.db/table-user-settings id)
    (warehouse-schema.db/update-table-user-settings!
     id
     (into {} (mapcat (fn [k]
                        (cond-> [[k nil]]
                          (user-settings/table-set-flags k) (conj [(user-settings/table-set-flags k) false]))))
           ks))))

(mu/defn delete-table-user-settings!
  "Delete the settings of the Tables with `table-ids`, leaving their rows as they are for sync to take over."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (doseq [table-id table-ids]
    (warehouse-schema.db/delete-table-user-settings! table-id)))

;;; ------------------------------------------------- Serialization -------------------------------------------------

(defmethod serdes/extract-query "TableUserSettings" [_model-name {:keys [filter-ids]}]
  (warehouse-schema.db/table-user-settings-for-tables filter-ids))

(defmethod serdes/entity-id "TableUserSettings" [_ _] nil)

(defmethod serdes/generate-path "TableUserSettings" [_ {:keys [table_id]}]
  (conj (serdes/table->path (serdes/*export-table-fk* table_id))
        {:model "TableUserSettings" :id "1"}))

(defmethod serdes/deserialization-dependencies "TableUserSettings" [{:keys [collection_id]}]
  (when collection_id
    [[{:model "Collection" :id collection_id}]]))

(defmethod serdes/load-find-local "TableUserSettings" [path]
  (let [found-table (serdes/load-find-local (pop path))]
    (warehouse-schema.db/table-user-settings (:id found-table))))

(def ^:private legacy-fields
  "The FieldUserSettings a settings file carried before they got files of their own."
  (serdes/nested :model/FieldUserSettings :table_id
                 {:delete-children! field-user-settings/delete-field-user-settings-for-table!}))

(defmethod serdes/load-one! "TableUserSettings" [ingested maybe-local]
  (t2/with-transaction [_]
    (let [settings (serdes/default-load-one! ingested maybe-local)
          table-id (serdes/*import-table-fk* (serdes/table-path->table-ref (pop (serdes/path ingested))))]
      (let [settings (warehouse-schema.db/table-user-settings table-id)]
        (write-user-values! table-id (without-derived-half
                                      (select-keys settings (user-settings/user-set-table-columns settings)))))
      (when (contains? ingested :fields)
        ((:import-with-context legacy-fields)
         (t2/instance :model/TableUserSettings {:table_id table-id}) :fields (:fields ingested)))
      (when (:field_order ingested)
        (table/update-field-positions! (warehouse-schema.db/table table-id)))
      settings)))

(defmethod serdes/make-spec "TableUserSettings" [_model-name _opts]
  {:copy      [:display_name :description :entity_type :visibility_type :field_order :caveats :points_of_interest
               :show_in_getting_started :data_authority :data_source :owner_email :is_published
               :description_set :visibility_type_set :data_layer_set :data_source_set]
   :skip      [:caveats_set :points_of_interest_set]
   :defaults  {:description_set        false
               :visibility_type_set    false
               :data_layer_set         false
               :data_source_set        false}
   :transform {:collection_id (serdes/fk :model/Collection)
               :owner_user_id (serdes/fk :model/User)
               :data_layer    (serdes/optional-kw)
               :table_id      {::serdes/fk true
                               :export     #(serdes/*export-table-fk* %)
                               :import-with-context (fn [current _ _]
                                                      (serdes/*import-table-fk* (serdes/table-path->table-ref (pop (serdes/path current)))))}}})

(defmethod serdes/ingested-path "TableUserSettings" [_ {:keys [table_id]}]
  (conj (serdes/table->path table_id) {:model "TableUserSettings" :id "1"}))

(def ^:private table-user-settings-slug "___tableusersettings")

(defmethod serdes/storage-path "TableUserSettings" [tus _ctx]
  (let [table-path (pop (serdes/path tus))]
    (conj (serdes/storage-path-prefixes table-path)
          {:label (:id (peek table-path)) :suffix table-user-settings-slug})))
