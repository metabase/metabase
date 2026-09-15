(ns metabase.warehouse-schema.models.field-user-settings
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
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

(defn- with-set-flags
  "Set the `_set` flag of every flagged column `effective` writes, unless `effective` sets the flag itself."
  [settings effective]
  (reduce-kv (fn [m column flag]
               (cond-> m
                 (and (contains? effective column) (not (contains? effective flag)))
                 (assoc flag true)))
             settings
             warehouse-schema-overlay/field-user-settings-flags))

(methodical/defmethod t2/primary-keys :model/FieldUserSettings [_model] [:field_id])

(defn- delete-when-empty!
  "Delete `settings` when it holds no user value and no true flag, returning it either way."
  [settings]
  (when (and (every? #(nil? (get settings %)) warehouse-schema-overlay/user-settable-field-columns)
             (not-any? #(get settings %) (vals warehouse-schema-overlay/field-user-settings-flags)))
    (warehouse-schema.db/delete-field-user-settings! (:field_id settings)))
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

(mu/defn upsert-user-settings
  "Record the user-settable Field columns present in `settings` as the user values of `field`."
  [{:keys [id]} :- [:select-keys :metabase.warehouse-schema.schema/field [:id]]
   settings     :- ::warehouse-schema.schema/field.update]
  (let [settings (u/select-keys-when settings :present field/field-user-settings)]
    (when (seq settings)
      (if (warehouse-schema.db/field-user-settings-exist? id)
        (warehouse-schema.db/update-field-user-settings! id (with-set-flags settings settings))
        (warehouse-schema.db/insert-field-user-settings! (assoc settings :field_id id))))))

(mu/defn set-custom-positions!
  "Record `field-id->position` as the Fields' user `custom_position`s."
  [field-id->position :- [:map-of ::lib.schema.id/field :int]]
  (let [existing (warehouse-schema.db/field-ids-with-user-settings (keys field-id->position))
        missing  (remove existing (keys field-id->position))]
    (when (seq missing)
      (warehouse-schema.db/insert-field-user-settings!
       (mapv (fn [id] {:field_id id :custom_position (field-id->position id)}) missing)))
    (when (seq existing)
      (warehouse-schema.db/update-field-user-settings-custom-positions! (select-keys field-id->position existing)))))

(mu/defn unset-user-settings!
  "Drop the user values of the Field columns `ks` for `field`."
  [{:keys [id]} :- [:select-keys :metabase.warehouse-schema.schema/field [:id]]
   ks           :- [:sequential (into [:enum] warehouse-schema-overlay/user-settable-field-columns)]]
  (when (warehouse-schema.db/field-user-settings-exist? id)
    (warehouse-schema.db/update-field-user-settings!
     id
     (into {} (mapcat (fn [k]
                        (cond-> [[k nil]]
                          (warehouse-schema-overlay/field-user-settings-flags k) (conj [(warehouse-schema-overlay/field-user-settings-flags k) false]))))
           ks))))

(defmethod serdes/extract-query "FieldUserSettings" [_model-name {:keys [filter-column filter-ids] :as opts}]
  (if (= filter-column :table_id)
    (warehouse-schema.db/field-user-settings-for-tables filter-ids)
    (serdes/extract-query-collections :model/FieldUserSettings opts)))

(defmethod serdes/entity-id "FieldUserSettings" [_ _] nil)

(defmethod serdes/generate-path "FieldUserSettings" [_ {:keys [field_id]}]
  (conj (serdes/generate-path "Field" {:id field_id})
        {:model "FieldUserSettings" :id "1"}))

(defn- field-path->field-ref [field-values-path]
  (let [[db schema table field :as field-ref] (map :id (pop field-values-path))]
    (if field
      field-ref
      ;; It's too short, so no schema. Shift them over and add a nil schema.
      [db nil schema table])))

(defmethod serdes/make-spec "FieldUserSettings" [_model-name _opts]
  {:copy      [:semantic_type :description :display_name :visibility_type
               :has_field_values :effective_type :coercion_strategy :caveats
               :points_of_interest :nfc_path :json_unfolding :settings :data_sensitivity :custom_position
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
