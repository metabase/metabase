(ns metabase-enterprise.data-sensitivity.context
  "Builds the per-table packet the LLM data-sensitivity classifier consumes: app-DB metadata for every active field
  of a table plus, when `:include-values?` is true, cached FieldValues and a small warehouse row sample. The row
  sample is the only warehouse query; a failure there is recorded under `[:sample :error]` and the packet still
  builds so a broken connection degrades to schema-only classification."
  (:require
   [clojure.string :as str]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.models.field :as field]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def default-options
  "Defaults for [[table-packet]] options."
  {:include-values?   true
   :sample-rows       10
   :truncation        120
   :sample-values-cap 8
   :cached-values-cap 15})

(mr/def ::options
  [:map
   [:include-values?   {:optional true} [:maybe :boolean]]
   [:sample-rows       {:optional true} [:maybe pos-int?]]
   [:truncation        {:optional true} [:maybe pos-int?]]
   [:sample-values-cap {:optional true} [:maybe pos-int?]]
   [:cached-values-cap {:optional true} [:maybe pos-int?]]])

(mr/def ::field
  [:map
   [:id              pos-int?]
   [:name            :string]
   [:display_name    [:maybe :string]]
   [:description     [:maybe :string]]
   [:base_type       :keyword]
   [:database_type   [:maybe :string]]
   [:semantic_type   [:maybe :keyword]]
   [:position        [:maybe :int]]
   [:visibility_type [:maybe :keyword]]
   [:fk_target       [:maybe :string]]
   [:fingerprint     [:maybe :map]]
   [:human_set       [:set :keyword]]
   [:current         [:map
                      [:data_sensitivity [:maybe :keyword]]
                      [:human_set?       :boolean]]]
   [:cached_values   [:maybe [:sequential :string]]]
   [:sample_values   [:maybe [:sequential :string]]]])

(mr/def ::packet
  [:map
   [:table  [:map
             [:id           pos-int?]
             [:name         :string]
             [:schema       [:maybe :string]]
             [:display_name [:maybe :string]]
             [:description  [:maybe :string]]
             [:entity_type  [:maybe :keyword]]
             [:db_id        pos-int?]
             [:engine       [:maybe :keyword]]]]
   [:fields [:sequential ::field]]
   [:sample [:map
             [:rows       :int]
             [:truncation :int]
             [:error      [:maybe :string]]]]])

(defn- select-fields [table-id]
  (t2/select :model/Field
             {:where    [:and
                         [:= :table_id table-id]
                         [:= :active true]
                         [:not= :visibility_type "retired"]]
              :order-by [[:position :asc] [:id :asc]]}))

(defn- user-settings-by-field [field-ids]
  (when (seq field-ids)
    (into {} (map (juxt :field_id identity)) (t2/select :model/FieldUserSettings :field_id [:in field-ids]))))

