(ns metabase-enterprise.data-sensitivity.core
  "Public surface of the LLM data-sensitivity classifier. [[classify-table!]] builds the packet, calls the model, and
  diffs the proposal against the current `data_sensitivity` of every field; [[classify-database!]] runs it over the
  active tables of a database. Nothing is written: the result is a proposal the caller renders or evaluates.

  The Metabot group permissions are bypassed for the call because the trigger is gated on database write access
  instead; the instance gates (Metabot enabled, provider configured, usage limits) still apply and are reported by
  [[unavailable-reason]]. Result keys are snake_case because the maps are API responses."
  (:require
   [metabase-enterprise.data-sensitivity.context :as context]
   [metabase-enterprise.data-sensitivity.db :as db]
   [metabase-enterprise.data-sensitivity.llm :as llm]
   [metabase.database-routing.core :as database-routing]
   [metabase.metabot.core :as metabot]
   [metabase.request.core :as request]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms])
  (:import
   (java.util.concurrent Callable Executors Future)))

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
   [:new              :int]
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
                        [:human_set       :boolean]
                        [:state            [:enum :human :classifier :unscanned]]
                        [:semantic_type    [:maybe :keyword]]]]
   [:proposed          [:map
                        [:data_sensitivity [:maybe :keyword]]
                        [:confidence       [:maybe :string]]
                        [:semantic_type    [:maybe :keyword]]
                        [:reasoning        [:maybe :string]]]]
   [:status            [:enum :agree :disagree :new :abstain :dropped]]
   [:semantic_changed :boolean]])

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
  {:fields 0 :agree 0 :disagree 0 :new 0 :abstain 0 :dropped 0 :semantic_changed 0})

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
  `:new` when the field has no current label, `:agree` when the proposal equals the current label, otherwise
  `:disagree`. `:state` says where the current label came from so a nil reads as unscanned rather than blank."
  [{:keys [id name display_name base_type semantic_type current]} :- ::context/field
   entry                                                          :- [:maybe ::llm/entry]]
  (let [{:keys [status] :as entry} (or entry dropped-entry)
        current-label  (:data_sensitivity current)
        human-set?     (:human_set current)
        proposed-label (:data-sensitivity entry)
        proposed-st    (:semantic-type entry)]
    {:field_id          id
     :name              name
     :display_name      display_name
     :base_type         base_type
     :current           {:data_sensitivity current-label
                         :human_set       human-set?
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
                          :labeled (cond
                                     (nil? current-label)               :new
                                     (= proposed-label current-label)   :agree
                                     :else                              :disagree))
     :semantic_changed (boolean (and proposed-st (not= proposed-st semantic_type)))}))

(defn- field-counts [fields]
  (let [by-status (frequencies (map :status fields))]
    {:fields           (count fields)
     :agree            (get by-status :agree 0)
     :disagree         (get by-status :disagree 0)
     :new              (get by-status :new 0)
     :abstain          (get by-status :abstain 0)
     :dropped          (get by-status :dropped 0)
     :semantic_changed (count (filter :semantic_changed fields))}))

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

(def ^:private fatal-statuses
  "Provider statuses that retries never cover and that every later table would hit the same way."
  #{400 401 402 403})

(defn fatal-error?
  "Whether an exception from one table's classification would fail every other table the same way: a provider
  rejection with a non-retryable status, a missing provider connection or key, or the usage limit."
  [e]
  (let [{:keys [api-error status status-code error-code type]} (ex-data e)]
    (boolean (or (and api-error (contains? fatal-statuses (or status status-code)))
                 (contains? #{:llm-not-configured :api-key-missing} error-code)
                 (= :metabot/usage-limit-reached type)))))

(defn- table-error [table e]
  (let [{:keys [api-error provider status]} (ex-data e)]
    (if api-error
      (log/warnf "Data-sensitivity classification failed for table %d: %s provider=%s status=%s"
                 (:id table) (ex-message e) provider status)
      (log/warnf e "Data-sensitivity classification failed for table %d" (:id table))))
  {:table_id   (:id table)
   :table_name (:name table)
   :schema     (:schema table)
   :error      (or (ex-message e) (str (class e)))
   :error_code (error-code e)})

(defn- skipped-entry [table {failed-name :table_name failed-error :error}]
  {:table_id   (:id table)
   :table_name (:name table)
   :schema     (:schema table)
   :error      (str (tru "Skipped after table {0} failed: {1}" failed-name failed-error))
   :error_code "skipped"})

(defn- run-pool
  "Apply `f` to every table with at most `parallelism` in flight, returning one outcome per table in input order. A
  table starts as soon as a worker is free. `f` returns `{:entry result}` or `{:entry error-entry :fatal? bool
  :exception e}`; once an outcome is fatal no further table starts and the rest get a skipped entry naming that
  failure. Workers run under the caller's dynamic bindings (current user, request)."
  [tables parallelism f]
  (let [executor (Executors/newFixedThreadPool parallelism)
        fatal    (atom nil)
        task     (fn [table]
                   (bound-fn*
                    (fn []
                      (if-let [{failed :entry} @fatal]
                        {:entry (skipped-entry table failed) :skipped? true}
                        (let [outcome (f table)]
                          (when (:fatal? outcome)
                            (compare-and-set! fatal nil outcome))
                          outcome)))))]
    (try
      (let [futures  (mapv (fn [table] (.submit executor ^Callable (task table))) tables)
            outcomes (mapv (fn [^Future fut] (.get fut)) futures)
            skipped  (count (filter :skipped? outcomes))]
        (when (pos? skipped)
          (let [{failed :entry} @fatal]
            (log/warnf "Skipped %d tables after table %d failed: %s" skipped (:table_id failed) (:error failed))))
        outcomes)
      (finally
        (.shutdownNow executor)))))

(def default-parallelism
  "Tables classified concurrently by [[classify-database!]]."
  4)

(mu/defn classify-database! :- ::database-result
  "Run [[classify-table!]] over every active table of `database`, restricted to `:schema` when given. A table whose
  classification throws becomes an error entry and the run continues, unless the failure is one every later table
  would repeat ([[fatal-error?]]): then no further table starts, the remaining tables are reported as skipped, and
  when no table succeeded at all the fatal exception is rethrown. `parallelism` tables are in flight at a time. Synchronous; intended for the REPL and small
  databases until an async job exists."
  [database :- (ms/InstanceOf :model/Database)
   & {:keys [schema parallelism] :as opts} :- [:maybe ::database-options]]
  (let [table-opts (dissoc opts :schema :parallelism)
        tables     (db/active-tables (:id database) schema)
        outcomes   (run-pool tables
                             (or parallelism default-parallelism)
                             (fn [table]
                               (try
                                 {:entry (classify-table! table table-opts)}
                                 (catch Throwable e
                                   {:entry     (table-error table e)
                                    :fatal?    (fatal-error? e)
                                    :exception e}))))
        results    (mapv :entry outcomes)
        succeeded  (remove :error results)]
    (when (and (seq results) (empty? succeeded))
      (when-let [fatal (some #(when (:fatal? %) %) outcomes)]
        (throw (:exception fatal))))
    {:database_id (:id database)
     :schema      schema
     :tables      results
     :counts      (reduce (partial merge-with +) zero-counts (map :counts succeeded))
     :usage       (reduce (partial merge-with +) zero-usage (map :usage succeeded))
     :requests    (transduce (map :requests) + 0 succeeded)
     :failed      (count (filter :error results))}))
