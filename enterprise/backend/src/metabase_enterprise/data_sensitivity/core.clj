(ns metabase-enterprise.data-sensitivity.core
  "Public surface of the LLM data-sensitivity classifier. [[classify-table!]] builds the packet, calls the model, and
  diffs the proposal against the current `data_sensitivity` of every field; [[classify-database!]] runs it over the
  active tables of a database. Nothing is written: the result is a proposal the caller renders or evaluates.

  The Metabot group permissions are bypassed for the call because the trigger is gated on database write access
  instead; the instance gates (Metabot enabled, provider configured, usage limits) still apply and are reported by
  [[unavailable-reason]]. Result keys are snake_case because the maps are API responses."
  (:require
   [metabase-enterprise.data-sensitivity.context :as context]
   [metabase-enterprise.data-sensitivity.llm :as llm]
   [metabase.database-routing.core :as database-routing]
   [metabase.metabot.core :as metabot]
   [metabase.request.core :as request]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def required-permission
  "The Metabot permission the structured call declares. Granted by the all-yes binding, so it only labels the call."
  :permission/metabot-other-tools)

;;; Schemas

(mr/def ::usage
  [:map
   [:input_tokens          :int]
   [:output_tokens         :int]
   [:cache_read_tokens     :int]
   [:cache_creation_tokens :int]])

(mr/def ::counts
  [:map
   [:fields           :int]
   [:agree            :int]
   [:disagree         :int]
   [:abstain          :int]
   [:dropped          :int]
   [:semantic_changed :int]])

(mr/def ::field-result
  [:map
   [:field_id          pos-int?]
   [:name              :string]
   [:display_name      [:maybe :string]]
   [:base_type         :keyword]
   [:current           [:map
                        [:data_sensitivity [:maybe :keyword]]
                        [:human_set?       :boolean]
                        [:state            [:enum :human :classifier :unscanned]]
                        [:semantic_type    [:maybe :keyword]]]]
   [:proposed          [:map
                        [:data_sensitivity [:maybe :keyword]]
                        [:confidence       [:maybe :string]]
                        [:semantic_type    [:maybe :keyword]]
                        [:reasoning        [:maybe :string]]]]
   [:status            [:enum :agree :disagree :abstain :dropped]]
   [:semantic_changed? :boolean]])

(mr/def ::table-result
  [:map
   [:table_id     pos-int?]
   [:table_name   :string]
   [:schema       [:maybe :string]]
   [:database_id  pos-int?]
   [:model        :string]
   [:requests     :int]
   [:usage        ::usage]
   [:sample_error [:maybe :string]]
   [:counts       ::counts]
   [:fields       [:sequential ::field-result]]])

(mr/def ::table-error
  [:map
   [:table_id   pos-int?]
   [:table_name :string]
   [:schema     [:maybe :string]]
   [:error      :string]
   [:error_code [:maybe :string]]])

(mr/def ::database-result
  [:map
   [:database_id pos-int?]
   [:schema      [:maybe :string]]
   [:tables      [:sequential [:or ::table-result ::table-error]]]
   [:counts      ::counts]
   [:usage       ::usage]
   [:requests    :int]
   [:failed      :int]])

(mr/def ::table-options
  [:merge
   ::context/options
   [:map
    [:model      {:optional true} [:maybe :string]]
    [:chunk-size {:optional true} [:maybe pos-int?]]]])

(mr/def ::database-options
  [:merge
   ::table-options
   [:map
    [:schema      {:optional true} [:maybe :string]]
    [:parallelism {:optional true} [:maybe pos-int?]]]])

(def ^:private zero-usage
  {:input_tokens 0 :output_tokens 0 :cache_read_tokens 0 :cache_creation_tokens 0})

(def ^:private zero-counts
  {:fields 0 :agree 0 :disagree 0 :abstain 0 :dropped 0 :semantic_changed 0})

;;; Pre-flight

(defn unavailable-reason
  "Why an LLM classification cannot run right now, or nil when it can: `:metabot-disabled`, `:no-llm`, or
  `:usage-limit`. Evaluated under the all-yes permission binding, so `:permission-denied` is not a possible answer."
  []
  (metabot/do-with-all-metabot-permissions
   #(metabot/llm-call-unavailable-reason required-permission)))

;;; Diff

(def ^:private dropped-entry
  {:data-sensitivity nil :confidence nil :semantic-type nil :reasoning nil :status :dropped})

(mu/defn diff-field :- ::field-result
  "Join one packet field to its parsed model entry. `:status` is `:abstain` or `:dropped` when the parse said so,
  `:agree` when the proposal equals the current label, otherwise `:disagree`. `:state` says where the current label
  came from so a nil reads as unscanned rather than blank."
  [{:keys [id name display_name base_type semantic_type current]} :- ::context/field
   entry                                                          :- [:maybe ::llm/entry]]
  (let [{:keys [status] :as entry} (or entry dropped-entry)
        current-label  (:data_sensitivity current)
        human-set?     (:human_set? current)
        proposed-label (:data-sensitivity entry)
        proposed-st    (:semantic-type entry)]
    {:field_id          id
     :name              name
     :display_name      display_name
     :base_type         base_type
     :current           {:data_sensitivity current-label
                         :human_set?       human-set?
                         :state            (cond
                                             human-set?            :human
                                             (some? current-label) :classifier
                                             :else                 :unscanned)
                         :semantic_type    semantic_type}
     :proposed          {:data_sensitivity proposed-label
                         :confidence       (:confidence entry)
                         :semantic_type    proposed-st
                         :reasoning        (:reasoning entry)}
     :status            (case status
                          :abstain :abstain
                          :dropped :dropped
                          :labeled (if (= proposed-label current-label) :agree :disagree))
     :semantic_changed? (boolean (and proposed-st (not= proposed-st semantic_type)))}))

(defn- field-counts [fields]
  (let [by-status (frequencies (map :status fields))]
    {:fields           (count fields)
     :agree            (get by-status :agree 0)
     :disagree         (get by-status :disagree 0)
     :abstain          (get by-status :abstain 0)
     :dropped          (get by-status :dropped 0)
     :semantic_changed (count (filter :semantic_changed? fields))}))

;;; Classify

(mu/defn classify-table! :- ::table-result
  "Classify every active field of `table` and diff the proposal against the current labels. Options are those of
  [[context/table-packet]] plus `:model` and `:chunk-size` for [[llm/classify-packet]]. The row sample runs as
  admin with database routing off; the LLM call runs with all Metabot permissions granted. Writes nothing."
  [table :- (ms/InstanceOf :model/Table)
   & {:as opts} :- [:maybe ::table-options]]
  (let [packet         (request/as-admin
                         (database-routing/with-database-routing-off
                           (context/table-packet table (dissoc opts :model :chunk-size))))
        classification (metabot/do-with-all-metabot-permissions
                        #(llm/classify-packet packet (select-keys opts [:model :chunk-size])))
        fields         (mapv (fn [field]
                               (diff-field field (get-in classification [:fields (:name field)])))
                             (:fields packet))]
    {:table_id     (:id table)
     :table_name   (:name table)
     :schema       (:schema table)
     :database_id  (:db_id table)
     :model        (:model classification)
     :requests     (:requests classification)
     :usage        (:usage classification)
     :sample_error (get-in packet [:sample :error])
     :counts       (field-counts fields)
     :fields       fields}))

(defn- error-code [e]
  (let [{:keys [error-code type]} (ex-data e)]
    (some-> (or error-code type) u/qualified-name)))

(defn- table-error [table e]
  (log/warnf e "Data-sensitivity classification failed for table %d" (:id table))
  {:table_id   (:id table)
   :table_name (:name table)
   :schema     (:schema table)
   :error      (or (ex-message e) (str (class e)))
   :error_code (error-code e)})

(defn- run-batches
  "Apply `f` to every table, `parallelism` at a time, returning one result per table in order. `future` conveys the
  caller's dynamic bindings (current user, request) into each task."
  [tables parallelism f]
  (into []
        (mapcat (fn [batch]
                  (mapv deref (mapv (fn [table] (future (f table))) batch))))
        (partition-all parallelism tables)))

(def default-parallelism
  "Tables classified concurrently by [[classify-database!]]."
  4)

(defn- select-tables [database schema]
  (t2/select :model/Table
             {:where    (cond-> [:and [:= :db_id (:id database)] [:= :active true]]
                          schema (conj [:= :schema schema]))
              :order-by [[:schema :asc] [:name :asc]]}))

(mu/defn classify-database! :- ::database-result
  "Run [[classify-table!]] over every active table of `database`, restricted to `:schema` when given. A table whose
  classification throws becomes an error entry and the run continues. Synchronous; intended for the REPL and small
  databases until an async job exists."
  [database :- (ms/InstanceOf :model/Database)
   & {:keys [schema parallelism] :as opts} :- [:maybe ::database-options]]
  (let [table-opts (dissoc opts :schema :parallelism)
        tables     (select-tables database schema)
        results    (run-batches tables
                                (or parallelism default-parallelism)
                                (fn [table]
                                  (try
                                    (classify-table! table table-opts)
                                    (catch Throwable e
                                      (table-error table e)))))
        succeeded  (remove :error results)]
    {:database_id (:id database)
     :schema      schema
     :tables      results
     :counts      (reduce (partial merge-with +) zero-counts (map :counts succeeded))
     :usage       (reduce (partial merge-with +) zero-usage (map :usage succeeded))
     :requests    (transduce (map :requests) + 0 succeeded)
     :failed      (count (filter :error results))}))
