(ns metabase.warehouse-schema.models.field-user-settings
  (:require
   [medley.core :as m]
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
   [toucan2.core :as t2]
   [toucan2.pipeline :as t2.pipeline]
   [toucan2.tools.before-update :as t2.before-update]))

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
  "Delete `settings` when it holds no user value, no AI value and no true flag, returning it either way."
  [settings]
  (when (and (every? #(nil? (get settings %)) (concat user-settings/user-settable-field-columns
                                                      (vals user-settings/field-ai-columns)))
             (not-any? #(get settings %) (vals user-settings/field-set-flags)))
    (warehouse-schema.db/delete-field-user-settings! [(:field_id settings)]))
  settings)

(t2/define-before-insert :model/FieldUserSettings
  [settings]
  (with-set-flags settings settings))

(t2/define-after-insert :model/FieldUserSettings
  [settings]
  (delete-when-empty! settings))

(methodical/defmethod t2.pipeline/transduce-query :around [:toucan.query-type/update.* :model/FieldUserSettings :default]
  "Set the `_set` flags from the changes as the caller gives them. A before-update hook sees only `t2/changes`, which
  drops a flag the caller sets to its current value. The UPDATE that Toucan runs after its before-update hooks has only
  those changes, so it keeps them as they are."
  [rf query-type model parsed-args resolved-query]
  (next-method rf query-type model
               (cond-> parsed-args
                 (not (::t2.before-update/doing-before-update? parsed-args))
                 (update :changes #(some-> % (with-set-flags %))))
               resolved-query))

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
  "Drop the user values of the Field columns `ks` for `field` from its settings. A column with an accepted AI value
  gets that value in its row; the row keeps the other columns as they are for sync to take over."
  [{:keys [id]} :- ::warehouse-schema.schema/field
   ks           :- [:sequential (into [:enum] user-settings/user-settable-field-columns)]]
  (when-let [settings (warehouse-schema.db/field-user-settings id)]
    (t2/with-transaction [_conn]
      (warehouse-schema.db/update-field-user-settings!
       id
       (into {} (mapcat (fn [k]
                          (cond-> [[k nil]]
                            (user-settings/field-set-flags k) (conj [(user-settings/field-set-flags k) false]))))
             ks))
      (let [ai-values (into {}
                            (keep (fn [k]
                                    (when-let [v (some->> (user-settings/field-ai-columns k) (get settings))]
                                      [k v])))
                            ks)]
        (when (seq ai-values)
          (warehouse-schema.db/update-field! id ai-values))))))

(mu/defn reset-field-user-settings!
  "[[unset-field-user-settings!]] for the columns `ks` of `field`, and NULL in its row for each of `ks` with no
  accepted AI value. The data-sensitivity scan labels only Fields without a label, so this gives it the Field again."
  [{:keys [id] :as field} :- ::warehouse-schema.schema/field
   ks                     :- [:sequential (into [:enum] user-settings/user-settable-field-columns)]]
  (t2/with-transaction [_conn]
    (unset-field-user-settings! field ks)
    (when-let [automatic (seq (remove (user-settings/ai-set-field-columns (warehouse-schema.db/field-user-settings id))
                                      ks))]
      (warehouse-schema.db/update-field! id (zipmap automatic (repeat nil))))))

(mu/defn delete-field-user-settings!
  "Delete the settings of the Fields with `field-ids`, leaving their rows as they are for sync to take over."
  [field-ids :- [:sequential ::lib.schema.id/field]]
  (doseq [batch (partition-all 1000 field-ids)]
    (warehouse-schema.db/delete-field-user-settings! batch)))

(def ^:private AIValues
  [:map {:closed true}
   [:semantic_type    {:optional true} [:maybe [:or :keyword :string]]]
   [:description      {:optional true} [:maybe :string]]
   [:data_sensitivity {:optional true} [:maybe [:or :keyword :string]]]])

(defn- ai-columns
  "`values`, keyed by the user-settable column, keyed by the column that holds its AI value instead."
  [values]
  (update-keys values user-settings/field-ai-columns))

(mu/defn set-ai-values-for-fields!
  "Record each map of `field-id->values` as the accepted AI values of its Field, in its settings, and in its row for
  the columns no user set. A nil value clears the AI value and leaves the row as it is for sync to take over. The
  human values and their flags stay as they are."
  [field-id->values :- [:map-of ::lib.schema.id/field AIValues]]
  (let [field-id->values (into {} (remove (comp empty? val)) field-id->values)]
    (when (seq field-id->values)
      (t2/with-transaction [_conn]
        (let [settings (m/index-by :field_id (warehouse-schema.db/field-user-settings-for-fields
                                              (vec (keys field-id->values))))
              inserts  (into []
                             (keep (fn [[id values]]
                                     (when (and (not (settings id)) (some some? (vals values)))
                                       (assoc (ai-columns values) :field_id id))))
                             field-id->values)]
          (when (seq inserts)
            (warehouse-schema.db/insert-field-user-settings! inserts))
          (doseq [[id values] field-id->values
                  :let [user-set (user-settings/user-set-field-columns (settings id))
                        row      (into {} (filter (fn [[k v]] (and (some? v) (not (user-set k))))) values)]]
            (when (settings id)
              (warehouse-schema.db/update-field-user-settings! id (ai-columns values)))
            (when (seq row)
              (warehouse-schema.db/update-field! id row))))))))

(mu/defn set-ai-values!
  "Record `values` as the accepted AI values of `field`; see [[set-ai-values-for-fields!]]."
  [{:keys [id]} :- ::warehouse-schema.schema/field
   values       :- AIValues]
  (set-ai-values-for-fields! {id values}))

(mu/defn unset-ai-values!
  "Drop the accepted AI values of the Field columns `ks` for `field`."
  [field :- ::warehouse-schema.schema/field
   ks    :- [:sequential (into [:enum] (keys user-settings/field-ai-columns))]]
  (set-ai-values! field (zipmap ks (repeat nil))))

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
               :description_set :semantic_type_set :fk_target_field_id_set :data_sensitivity_set
               :ai_semantic_type :ai_description :ai_data_sensitivity]
   :skip      [:nfc_path]
   :defaults  {:description_set        false
               :semantic_type_set      false
               :fk_target_field_id_set false
               :data_sensitivity_set   false}
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
            local (update :row #(merge (zipmap (concat user-settings/user-settable-field-columns
                                                       (vals user-settings/field-ai-columns))
                                               (repeat nil))
                                       %))))
        items))

(defmethod serialization/after-load :model/FieldUserSettings [_ items]
  (doseq [{{:keys [field_id] :as settings} :instance} items]
    (let [user-set  (user-settings/user-set-field-columns settings)
          ai-values (into {}
                          (map (fn [k] [k (get settings (user-settings/field-ai-columns k))]))
                          (user-settings/ai-set-field-columns settings))]
      (warehouse-schema.db/update-field! field_id (merge ai-values (select-keys settings user-set))))))

(defmethod remote-sync/spec :model/FieldUserSettings
  [_model]
  {:parent               (fn [{:keys [field_id]}]
                           (some->> (warehouse-schema.db/field field_id) :table_id (vector :model/TableUserSettings)))
   :synced-filter-clause warehouse-schema.db/synced-field-user-settings-clause})
