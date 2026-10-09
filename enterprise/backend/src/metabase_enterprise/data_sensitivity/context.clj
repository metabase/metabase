(ns metabase-enterprise.data-sensitivity.context
  "Builds the per-table packet the LLM data-sensitivity classifier consumes: app-DB metadata for every active field
  of a table plus, when `:include-values?` is true, cached FieldValues and a small warehouse row sample. The row
  sample is the only warehouse query; a failure there is recorded under `[:sample :error]` and the packet still
  builds so a broken connection degrades to schema-only classification. A cancel during the sample throws an
  `InterruptedException` instead. Values are read only when the current user
  may see all rows of the table (see [[values-restriction]]); otherwise the packet is schema-only and
  `[:sample :error]` says why."
  (:require
   [clojure.core.async :as a]
   [clojure.string :as str]
   [metabase-enterprise.data-sensitivity.db :as db]
   [metabase.api.common :as api]
   [metabase.database-routing.core :as database-routing]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [metabase.warehouse-schema.models.field :as field]
   [metabase.warehouse-schema.models.field-values :as field-values]))

(set! *warn-on-reflection* true)

(def default-options
  "Defaults for [[table-packet]] options."
  {:include-values?   true
   :sample-rows       10
   :truncation        500
   :sample-values-cap 8
   :cached-values-cap 15})

(mr/def ::options
  [:map {:closed true}
   [:include-values?   {:optional true} [:maybe :boolean]]
   [:sample-rows       {:optional true} [:maybe pos-int?]]
   [:truncation        {:optional true} [:maybe pos-int?]]
   [:sample-values-cap {:optional true} [:maybe pos-int?]]
   [:cached-values-cap {:optional true} [:maybe pos-int?]]])

(mr/def ::fingerprint
  [:map {:closed true}
   [:distinct_count {:optional true} :int]
   [:nil_pct        {:optional true} number?]
   [:text           {:optional true} [:map {:closed true}
                                      [:percent-json   {:optional true} [:maybe number?]]
                                      [:percent-url    {:optional true} [:maybe number?]]
                                      [:percent-email  {:optional true} [:maybe number?]]
                                      [:percent-state  {:optional true} [:maybe number?]]
                                      [:average-length {:optional true} [:maybe number?]]]]
   [:number         {:optional true} [:map {:closed true}
                                      [:min {:optional true} [:maybe number?]]
                                      [:max {:optional true} [:maybe number?]]
                                      [:avg {:optional true} [:maybe number?]]]]
   [:temporal       {:optional true} [:map {:closed true}
                                      [:earliest {:optional true} [:maybe :string]]
                                      [:latest   {:optional true} [:maybe :string]]]]])

(mr/def ::field
  [:map {:closed true}
   [:id              pos-int?]
   [:name            :string]
   [:display_name    [:maybe :string]]
   [:description     [:maybe :string]]
   [:base_type       :keyword]
   [:effective_type  {:optional true} [:maybe :keyword]]
   [:database_type   [:maybe :string]]
   [:semantic_type   [:maybe :keyword]]
   [:position        [:maybe :int]]
   [:visibility_type [:maybe :keyword]]
   [:fk_target       [:maybe :string]]
   [:fingerprint     [:maybe ::fingerprint]]
   [:human_set       [:set :keyword]]
   [:ai_set          {:optional true} [:set :keyword]]
   [:current         [:map {:closed true}
                      [:data_sensitivity [:maybe :keyword]]
                      [:human_set       :boolean]]]
   [:cached_values   [:maybe [:sequential :string]]]
   [:sample_values   [:maybe [:sequential :string]]]])

(mr/def ::packet
  [:map {:closed true}
   [:table  [:map {:closed true}
             [:id           pos-int?]
             [:name         :string]
             [:schema       [:maybe :string]]
             [:display_name [:maybe :string]]
             [:description  [:maybe :string]]
             [:entity_type  [:maybe :keyword]]
             [:db_id        pos-int?]
             [:engine       [:maybe :keyword]]]]
   [:fields [:sequential ::field]]
   [:sample [:map {:closed true}
             [:rows       :int]
             [:truncation :int]
             [:error      [:maybe :string]]]]])

