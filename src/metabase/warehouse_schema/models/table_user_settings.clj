(ns metabase.warehouse-schema.models.table-user-settings
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
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
  (cond-> settings
    (and (contains? settings :visibility_type) (not (contains? settings :data_layer)))
    (assoc :data_layer (table/visibility-type->data-layer (some-> (:visibility_type settings) keyword)))

    (and (contains? settings :data_layer) (not (contains? settings :visibility_type)))
    (assoc :visibility_type (table/data-layer->visibility-type (some-> (:data_layer settings) keyword)))

    (and (contains? settings :collection_id) (not (contains? settings :is_published)))
    (assoc :is_published (boolean (:is_published table)))))

(defn- settings-flags
  "The `_set` flags to write alongside `settings`, one for each column in it that has one."
  [settings]
  (into {} (keep (fn [[k flag]] (when (contains? settings k) [flag true])))
        warehouse-schema-overlay/table-user-settings-flags))

(mu/defn upsert-user-settings
  "Record the user-settable Table columns present in `settings` as the user values of `table`, flagging the
  [[warehouse-schema-overlay/table-user-settings-flags]] among them as set.

  Publishing is one choice over `is_published` and `collection_id`, so recording either records the pair: a Table
  published into the root collection has a NULL `collection_id` that must still beat the sync value."
  [{:keys [id]} :- [:map [:id ::lib.schema.id/table]]
   settings     :- ::warehouse-schema.schema/table.update]
  (let [table    (warehouse-schema.db/table id)
        settings (u/select-keys-when settings :present warehouse-schema-overlay/user-settable-table-columns)
        _        (table/validate-user-changes! settings table)
        settings (complete-pairs settings table)]
    (when (seq settings)
      (when-not (warehouse-schema.db/table-user-settings-exist? id)
        (warehouse-schema.db/insert-table-user-settings! {:table_id id}))
      (warehouse-schema.db/update-table-user-settings! id (merge settings (settings-flags settings))))))

(mu/defn upsert-user-settings-for-tables!
  "Record `settings` as the user values of every Table in `table-ids`, in one statement rather than per Table.
  Bulk edits in Data Studio and publishing go through here; see [[upsert-user-settings]] for the semantics."
  [table-ids :- [:set ::lib.schema.id/table]
   settings  :- ::warehouse-schema.schema/table.update]
  (let [settings (u/select-keys-when settings :present warehouse-schema-overlay/user-settable-table-columns)]
    (when (and (seq settings) (seq table-ids))
      (let [tables   (warehouse-schema.db/tables table-ids)
            existing (warehouse-schema.db/table-ids-with-user-settings table-ids)]
        ;; each Table is validated against its own current values, the way a single update is
        (doseq [table tables]
          (table/validate-user-changes! settings table))
        (when-let [missing (not-empty (remove existing table-ids))]
          (warehouse-schema.db/insert-table-user-settings! (mapv (fn [id] {:table_id id}) missing)))
        ;; completing the pairs can depend on the Table's own current values, so group by what they come out as:
        ;; one statement where every Table agrees, which is the common case, and one per distinct outcome otherwise
        (doseq [[completed group] (group-by #(complete-pairs settings %) tables)]
          (warehouse-schema.db/update-table-user-settings-for-tables!
           (into #{} (map :id) group)
           (merge completed (settings-flags completed))))))))

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
