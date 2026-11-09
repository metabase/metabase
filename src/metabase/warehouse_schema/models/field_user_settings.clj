(ns metabase.warehouse-schema.models.field-user-settings
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.serialization.core :as serialization]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.warehouse-schema.db :as warehouse-schema.db]
   [metabase.warehouse-schema.models.field :as field]
   [metabase.warehouse-schema.schema :as warehouse-schema.schema]
   [metabase.warehouse-schema.user-settings :as user-settings]
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
  (derive :hook/timestamped?)
  (derive :hook/dependencies))

(defn- with-set-flags
  "Set the `_set` flag of every flagged column `effective` writes, unless `effective` sets the flag itself."
  [settings effective]
  (reduce-kv (fn [m column flag]
               (cond-> m
                 (and (contains? effective column) (not (contains? effective flag)))
                 (assoc flag true)))
             settings
             user-settings/field-set-flags))

(methodical/defmethod t2/primary-keys :model/FieldUserSettings [_model] [:field_id])

(defn- delete-when-empty!
  "Delete `settings` when it holds no user value and no true flag, returning it either way."
  [settings]
  (when (and (every? #(nil? (get settings %)) user-settings/user-settable-field-columns)
             (not-any? #(get settings %) (vals user-settings/field-set-flags)))
    (warehouse-schema.db/delete-field-user-settings! [(:field_id settings)]))
  settings)

(t2/define-before-insert :model/FieldUserSettings
  [settings]
  (with-set-flags settings settings))

(t2/define-after-insert :model/FieldUserSettings
  [settings]
  (delete-when-empty! settings))

(t2/define-before-update :model/FieldUserSettings
  [settings]
  (with-set-flags settings (t2/changes settings)))

(t2/define-after-update :model/FieldUserSettings
  [settings]
  (delete-when-empty! settings))

(mu/defn upsert-field-user-settings!
  "Record the user-settable Field columns present in `settings` as the user values of `field`, in its settings and its
  row; a nil for a column without a set flag unsets it."
  [{:keys [id]} :- ::warehouse-schema.schema/field
   settings     :- ::warehouse-schema.schema/field.update]
  (let [settings (u/select-keys-when settings :present user-settings/user-settable-field-columns)]
    (when (seq settings)
      (t2/with-transaction [_]
        (warehouse-schema.db/update-or-insert-field-user-settings!
         id (fn [existing] (cond->> settings existing (with-set-flags settings))))
        (warehouse-schema.db/update-field! id settings)))))

(mu/defn set-custom-positions!
  "Record `field-id->position` as the Fields' user `custom_position`s, in their settings and their rows."
  [field-id->position :- [:map-of ::lib.schema.id/field :int]]
  (t2/with-transaction [_]
    (let [existing (warehouse-schema.db/field-ids-with-user-settings (keys field-id->position))
          missing  (remove existing (keys field-id->position))]
      (when (seq missing)
        (warehouse-schema.db/insert-field-user-settings!
         (mapv (fn [id] {:field_id id :custom_position (field-id->position id)}) missing)))
      (when (seq existing)
        (warehouse-schema.db/update-field-user-settings-custom-positions! (select-keys field-id->position existing)))
      (warehouse-schema.db/update-field-custom-positions! field-id->position))))

(mu/defn unset-field-user-settings!
  "Drop the user values of the Field columns `ks` for `field` from its settings, leaving its row as it is for sync to
  take over."
  [{:keys [id]} :- ::warehouse-schema.schema/field
   ks           :- [:sequential (into [:enum] user-settings/user-settable-field-columns)]]
  (when (warehouse-schema.db/field-user-settings id)
    (warehouse-schema.db/update-field-user-settings!
     id
     (into {} (mapcat (fn [k]
                        (cond-> [[k nil]]
                          (user-settings/field-set-flags k) (conj [(user-settings/field-set-flags k) false]))))
           ks))))

(mu/defn delete-field-user-settings!
  "Delete the settings of the Fields with `field-ids`, leaving their rows as they are for sync to take over."
  [field-ids :- [:sequential ::lib.schema.id/field]]
  (doseq [batch (partition-all 1000 field-ids)]
    (warehouse-schema.db/delete-field-user-settings! batch)))

(mu/defn delete-field-user-settings-for-table!
  "[[delete-field-user-settings!]] for every Field of the Table with `table-id`."
  [table-id :- ::lib.schema.id/table]
  (delete-field-user-settings! (vec (warehouse-schema.db/field-ids-with-user-settings-for-table table-id))))

(def ^:private field-user-settings-slug "___fieldusersettings")

(defmethod serialization/spec :model/FieldUserSettings [_]
  {:schema    ::warehouse-schema.schema/external-field-user-settings
   :identity  [:field_id]
   :primary-key :field_id
   :copy      [:semantic_type :description :display_name :visibility_type
               :has_field_values :effective_type :coercion_strategy :caveats
               :points_of_interest :json_unfolding :settings :data_sensitivity :custom_position
               :description_set :semantic_type_set :fk_target_field_id_set]
   :skip      [:nfc_path]
   :defaults  {:description_set        false
               :semantic_type_set      false
               :fk_target_field_id_set false}
   :transform {:fk_target_field_id serialization/field-transform
               :field_id           serialization/field-transform}})

(defmethod serialization/storage-paths :model/FieldUserSettings [_ entities _ctx]
  (mapv (fn [field-user-settings]
          (let [field-path (serialization/storage-path-prefixes (:field_id field-user-settings))]
            (update field-path (dec (count field-path))
                    (fn [segment] (assoc segment :suffix field-user-settings-slug)))))
        entities))

;;; ------------------------------------------------- SerDes loading ----------------------------------------------------

(defmethod serialization/before-load :model/FieldUserSettings [_ items]
  (mapv (fn [{:keys [local] :as item}]
          (cond-> item
            local (update :row #(merge (zipmap user-settings/user-settable-field-columns (repeat nil)) %))))
        items))

(defmethod serialization/after-load :model/FieldUserSettings [_ items]
  (doseq [{{:keys [field_id] :as settings} :instance} items]
    (warehouse-schema.db/update-field! field_id (select-keys settings (user-settings/user-set-field-columns settings)))))

(defmethod remote-sync/spec :model/FieldUserSettings
  [_model]
  {:synced-filter-clause warehouse-schema.db/synced-field-user-settings-clause
   :parent               (fn [{:keys [field_id]}]
                           (some->> (warehouse-schema.db/field field_id) :table_id (vector :model/TableUserSettings)))})
