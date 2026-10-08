(ns metabase-enterprise.data-sensitivity.core
  "Public surface of the LLM data-sensitivity classifier. [[classify-table!]] builds the packet, calls the model, and
  diffs the proposal against the current `data_sensitivity` of every field; [[classify-database!]] runs it over the
  active tables of a database, one table after another. A table that fails becomes an error entry and the run
  continues. The result is a proposal the caller renders or evaluates. A dry run is the default and writes nothing.
  A commit classifies again and writes the labels of that run; it does not apply an earlier dry run. The model output
  can change between runs, even at temperature 0, so committed labels can differ from what a dry run showed.

  The Metabot group permissions are bypassed for the call because the trigger is gated on database write access
  instead; the instance gates (Metabot enabled, provider configured, usage limits) still apply and are reported by
  [[unavailable-reason]]. Result keys are snake_case because the maps are API responses."
  (:require
   [metabase-enterprise.data-sensitivity.context :as context]
   [metabase-enterprise.data-sensitivity.db :as db]
   [metabase-enterprise.data-sensitivity.llm :as llm]
   [metabase.database-routing.core :as database-routing]
   [metabase.driver.settings :as driver.settings]
   [metabase.driver.util :as driver.u]
   [metabase.metabot.core :as metabot]
   [metabase.request.core :as request]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

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
   [:cache_creation_tokens :int]
   [:total_tokens          :int]])

(mr/def ::counts
  [:map
   [:fields           :int]
   [:agree            :int]
   [:disagree         :int]
   [:new              :int]
   [:abstain          :int]
   [:dropped          :int]
   [:semantic_changed :int]
   [:committed        :int]])

(mr/def ::parse-counts
  "Model output the parse discarded: entries naming a field the table does not have, fields with an invalid
  category or no entry at all, and invalid semantic types."
  [:map
   [:dropped_unknown  :int]
   [:dropped_invalid  :int]
   [:dropped_missing  :int]
   [:semantic_dropped :int]])

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
   [:semantic_changed :boolean]
   [:committed        :boolean]])

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
   [:parse_counts ::parse-counts]
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
   [:database_id  pos-int?]
   [:schema       [:maybe :string]]
   [:sample_error [:maybe :string]]
   [:tables       [:sequential [:or ::table-result ::table-error]]]
   [:counts       ::counts]
   [:parse_counts ::parse-counts]
   [:usage        ::usage]
   [:requests     :int]
   [:failed       :int]])

(mr/def ::table-options
  [:merge
   ::context/options
   [:map {:closed true}
    [:model      {:optional true} [:maybe :string]]
    [:chunk-size {:optional true} [:maybe pos-int?]]
    [:commit?    {:optional true} [:maybe :boolean]]]])

(mr/def ::database-options
  [:merge
   ::table-options
   [:map {:closed true}
    [:schema {:optional true} [:maybe :string]]]])

(def ^:private zero-usage
  {:input_tokens 0 :output_tokens 0 :cache_read_tokens 0 :cache_creation_tokens 0 :total_tokens 0})

(def ^:private zero-counts
  {:fields 0 :agree 0 :disagree 0 :new 0 :abstain 0 :dropped 0 :semantic_changed 0 :committed 0})

(def ^:private zero-parse-counts
  {:dropped_unknown 0 :dropped_invalid 0 :dropped_missing 0 :semantic_dropped 0})

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
  `:disagree`. `:state` says where the current label came from so a nil reads as unscanned rather than blank.
  `[:proposed :semantic_type]` is the effective type: the model's proposal when it made one, else the current type,
  so nil means the field has none and none was proposed; `:semantic_changed` says whether they differ."
  [{:keys [id name display_name base_type semantic_type current]} :- ::context/field
   entry                                                          :- [:maybe ::llm/entry]]
  (let [{:keys [status] :as entry} (or entry dropped-entry)
        current-label  (:data_sensitivity current)
        human-set?     (:human_set current)
        proposed-label (:data-sensitivity entry)
        proposed-st    (:semantic-type entry)
        effective-st   (or proposed-st semantic_type)]
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
                         :semantic_type    effective-st
                         :reasoning        (:reasoning entry)}
     :status            (case status
                          :abstain :abstain
                          :dropped :dropped
                          :labeled (cond
                                     (nil? current-label)               :new
                                     (= proposed-label current-label)   :agree
                                     :else                              :disagree))
     :semantic_changed (boolean (and proposed-st (not= proposed-st semantic_type)))
     :committed        false}))

(defn- field-counts [fields]
  (let [by-status (frequencies (map :status fields))]
    {:fields           (count fields)
     :agree            (get by-status :agree 0)
     :disagree         (get by-status :disagree 0)
     :new              (get by-status :new 0)
     :abstain          (get by-status :abstain 0)
     :dropped          (get by-status :dropped 0)
     :semantic_changed (count (filter :semantic_changed fields))
     :committed        (count (filter :committed fields))}))

(defn- parse-counts [{:keys [dropped-unknown dropped-invalid dropped-missing semantic-dropped]}]
  {:dropped_unknown  dropped-unknown
   :dropped_invalid  dropped-invalid
   :dropped_missing  dropped-missing
   :semantic_dropped semantic-dropped})

;;; Commit

