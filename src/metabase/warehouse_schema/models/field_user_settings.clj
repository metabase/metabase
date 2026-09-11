(ns metabase.warehouse-schema.models.field-user-settings
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [metabase.warehouse-schema.db :as warehouse-schema.db]
   [metabase.warehouse-schema.models.field :as field]
   [metabase.warehouse-schema.schema :as warehouse-schema.schema]
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
   :settings          mi/transform-json
   :nfc_path          mi/transform-json})

(doto :model/FieldUserSettings
  (derive :metabase/model)
  (derive :hook/timestamped?))

(methodical/defmethod t2/primary-keys :model/FieldUserSettings [_model] [:field_id])

(mu/defn upsert-user-settings
  "Record the user-settable Field columns present in `settings` as the user values of `field`, flagging the
  [[warehouse-schema-overlay/field-user-settings-flags]] among them as set."
  [{:keys [id]} :- [:map [:id ::lib.schema.id/field]]
   settings     :- ::warehouse-schema.schema/field.update]
  (let [settings (u/select-keys-when settings :present field/field-user-settings)
        flags    (into {} (keep (fn [[k flag]] (when (contains? settings k) [flag true]))) warehouse-schema-overlay/field-user-settings-flags)]
    (when (seq settings)
      (when-not (warehouse-schema.db/field-user-settings-exist? id)
        (warehouse-schema.db/insert-field-user-settings! {:field_id id}))
      (warehouse-schema.db/update-field-user-settings! id (merge settings flags)))))

(mu/defn unset-user-settings!
  "Drop the user values of the Field columns `ks` for `field`, so its sync values show again. Used when sync
  invalidates them, e.g. a base type change voids a user-set coercion."
  [{:keys [id]} :- [:map [:id ::lib.schema.id/field]]
   ks           :- [:sequential (into [:enum] warehouse-schema-overlay/user-settable-field-columns)]]
  (when (warehouse-schema.db/field-user-settings-exist? id)
    (warehouse-schema.db/update-field-user-settings!
     id
     (into {} (mapcat (fn [k]
                        (cond-> [[k nil]]
                          (warehouse-schema-overlay/field-user-settings-flags k) (conj [(warehouse-schema-overlay/field-user-settings-flags k) false]))))
           ks))))
