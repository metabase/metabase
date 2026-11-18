(ns metabase.warehouse-schema.models.field-user-settings
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.change-log.core :as change-log]
   [metabase.events.core :as events]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.serialization.core :as serialization]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.warehouse-schema.db :as warehouse-schema.db]
   [metabase.warehouse-schema.models.field :as field]
   [metabase.warehouse-schema.schema :as warehouse-schema.schema]
   [metabase.warehouse-schema.serialization :as warehouse-schema.serialization]
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
  (derive :hook/events))

(defmethod events/spec :model/FieldUserSettings
  [_model]
  {:create :event/field-user-settings-create
   :update :event/field-user-settings-update
   :delete :event/field-user-settings-delete})

(defmethod change-log/spec :model/FieldUserSettings [_model]
  {:track [:field_id :semantic_type :description :display_name :visibility_type :fk_target_field_id :has_field_values
           :effective_type :coercion_strategy :caveats :points_of_interest :nfc_path :json_unfolding :settings
           :data_sensitivity :description_set :semantic_type_set :fk_target_field_id_set :custom_position]
   :skip  []})

(defmethod app-db-copy/spec :model/FieldUserSettings [_model]
  {:skip? false})

(defn- with-set-flags
  "Set the `_set` flag of every flagged column `effective` writes, unless `effective` sets the flag itself."
  [settings effective]
  (reduce-kv (fn [m column flag]
               (cond-> m
                 (and (contains? effective column) (not (contains? effective flag)))
                 (assoc flag true)))
             settings
             user-settings/field-set-flags))

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

(defn- remove-remappings-ended-by!
  "Removes what the user's new semantic type in `settings` ends for `field`: its foreign key target and external
  remapping when it stops being a foreign key, and its internal remapping when it can no longer hold one."
  [{:keys [id base_type semantic_type]} settings]
  (when (contains? settings :semantic_type)
    (when (and (fk-semantic-type? semantic_type)
               (not (fk-semantic-type? (:semantic_type settings))))
      (warehouse-schema.db/unset-user-settings-fk-target! id)
      (warehouse-schema.db/delete-dimensions-of-type-for-field! id :external))
    (when-not (internal-remapping-allowed? base_type (:semantic_type settings))
      (warehouse-schema.db/delete-dimensions-of-type-for-field! id :internal))))

(mu/defn upsert-field-user-settings!
  "Record the user-settable Field columns present in `settings` as the user values of `field`, in its settings and its
  row; a nil for a column without a set flag unsets it."
  [{:keys [id] :as field} :- ::warehouse-schema.schema/field
   settings               :- ::warehouse-schema.schema/field.update]
  (let [settings (u/select-keys-when settings :present user-settings/user-settable-field-columns)]
    (when (seq settings)
      (t2/with-transaction [_]
        (remove-remappings-ended-by! field settings)
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
   :before-load   warehouse-schema.serialization/field-user-settings-before-load
   :after-load    warehouse-schema.serialization/field-user-settings-after-load
   :rows-by-refs  serialization/field-user-settings-rows-by-refs})

(defmethod remote-sync/spec :model/FieldUserSettings
  [_model]
  {:synced-items         warehouse-schema.db/synced-field-user-settings-items
   :synced-filter-clause warehouse-schema.db/synced-field-clause})