(defn- committable?
  "Whether committing writes the field's proposal: a label that is new or differs from the current one, which no
  human set."
  [{:keys [status current]}]
  (and (contains? #{:new :disagree} status)
       (not (:human_set current))))

(defn- commit-fields!
  "Write the proposed label of every [[committable?]] field of one table in one transaction, and mark those fields
  `:committed`."
  [table fields]
  (let [committed (filter committable? fields)]
    (when (seq committed)
      (db/commit-labels! (update-vals (group-by #(get-in % [:proposed :data_sensitivity]) committed)
                                      #(mapv :field_id %)))
      (log/infof "Committed %d data-sensitivity labels for table %d" (count committed) (:id table)))
    (mapv #(assoc % :committed (committable? %)) fields)))

;;; Connection pre-flight

(defn- connection-error
  "The message of a failed connection test against `database`, or nil when it connects. Existing H2 and SQLite
  databases may be tested, as sync does."
  [{:keys [engine details]}]
  (binding [driver.settings/*allow-testing-h2-connections*     true
            driver.settings/*allow-testing-sqlite-connections* true]
    (try
      (driver.u/can-connect-with-details? engine details :throw-exceptions)
      nil
      (catch Throwable e
        (or (ex-message e) (str (class e)))))))

(defn- sample-connection-error
  "When `opts` ask for values and `database` cannot connect, the connection error; otherwise nil. Tested once per run
  so a dead database costs one connection timeout rather than one per table."
  [database opts]
  (when (:include-values? (context/with-defaults opts))
    (when-let [error (connection-error database)]
      (log/warnf "Database %d cannot connect, classifying on metadata alone: %s" (:id database) error)
      error)))

;;; Classify

(defn- assert-unique-names!
  "Throw when two packet fields share a name. The model keys its entries by name, so a duplicate would join one
  entry to two fields."
  [table fields]
  (when-let [dupes (seq (for [[field-name n] (frequencies (map :name fields)) :when (> n 1)] field-name))]
    (throw (ex-info (format "Table %d has fields with duplicate names: %s" (:id table) (pr-str (sort dupes)))
                    {:table-id (:id table) :duplicate-names (vec (sort dupes))}))))

(mu/defn- classify-table* :- ::table-result
  [database :- (ms/InstanceOf :model/Database)
   table    :- (ms/InstanceOf :model/Table)
   opts     :- [:maybe ::table-options]]
  (let [packet         (request/as-admin
                         (database-routing/with-database-routing-off
                           (context/table-packet database table (dissoc opts :model :chunk-size :commit?))))
        _              (assert-unique-names! table (:fields packet))
        classification (metabot/do-with-all-metabot-permissions
                        #(llm/classify-packet packet (select-keys opts [:model :chunk-size])))
        fields         (cond->> (mapv (fn [field]
                                        (diff-field field (get-in classification [:fields (:name field)])))
                                      (:fields packet))
                         (:commit? opts) (commit-fields! table))]
    {:table_id     (:id table)
     :table_name   (:name table)
     :schema       (:schema table)
     :database_id  (:db_id table)
     :model        (:model classification)
     :requests     (:requests classification)
     :usage        (:usage classification)
     :sample_error (get-in packet [:sample :error])
     :counts       (field-counts fields)
     :parse_counts (parse-counts (:counts classification))
     :fields       fields}))

(mu/defn classify-table! :- ::table-result
  "Classify every active field of `table` and diff the proposal against the current labels. Options are those of
  [[context/table-packet]] plus `:model` and `:chunk-size` for [[llm/classify-packet]]. The chunks run on the shared
  pool of [[llm/classify-packet]] and the first chunk failure fails the table. When
  values are requested the database connection is tested first; if it fails, fields are classified on metadata
  alone and `:sample_error` carries the connection error. The row sample runs as admin with database routing off;
  the LLM call runs with all Metabot permissions granted.

  A dry run unless `:commit?`: writes nothing. With `:commit?`, every `:new` or `:disagree` field of this run whose
  label no human set gets the proposed `data_sensitivity`, in one transaction, and is marked `:committed`. Semantic
  types are never written. This run is a new model call, so its labels can differ from an earlier dry run."
  [table :- (ms/InstanceOf :model/Table)
   & {:as opts} :- [:maybe ::table-options]]
  (let [database (db/database (:db_id table))
        error    (sample-connection-error database opts)]
    (cond-> (classify-table* database table (cond-> opts error (assoc :include-values? false)))
      error (assoc :sample_error error))))

(defn- error-code [e]
  (let [{:keys [error-code type]} (ex-data e)]
    (some-> (or error-code type) u/qualified-name)))

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

(mu/defn classify-database! :- ::database-result
  "Run [[classify-table!]] over every active table of `database`, restricted to `:schema` when given, one table after
  another on the calling thread. The database connection is tested once first; if it fails, every table is
  classified on metadata alone and `:sample_error` carries the connection error. A table whose classification throws
  is logged, becomes an error entry, and the run continues with the next table; `:failed` counts them. With
  `:commit?` each table commits on its own as it finishes; without it, a dry run that writes nothing. A commit
  classifies again, so its labels can differ from an earlier dry run. Synchronous; intended for small and medium databases until
  an async job exists."
  [database :- (ms/InstanceOf :model/Database)
   & {:keys [schema] :as opts} :- [:maybe ::database-options]]
  (let [sample-error (sample-connection-error database opts)
        table-opts   (cond-> (dissoc opts :schema)
                       sample-error (assoc :include-values? false))
        results      (mapv (fn [table]
                             (try
                               (classify-table* database table table-opts)
                               (catch Exception e
                                 (table-error table e))))
                           (db/active-tables (:id database) schema))
        succeeded    (remove :error results)]
    {:database_id  (:id database)
     :schema       schema
     :sample_error sample-error
     :tables       results
     :counts       (reduce (partial merge-with +) zero-counts (map :counts succeeded))
     :parse_counts (reduce (partial merge-with +) zero-parse-counts (map :parse_counts succeeded))
     :usage        (reduce (partial merge-with +) zero-usage (map :usage succeeded))
     :requests     (transduce (map :requests) + 0 succeeded)
     :failed       (count (filter :error results))}))