(defn- human-set-keys [user-settings]
  (into #{} (filter #(some? (get user-settings %))) field/field-user-settings))

(defn- fk-targets
  "Map of target field id -> `schema.table.field` for every `fk_target_field_id` among `fields`."
  [fields]
  (let [target-ids (into #{} (keep :fk_target_field_id) fields)]
    (when (seq target-ids)
      (let [targets (t2/select [:model/Field :id :name :table_id] :id [:in target-ids])
            tables  (into {} (map (juxt :id identity))
                          (t2/select [:model/Table :id :name :schema] :id [:in (into #{} (map :table_id) targets)]))]
        (into {} (map (fn [{:keys [id name table_id]}]
                        (let [{table-name :name schema :schema} (get tables table_id)]
                          [id (str/join "." (remove nil? [schema table-name name]))])))
              targets)))))

(defn- round2 [x]
  (cond
    (nil? x)     nil
    (integer? x) x
    :else        (/ (Math/round (* 100.0 (double x))) 100.0)))

(defn- fingerprint-summary
  "The subset of a Field fingerprint worth showing the model, percentages rounded to two decimals so the prompt is
  stable across fingerprint refreshes."
  [{:keys [global type] :as fingerprint}]
  (when fingerprint
    (let [text     (get type :type/Text)
          number   (get type :type/Number)
          temporal (get type :type/DateTime)]
      (not-empty
       (cond-> {}
         (some? (:distinct-count global)) (assoc :distinct_count (:distinct-count global))
         (some? (:nil% global))           (assoc :nil_pct (round2 (:nil% global)))
         (seq text)     (assoc :text (update-vals (select-keys text [:percent-json :percent-url :percent-email
                                                                     :percent-state :average-length])
                                                  round2))
         (seq number)   (assoc :number (update-vals (select-keys number [:min :max :avg]) round2))
         (seq temporal) (assoc :temporal (select-keys temporal [:earliest :latest])))))))

(defn- distinct-strings [cap truncation values]
  (into [] (comp (remove nil?)
                 (map str)
                 (map (fn [^String s] (if (> (.length s) truncation) (subs s 0 truncation) s)))
                 (distinct)
                 (take cap))
        values))

(defn- cached-values
  "Map of field id -> up to `cap` distinct cached FieldValues rendered as strings."
  [field-ids cap truncation]
  (into {} (keep (fn [[field-id {:keys [values]}]]
                   (when (seq values)
                     [field-id (distinct-strings cap truncation values)])))
        (field-values/batched-get-latest-full-field-values field-ids)))

(defn- conj-rff [_metadata]
  (fn
    ([] [])
    ([acc] acc)
    ([acc row] (conj acc row))))

(defn- sample-values
  "Runs the row sample and transposes it into a map of field id -> up to `sample-values-cap` distinct values as
  strings. Returns `{:values {...} :error nil}`, or `{:values nil :error message}` when the query fails."
  [database table fields {:keys [sample-rows truncation sample-values-cap]}]
  (try
    (let [driver  (driver.u/database->driver database)
          rows    (driver/table-rows-sample driver table fields conj-rff
                                            {:limit sample-rows :truncation-size truncation})
          columns (if (seq rows)
                    (apply map vector rows)
                    (repeat (count fields) []))]
      {:values (into {} (map (fn [field column]
                               [(:id field) (distinct-strings sample-values-cap truncation column)])
                             fields
                             columns))
       :error  nil})
    (catch Exception e
      (log/warnf e "Failed to sample rows for table %d" (:id table))
      {:values nil :error (ex-message e)})))

(defn- field-entry
  "Non-nil user-settings values are overlaid on the Field row, as `sync-user-settings` does on every Field update, so
  a human's choice is reported even when the row has not been rewritten since it was made."
  [{:keys [id] :as field} {:keys [user-settings fk-targets cached sampled]}]
  (let [settings  (get user-settings id)
        human-set (human-set-keys settings)
        field     (merge field (u/select-keys-when settings :non-nil field/field-user-settings))]
    {:id              id
     :name            (:name field)
     :display_name    (:display_name field)
     :description     (:description field)
     :base_type       (:base_type field)
     :database_type   (:database_type field)
     :semantic_type   (:semantic_type field)
     :position        (:position field)
     :visibility_type (:visibility_type field)
     :fk_target       (some->> (:fk_target_field_id field) (get fk-targets))
     :fingerprint     (fingerprint-summary (:fingerprint field))
     :human_set       human-set
     :current         {:data_sensitivity (:data_sensitivity field)
                       :human_set?       (contains? human-set :data_sensitivity)}
     :cached_values   (get cached id)
     :sample_values   (get sampled id)}))

(mu/defn table-packet :- ::packet
  "Build the classification packet for `table`. Hidden and sensitive fields are included; retired and inactive
  fields are not. The row sample runs through the query processor, so callers that act on behalf of a user should
  wrap this in `request/as-admin` and `database-routing/with-database-routing-off`."
  [table :- (ms/InstanceOf :model/Table)
   & {:as opts} :- [:maybe ::options]]
  (let [{:keys [include-values? sample-rows truncation cached-values-cap] :as opts}
        (merge default-options opts)

        database  (t2/select-one :model/Database :id (:db_id table))
        fields    (select-fields (:id table))
        field-ids (map :id fields)
        cached    (when include-values?
                    (cached-values field-ids cached-values-cap truncation))
        {sampled :values sample-error :error} (when include-values?
                                                (sample-values database table fields opts))
        ctx       {:user-settings (user-settings-by-field field-ids)
                   :fk-targets    (fk-targets fields)
                   :cached        cached
                   :sampled       sampled}]
    {:table  {:id           (:id table)
              :name         (:name table)
              :schema       (:schema table)
              :display_name (:display_name table)
              :description  (:description table)
              :entity_type  (:entity_type table)
              :db_id        (:db_id table)
              :engine       (:engine database)}
     :fields (mapv #(field-entry % ctx) fields)
     :sample {:rows       (if include-values? sample-rows 0)
              :truncation truncation
              :error      sample-error}}))
