(ns metabase.warehouse-schema.models.table-user-settings
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [metabase.warehouse-schema.db :as warehouse-schema.db]
   [metabase.warehouse-schema.models.field-user-settings :as field-user-settings]
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
  (derive :hook/search-index))

(methodical/defmethod t2/primary-keys :model/TableUserSettings [_model] [:table_id])

(defn- complete-pairs
  "Fill in the other half of the two-column choices in `settings`: `visibility_type`/`data_layer`, and
  `is_published`/`collection_id`."
  [settings table]
  (let [changing? (fn [k] (and (contains? settings k)
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
  "Set the `_set` flag of every flagged column in `effective`, unless `explicit` sets the flag itself."
  [settings effective explicit]
  (reduce-kv (fn [m column flag]
               (cond-> m
                 (and (contains? effective column) (not (contains? explicit flag)))
                 (assoc flag true)))
             settings
             warehouse-schema-overlay/table-user-settings-flags))

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
  (when (and (every? #(nil? (get settings %)) warehouse-schema-overlay/user-settable-table-columns)
             (not-any? #(get settings %) (vals warehouse-schema-overlay/table-user-settings-flags)))
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

(mu/defn upsert-user-settings
  "Record the user-settable Table columns present in `settings` as the user values of `table`."
  [{:keys [id]} :- [:map [:id ::lib.schema.id/table]]
   settings     :- ::warehouse-schema.schema/table.update]
  (let [settings (u/select-keys-when settings :present warehouse-schema-overlay/user-settable-table-columns)]
    (when (seq settings)
      (if (warehouse-schema.db/table-user-settings-exist? id)
        (warehouse-schema.db/update-table-user-settings! id (with-set-flags settings settings settings))
        (warehouse-schema.db/insert-table-user-settings! (assoc settings :table_id id))))))

(mu/defn upsert-user-settings-for-tables!
  "[[upsert-user-settings]] for every Table in `table-ids`, in one statement per kind."
  [table-ids :- [:set ::lib.schema.id/table]
   settings  :- ::warehouse-schema.schema/table.update]
  (let [settings (u/select-keys-when settings :present warehouse-schema-overlay/user-settable-table-columns)]
    (when (and (seq settings) (seq table-ids))
      (let [existing (warehouse-schema.db/table-ids-with-user-settings table-ids)]
        (when-let [missing (not-empty (remove existing table-ids))]
          (warehouse-schema.db/insert-table-user-settings! (mapv #(assoc settings :table_id %) missing)))
        (when (seq existing)
          (warehouse-schema.db/update-table-user-settings-for-tables!
           existing (with-set-flags settings settings settings)))))))

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
    (upsert-user-settings table {:field_order :custom})
    (field-user-settings/set-custom-positions! (zipmap field-order (range)))
    (table/update-field-positions! (warehouse-schema.db/table (u/the-id table)))))

(mu/defn unset-user-settings!
  "Drop the user values of the Table columns `ks` for `table`."
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

(defmethod serdes/extract-query "TableUserSettings" [_model-name {:keys [filter-ids] :as opts}]
  (serdes/extract-reducible-nested "TableUserSettings" (dissoc opts :filter-column :filter-ids)
                                   (warehouse-schema.db/table-user-settings-with-field-settings filter-ids)))

(defmethod serdes/entity-id "TableUserSettings" [_ _] nil)

(defmethod serdes/generate-path "TableUserSettings" [_ {:keys [table_id]}]
  (conj (serdes/table->path (serdes/*export-table-fk* table_id))
        {:model "TableUserSettings" :id "1"}))

(defmethod serdes/deserialization-dependencies "TableUserSettings" [tus]
  (let [db-path (first (serdes/path tus))]
    (cond-> [[db-path]]
      (:collection_id tus) (conj [{:model "Collection" :id (:collection_id tus)}]))))

(defmethod serdes/load-one! "TableUserSettings" [ingested maybe-local]
  (let [settings (serdes/default-load-one! ingested maybe-local)]
    (when (:field_order ingested)
      (table/update-field-positions! (warehouse-schema.db/table (:table_id settings))))
    settings))

(defmethod serdes/load-find-local "TableUserSettings" [path]
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
               :description_set :visibility_type_set :caveats_set
               :points_of_interest_set :data_layer_set :data_source_set]
   :defaults  {:description_set        false
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
                                                      (serdes/*import-table-fk* (table-path->table-ref (serdes/path current))))}
               :fields        (serdes/nested :model/FieldUserSettings :table_id
                                             {:sort-by          :field_name
                                              :delete-children! warehouse-schema.db/delete-field-user-settings-for-table!})}})

(def ^:private table-user-settings-slug "___tableusersettings")

(defmethod serdes/storage-path "TableUserSettings" [tus {:keys [inline-user-settings]}]
  (let [table-path (pop (serdes/path tus))]
    (if inline-user-settings
      (conj (serdes/storage-path-prefixes table-path)
            {:label (:id (peek table-path)) :key (:id (peek table-path))})
      (conj (serdes/storage-path-prefixes table-path)
            {:label (str (:id (peek table-path)) table-user-settings-slug)}))))
