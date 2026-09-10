(ns metabase.warehouse-schema.models.field-user-settings
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
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
  [[warehouse-schema.db/field-user-settings-flags]] among them as set."
  [{:keys [id]} :- [:map [:id ::lib.schema.id/field]]
   settings     :- ::warehouse-schema.schema/field.update]
  (let [settings (u/select-keys-when settings :present field/field-user-settings)
        flags    (into {} (keep (fn [[k flag]] (when (contains? settings k) [flag true]))) warehouse-schema.db/field-user-settings-flags)]
    (when (seq settings)
      (when-not (warehouse-schema.db/field-user-settings-exist? id)
        (warehouse-schema.db/insert-field-user-settings! {:field_id id}))
      (warehouse-schema.db/update-field-user-settings! id (merge settings flags)))))

(mu/defn unset-user-settings!
  "Drop the user values of the Field columns `ks` for `field`, so its sync values show again. Used when sync
  invalidates them, e.g. a base type change voids a user-set coercion."
  [{:keys [id]} :- [:map [:id ::lib.schema.id/field]]
   ks           :- [:sequential (into [:enum] warehouse-schema.db/user-settable-field-columns)]]
  (when (warehouse-schema.db/field-user-settings-exist? id)
    (warehouse-schema.db/update-field-user-settings!
     id
     (into {} (mapcat (fn [k]
                        (cond-> [[k nil]]
                          (warehouse-schema.db/field-user-settings-flags k) (conj [(warehouse-schema.db/field-user-settings-flags k) false]))))
           ks))))

(defmethod serdes/entity-id "FieldUserSettings" [_ _] nil)

(defmethod serdes/generate-path "FieldUserSettings" [_ {:keys [field_id]}]
  (conj (serdes/generate-path "Field" {:id field_id})
        {:model "FieldUserSettings" :id "1"}))

(defmethod serdes/deserialization-dependencies "FieldUserSettings" [fv]
  (let [db-path (first (serdes/path fv))]
    [[db-path]]))

(defmethod serdes/load-find-local "FieldUserSettings" [path]
  ;; Delegate to finding the parent Field, then look up its corresponding FieldUserSettings.
  (let [field (serdes/load-find-local (pop path))]
    (warehouse-schema.db/field-user-settings (:id field))))

(defn- field-path->field-ref [field-values-path]
  (let [[db schema table field :as field-ref] (map :id (pop field-values-path))]
    (if field
      field-ref
      ;; It's too short, so no schema. Shift them over and add a nil schema.
      [db nil schema table])))

(defmethod serdes/make-spec "FieldUserSettings" [_model-name _opts]
  {:copy      [:semantic_type :description :display_name :visibility_type
               :has_field_values :effective_type :coercion_strategy :caveats
               :points_of_interest :nfc_path :json_unfolding :settings :data_sensitivity
               :description_set :semantic_type_set :fk_target_field_id_set]
   :defaults  {:description_set        false
               :semantic_type_set      false
               :fk_target_field_id_set false}
   :transform {:created_at   (serdes/date)
               :fk_target_field_id (serdes/fk :model/Field)
               :field_id     {::serdes/fk true
                              :export     (constantly ::serdes/skip)
                              :import-with-context (fn [current _ _]
                                                     (let [field-ref (field-path->field-ref (serdes/path current))]
                                                       (serdes/*import-field-fk* field-ref)))}}})

(def ^:private field-values-slug "___fieldusersettings")

(defmethod serdes/storage-path "FieldUserSettings" [fv _]
  ;; [path to table "fields" "field-name___fieldusersettings"] since there's zero or one FieldUserSettings per Field, and Fields
  ;; don't have their own directories.
  (let [hierarchy    (serdes/path fv)
        field-path   (serdes/storage-path-prefixes (drop-last hierarchy))]
    (update field-path (dec (count field-path))
            (fn [segment] (update segment :label str field-values-slug)))))