(defn- human-set?
  "Whether a person set column `k` in `user-settings`. A column sync also writes has a `<col>_set` flag, which is true
  for a cleared value too; any other column is set when its value is not nil. The same rule as
  [[warehouse-schema-overlay/field-query]]."
  [user-settings k]
  (if-let [flag (warehouse-schema-overlay/field-user-settings-flags k)]
    (true? (get user-settings flag))
    (some? (get user-settings k))))

(defn- human-set-keys [user-settings]
  (into #{} (filter #(human-set? user-settings %)) field/field-user-settings))

(defn- ai-set-keys
  "The columns whose readers see the accepted AI value in `user-settings`: an AI value is present and no person set the
  column."
  [user-settings human-set]
  (into #{}
        (keep (fn [[k ai-column]]
                (when (and (some? (get user-settings ai-column)) (not (contains? human-set k)))
                  k)))
        warehouse-schema-overlay/field-ai-columns))

(defn value-source
  "The layer that gives the value readers see for column `k` of a field with `user-settings`, when that value is
  `current-value`: `:human`, `:ai`, `:deterministic`, or `:none` when there is no value. The same rule as
  [[warehouse-schema-overlay/field-query]]."
  [user-settings k current-value]
  (let [human-set (human-set-keys user-settings)]
    (cond
      (contains? human-set k)                            :human
      (contains? (ai-set-keys user-settings human-set) k) :ai
      (some? current-value)                              :deterministic
      :else                                              :none)))

(defn- fk-targets
  "Map of target field id -> `schema.table.field` for every `fk_target_field_id` among `fields`."
  [fields]
  (let [target-ids (into #{} (keep :fk_target_field_id) fields)]
    (when (seq target-ids)
      (let [targets (db/field-names-and-tables target-ids)
            tables  (db/tables-by-id (into #{} (map :table_id) targets))]
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
        (field-values/batched-latest-full-field-values field-ids)))

(defn- conj-rff [_metadata]
  (fn
    ([] [])
    ([acc] acc)
    ([acc row] (conj acc row))))

(defn interrupted?
  "Whether an `InterruptedException` is `e` or in its cause chain. Throwing it clears the interrupt flag of the thread,
  so this is the only trace of the interrupt that caught it."
  [^Throwable e]
  (boolean (some #(instance? InterruptedException %) (take-while some? (iterate ex-cause e)))))

(defn- run-sample
  "Run the row sample with a cancel channel of its own, which the query processor uses instead of a new one. Returns
  `{:rows rows}` or `{:exception e}`. Throws an `InterruptedException`, with the interrupt flag set again, when the
  sample was cancelled: the query processor put `::qp.pipeline/cancel` on the channel, an `InterruptedException` is in
  the cause chain, or the query processor returned nil. The query processor catches an interrupt of the query, clears
  the flag, and returns nil, so the channel is the reliable signal."
  [database table fields {:keys [sample-rows truncation]}]
  (let [canceled (a/promise-chan)
        result   (try
                   {:rows (binding [qp.pipeline/*canceled-chan* canceled]
                            (driver/table-rows-sample (driver.u/database->driver database) table fields conj-rff
                                                      {:limit sample-rows :truncation-size truncation}))}
                   (catch Exception e
                     {:exception e}))]
    (when (or (= ::qp.pipeline/cancel (a/poll! canceled))
              (some-> (:exception result) interrupted?)
              (and (not (:exception result)) (nil? (:rows result))))
      (.interrupt (Thread/currentThread))
      (throw (InterruptedException. (format "Row sample for table %d interrupted" (:id table)))))
    result))

(defn- sample-values
  "Runs the row sample and transposes it into a map of field id -> up to `sample-values-cap` distinct values as
  strings. Returns `{:values {...} :error nil}`, or `{:values nil :error message}` when the query fails. Throws an
  `InterruptedException` when the sample was cancelled; see [[run-sample]]."
  [database table fields {:keys [truncation sample-values-cap] :as opts}]
  (let [{:keys [rows exception]} (run-sample database table fields opts)]
    (if exception
      (do (log/warnf exception "Failed to sample rows for table %d" (:id table))
          {:values nil :error (ex-message exception)})
      (let [columns (if (seq rows)
                      (apply map vector rows)
                      (repeat (count fields) []))]
        {:values (into {} (map (fn [field column]
                                 [(:id field) (distinct-strings sample-values-cap truncation column)])
                               fields
                               columns))
         :error  nil}))))

(defn- values-restriction
  "Why the current user may not send the values of `table` to the model, or nil when they may. A superuser may. Other
  users may only when they can query the table (the check of `GET /api/field/:id/values`), no sandbox applies to the
  table, no connection impersonation applies to the database, and the database uses no database routing. A
  sandbox, an impersonation role, or a routing destination shows only part of the data, and the labels apply to all
  of it, so such tables are classified on metadata alone. Fails closed when no user is bound."
  [database table]
  (cond
    api/*is-superuser?*
    nil

    (not (mi/can-query? table))
    "the current user cannot query this table"

    (some #(= (:id table) (:table_id %)) (perms/sandboxes-for-user))
    "a sandbox applies to this table for the current user"

    (perms/impersonation-enforced-for-db? database)
    "connection impersonation applies to this database for the current user"

    (database-routing/db-routing-enabled? database)
    "this database uses database routing"))

(defn- field-entry
  "The packet entry for `field`, with the user-settings values a person set taking precedence over the Field row, a
  cleared value included. `:human_set` names the columns a user has set, `:ai_set` the columns that show an accepted AI
  value."
  [{:keys [id] :as field} {:keys [user-settings fk-targets cached sampled]}]
  (let [settings  (get user-settings id)
        human-set (human-set-keys settings)
        field     (merge field (select-keys settings human-set))]
    {:id              id
     :name            (:name field)
     :display_name    (:display_name field)
     :description     (:description field)
     :base_type       (:base_type field)
     :effective_type  (:effective_type field)
     :database_type   (:database_type field)
     :semantic_type   (:semantic_type field)
     :position        (:position field)
     :visibility_type (:visibility_type field)
     :fk_target       (some->> (:fk_target_field_id field) (get fk-targets))
     :fingerprint     (fingerprint-summary (:fingerprint field))
     :human_set       human-set
     :ai_set          (ai-set-keys settings human-set)
     :current         {:data_sensitivity (:data_sensitivity field)
                       :human_set       (contains? human-set :data_sensitivity)}
     :cached_values   (get cached id)
     :sample_values   (get sampled id)}))

(defn with-defaults
  "`opts` over [[default-options]]. A nil option takes its default."
  [opts]
  (merge default-options (u/remove-nils opts)))

(mu/defn table-packet :- ::packet
  "Build the classification packet for `table` of `database`. Hidden and sensitive fields are included; retired and
  inactive fields are not. Values are read as the current user: when [[values-restriction]] gives a reason, no
  values are read and `[:sample :error]` carries it. The row sample runs through the query processor with the
  permissions of the current user. A superuser on a routed database samples the router database only inside
  `database-routing/with-database-routing-off`."
  [database :- (ms/InstanceOf :model/Database)
   table    :- (ms/InstanceOf :model/Table)
   & {:as opts} :- [:maybe ::options]]
  (let [{:keys [include-values? sample-rows truncation cached-values-cap] :as opts}
        (with-defaults opts)

        restriction     (when include-values?
                          (values-restriction database table))
        include-values? (and include-values? (nil? restriction))
        fields    (db/active-fields (:id table))
        field-ids (map :id fields)
        cached    (when include-values?
                    (cached-values field-ids cached-values-cap truncation))
        {sampled :values sample-error :error} (when include-values?
                                                (sample-values database table fields opts))
        ctx       {:user-settings (db/user-settings-by-field field-ids)
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
              :error      (or restriction sample-error)}}))
