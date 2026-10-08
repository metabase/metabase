(ns metabase-enterprise.data-sensitivity.core
  "Public surface of the LLM data-sensitivity classifier. [[classify-table!]] builds the packet, calls the model, and
  diffs the proposal against the current `data_sensitivity` of every field; [[classify-database!]] runs it over the
  active tables of a database, with the chunks of several tables on the shared pool at once. A table that fails
  becomes an error entry and the run continues; an interrupt stops the run. The result is a proposal the caller
  renders or evaluates. Without `:commit?` a run is a dry run and writes nothing; the API commits by default and
  passes `dry_run=true` as a run without `:commit?`. A commit after a dry run classifies again and writes the labels
  of that new run. The model output can change between runs, even at temperature 0, so committed labels can differ
  from what the dry run showed.

  The Metabot group permissions are bypassed for the call because the trigger is gated on database write access
  instead; the instance gates (Metabot enabled, provider configured, usage limits) still apply and are reported by
  [[unavailable-reason]]. Row samples and cached values are read as the current user and only when that user may see
  all rows of the table; see [[context/table-packet]]. Result keys are snake_case because the maps are API responses."
  (:require
   [metabase-enterprise.data-sensitivity.context :as context]
   [metabase-enterprise.data-sensitivity.db :as db]
   [metabase-enterprise.data-sensitivity.llm :as llm]
   [metabase.database-routing.core :as database-routing]
   [metabase.driver.settings :as driver.settings]
   [metabase.driver.util :as driver.u]
   [metabase.metabot.core :as metabot]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms])
  (:import
   (java.util.concurrent CancellationException)))

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

(mr/def ::submitted-table
  [:map {:closed true}
   [:table     (ms/InstanceOf :model/Table)]
   [:opts      [:maybe ::table-options]]
   [:packet    ::context/packet]
   [:submitted ::llm/submitted]])

(defn- throw-if-interrupted!
  "Throw an `InterruptedException` when the calling thread is interrupted. The interrupt flag stays set."
  []
  (when (.isInterrupted (Thread/currentThread))
    (throw (InterruptedException. "Data-sensitivity classification interrupted"))))

