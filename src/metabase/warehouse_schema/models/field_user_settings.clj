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
   :ai_semantic_type  field/transform-field-semantic-type
   :visibility_type   mi/transform-keyword
   :has_field_values  mi/transform-keyword
   :data_sensitivity    mi/transform-keyword
   :ai_data_sensitivity mi/transform-keyword
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
  "Delete `settings` when it holds no user value, no AI value and no true flag, returning it either way."
  [settings]
  (when (and (every? #(nil? (get settings %)) (concat warehouse-schema-overlay/user-settable-field-columns
                                                      (vals warehouse-schema-overlay/field-ai-columns)))
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
  [{:keys [id]} :- ::warehouse-schema.schema/field
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
  [{:keys [id]} :- ::warehouse-schema.schema/field
   ks           :- [:sequential (into [:enum] warehouse-schema-overlay/user-settable-field-columns)]]
  (when (warehouse-schema.db/field-user-settings-exist? id)
    (warehouse-schema.db/update-field-user-settings!
     id
     (into {} (mapcat (fn [k]
                        (cond-> [[k nil]]
                          (warehouse-schema-overlay/field-user-settings-flags k) (conj [(warehouse-schema-overlay/field-user-settings-flags k) false]))))
           ks))))

(def ^:private AIValues
  [:map {:closed true}
   [:semantic_type    {:optional true} [:maybe [:or :keyword :string]]]
   [:description      {:optional true} [:maybe :string]]
   [:data_sensitivity {:optional true} [:maybe [:or :keyword :string]]]])

(defn- ai-columns
  "`values`, keyed by the user-settable column, keyed by the column that holds its AI value instead."
  [values]
  (update-keys values warehouse-schema-overlay/field-ai-columns))

(mu/defn set-ai-values-for-fields!
  "Record each map of `field-id->values` as the accepted AI values of its Field. A nil value clears it. The human
  values and their flags stay as they are."
  [field-id->values :- [:map-of ::lib.schema.id/field AIValues]]
  (let [field-id->values (into {} (remove (comp empty? val)) field-id->values)]
    (when (seq field-id->values)
      (t2/with-transaction [_conn]
        (let [existing (warehouse-schema.db/field-ids-with-user-settings (keys field-id->values))
              inserts  (into []
                             (keep (fn [[id values]]
                                     (when (and (not (existing id)) (some some? (vals values)))
                                       (assoc (ai-columns values) :field_id id))))
                             field-id->values)]
          (when (seq inserts)
            (warehouse-schema.db/insert-field-user-settings! inserts))
          (doseq [[id values] field-id->values
                  :when (existing id)]
            (warehouse-schema.db/update-field-user-settings! id (ai-columns values))))))))

(mu/defn set-ai-values!
  "Record `values` as the accepted AI values of `field`; see [[set-ai-values-for-fields!]]."
  [{:keys [id]} :- ::warehouse-schema.schema/field
   values       :- AIValues]
  (set-ai-values-for-fields! {id values}))

(mu/defn unset-ai-values!
  "Drop the accepted AI values of the Field columns `ks` for `field`."
  [field :- ::warehouse-schema.schema/field
   ks    :- [:sequential (into [:enum] (keys warehouse-schema-overlay/field-ai-columns))]]
  (set-ai-values! field (zipmap ks (repeat nil))))

(defmethod serdes/extract-query "FieldUserSettings" [_model-name {:keys [filter-column filter-ids] :as opts}]
  (if (= filter-column :table_id)
    (warehouse-schema.db/field-user-settings-for-tables filter-ids)
    (serdes/extract-query-collections :model/FieldUserSettings opts)))

(defmethod serdes/entity-id "FieldUserSettings" [_ _] nil)

(defmethod serdes/generate-path "FieldUserSettings" [_ {:keys [field_id]}]
  (conj (serdes/generate-path "Field" {:id field_id})
        {:model "FieldUserSettings" :id "1"}))

(defmethod serdes/load-find-local "FieldUserSettings" [path]
  (when-let [field (serdes/load-find-local (pop path))]
    (warehouse-schema.db/field-user-settings (:id field))))

(defmethod serdes/load-update! "FieldUserSettings" [model-name ingested local]
  ((get-method serdes/load-update! :default)
   model-name
   (merge (zipmap (concat warehouse-schema-overlay/user-settable-field-columns
                          (vals warehouse-schema-overlay/field-ai-columns))
                  (repeat nil))
          ingested)
   local))

(defmethod serdes/make-spec "FieldUserSettings" [_model-name _opts]
  {:copy      [:semantic_type :description :display_name :visibility_type
               :has_field_values :effective_type :coercion_strategy :caveats
               :points_of_interest :nfc_path :json_unfolding :settings :data_sensitivity :custom_position
               :description_set :semantic_type_set :fk_target_field_id_set
               :ai_semantic_type :ai_description :ai_data_sensitivity]
   :defaults  {:description_set        false
               :semantic_type_set      false
               :fk_target_field_id_set false
               :data_sensitivity_set   false}
   :transform {:created_at   (serdes/date)
               ;; An export made before the flag existed has a label and no flag: the label is a person's.
               :data_sensitivity_set {:export              identity
                                      :import-with-context (fn [ingested k v]
                                                             (if (contains? ingested k)
                                                               (boolean v)
                                                               (some? (:data_sensitivity ingested))))}
               :fk_target_field_id (serdes/fk :model/Field)
               :field_id     {::serdes/fk true
                              :export     #(serdes/*export-field-fk* %)
                              :import-with-context (fn [current _ _]
                                                     (serdes/*import-field-fk*
                                                      (serdes/field-path->field-ref (pop (serdes/path current)))))}}})

(defmethod serdes/ingested-path "FieldUserSettings" [_ {:keys [field_id]}]
  (conj (serdes/field->path field_id) {:model "FieldUserSettings" :id "1"}))

(def ^:private field-user-settings-slug "___fieldusersettings")

(defmethod serdes/storage-path "FieldUserSettings" [field-user-settings _ctx]
  (let [field-path (serdes/storage-path-prefixes (pop (serdes/path field-user-settings)))]
    (update field-path (dec (count field-path))
            (fn [segment] (assoc segment :suffix field-user-settings-slug)))))