(mu/defn- submit-table :- ::submitted-table
  "Build the packet of `table` on the calling thread, as the current user with database routing off, and submit its chunk calls
  to the pool with all Metabot permissions granted. Returns without waiting; the result goes to [[finish-table]].
  When the thread is interrupted during the packet build, throws and submits nothing."
  [database :- (ms/InstanceOf :model/Database)
   table    :- (ms/InstanceOf :model/Table)
   opts     :- [:maybe ::table-options]]
  (let [packet (database-routing/with-database-routing-off
                 (context/table-packet database table (dissoc opts :model :chunk-size :commit?)))]
    (assert-unique-names! table (:fields packet))
    (throw-if-interrupted!)
    {:table     table
     :opts      opts
     :packet    packet
     :submitted (metabot/do-with-all-metabot-permissions
                 #(llm/submit-packet packet (select-keys opts [:model :chunk-size])))}))

(mu/defn- finish-table :- ::table-result
  "Wait for the chunk calls of a [[submit-table]] result, diff the proposal, and commit it when `:commit?`."
  [{:keys [table opts packet submitted]} :- ::submitted-table]
  (let [classification (llm/collect-packet submitted)
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
  alone and `:sample_error` carries the connection error. Values are read as the current user with database routing
  off, and only when that user may see all rows of the table; otherwise the table is classified on metadata alone and
  `:sample_error` says why. The LLM call runs with all Metabot permissions granted.

  A dry run unless `:commit?`: writes nothing. With `:commit?`, every `:new` or `:disagree` field of this run whose
  label no human set gets the proposed `data_sensitivity`, in one transaction, and is marked `:committed`. Semantic
  types are never written. A commit after a dry run is a new model call, so its labels can differ from what the dry
  run showed."
  [table :- (ms/InstanceOf :model/Table)
   & {:as opts} :- [:maybe ::table-options]]
  (let [database (db/database (:db_id table))
        error    (sample-connection-error database opts)
        entry    (submit-table database table (cond-> opts error (assoc :include-values? false)))]
    (try
      (cond-> (finish-table entry)
        error (assoc :sample_error error))
      (finally
        (llm/cancel-packet (:submitted entry))))))

(defn- error-code [e]
  (let [{:keys [error-code type]} (ex-data e)]
    (some-> (or error-code type) u/qualified-name)))

(def ^:private max-logged-traces
  "The most table failures of one database run that log a stack trace. Later failures log one line with no trace."
  3)

(defn- table-error
  "The error entry for `table`. Log the failure. A failure that is not a provider rejection logs its stack trace while
  the run-local `traces-left` is above zero, and decrements it."
  [table e traces-left]
  (let [{:keys [api-error provider status]} (ex-data e)
        message (or (ex-message e) (str (class e)))
        code    (error-code e)]
    (cond
      api-error
      (log/warnf "Data-sensitivity classification failed for table %d: %s provider=%s status=%s"
                 (:id table) message provider status)

      (pos? @traces-left)
      (do (vswap! traces-left dec)
          (log/warnf e "Data-sensitivity classification failed for table %d" (:id table)))

      :else
      (log/warnf "Data-sensitivity classification failed for table %d: %s error_code=%s" (:id table) message code))
    {:table_id   (:id table)
     :table_name (:name table)
     :schema     (:schema table)
     :error      message
     :error_code code}))

(def ^:private max-tables-in-flight
  "The most tables of a database run whose chunks are submitted and not yet collected. Twice the pool size keeps the
  pool busy while the calling thread builds the next packets, and bounds the packets held in memory."
  (* 2 llm/pool-size))

(defn- interrupt?
  "Whether `e` comes from an interrupt rather than a failure of the table: the calling thread is interrupted, an
  `InterruptedException` is in the cause chain (throwing it clears the flag), or a chunk was cancelled."
  [^Throwable e]
  (or (.isInterrupted (Thread/currentThread))
      (instance? CancellationException e)
      (some #(instance? InterruptedException %) (take-while some? (iterate ex-cause e)))))

(defn- table-error-or-rethrow
  "The [[table-error]] entry for `e`, or, when `e` comes from an interrupt, set the interrupt flag again and rethrow
  `e` so the run stops."
  [table e traces-left]
  (when (interrupt? e)
    (.interrupt (Thread/currentThread))
    (throw e))
  (table-error table e traces-left))

(defn- submit-entry [database table opts traces-left]
  (try
    (submit-table database table opts)
    (catch Exception e
      (table-error-or-rethrow table e traces-left))))

(defn- finish-entry [entry traces-left]
  (if (:submitted entry)
    (try
      (finish-table entry)
      (catch Exception e
        (u/prog1 (table-error-or-rethrow (:table entry) e traces-left)
          (llm/cancel-packet (:submitted entry)))))
    entry))

(defn- classify-tables
  "Classify `tables` in order. The chunks of each table are submitted as soon as its packet is built, without waiting,
  so the pool stays busy while the calling thread builds the next packets. Tables are collected, diffed, and committed
  in order, with at most [[max-tables-in-flight]] submitted and not collected. A table whose packet build or chunks
  throw becomes an error entry, and its other chunks are cancelled. An interrupt stops the run: the interrupt flag is
  checked before each table, and an exception that comes from an interrupt is rethrown with the flag set. When the run
  stops early, the chunks not yet collected are cancelled, newest first, so that no chunk that waits starts on a
  thread a cancelled chunk frees. Only the first [[max-logged-traces]] failures of the run log a stack trace, and a run
  with failures logs one summary line."
  [database tables opts]
  (let [queue       (volatile! clojure.lang.PersistentQueue/EMPTY)
        results     (volatile! [])
        traces-left (volatile! max-logged-traces)
        collect!    (fn []
                      (let [result (finish-entry (peek @queue) traces-left)]
                        (vswap! queue pop)
                        (vswap! results conj result)))]
    (try
      (doseq [table tables]
        (throw-if-interrupted!)
        (vswap! queue conj (submit-entry database table opts traces-left))
        (while (when-let [head (peek @queue)]
                 (or (not (:submitted head))
                     (> (count @queue) max-tables-in-flight)))
          (collect!)))
      (while (seq @queue)
        (collect!))
      (when-let [failed (seq (filter :error @results))]
        (log/warnf "Data-sensitivity classification failed for %d of %d tables of database %d: error_codes=%s"
                   (count failed) (count @results) (:id database) (frequencies (map :error_code failed))))
      @results
      (finally
        (run! #(some-> (:submitted %) llm/cancel-packet) (reverse @queue))))))

(mu/defn classify-database! :- ::database-result
  "Run [[classify-table!]] over every active table of `database`, restricted to `:schema` when given. Packets are built
  on the calling thread, and the chunks of up to [[max-tables-in-flight]] tables wait on the shared pool at once, so
  single-chunk tables also keep every pool thread busy. Tables are collected, diffed, and committed in order. The
  database connection is tested once first; if it fails, every table is classified on metadata alone and
  `:sample_error` carries the connection error. A table whose classification throws is logged, becomes an error
  entry, and the run continues with the next table; `:failed` counts them. An interrupt of the calling thread, for
  example `future-cancel`, stops the run: it throws, cancels the chunks not yet collected, and commits no more tables.
  With `:commit?` each table commits on its own after its own chunks are collected; without it, a dry run that writes
  nothing. A commit after a dry run classifies again, so its labels can differ from what the dry run showed.
  Synchronous; intended for small and medium databases until an async job exists."
  [database :- (ms/InstanceOf :model/Database)
   & {:keys [schema] :as opts} :- [:maybe ::database-options]]
  (let [sample-error (sample-connection-error database opts)
        table-opts   (cond-> (dissoc opts :schema)
                       sample-error (assoc :include-values? false))
        results      (classify-tables database (db/active-tables (:id database) schema) table-opts)
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
