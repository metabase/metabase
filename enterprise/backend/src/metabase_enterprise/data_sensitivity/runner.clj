(ns metabase-enterprise.data-sensitivity.runner
  "Background metadata generation runs. [[start-run!]] saves a `metadata_generation_run` row and starts a worker that
  classifies the tables of the run in sequence and writes `metadata_generation_suggestion` rows; it writes no field
  metadata. The chunk calls of a table run on the shared pool of [[llm/submit-packet]]. One run per database can be
  active.

  Cancel and stop (decision `ghy-4721-run-cancel-and-stop-statuses`): [[cancel-run!]] sets the status to `canceling`
  on the run row, so a cancel from any node reaches the worker. The worker reads the status between tables and every
  [[poll-ms]] while it waits on chunk calls, cancels the chunks in flight, and writes `canceled`. A usage limit ends the
  run with status `usage_limit`. A table that fails is recorded on the run and the run continues. Tables the run did
  not finish go to `table_errors` with error code `not_processed`, so [[retry-failed!]] covers them.

  Each node heartbeats the runs it owns ([[heartbeat-tick!]]); [[reap-orphaned-runs!]] fails an active run whose
  heartbeat is stale, for example after its node died."
  (:require
   [clojure.string :as str]
   [com.climate.claypoole :as cp]
   [com.climate.claypoole.impl :as cp.impl]
   [metabase-enterprise.data-sensitivity.context :as context]
   [metabase-enterprise.data-sensitivity.core :as core]
   [metabase-enterprise.data-sensitivity.db :as db]
   [metabase-enterprise.data-sensitivity.llm :as llm]
   [metabase-enterprise.data-sensitivity.models.metadata-generation-run :as run]
   [metabase-enterprise.data-sensitivity.models.metadata-generation-suggestion :as suggestion]
   [metabase.database-routing.core :as database-routing]
   [metabase.metabot.core :as metabot]
   [metabase.request.core :as request]
   [metabase.run-tracking.core :as rt]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms])
  (:import
   (java.time OffsetDateTime)
   (java.util.concurrent CancellationException ExecutionException ExecutorService Future TimeUnit TimeoutException)))

(set! *warn-on-reflection* true)

(def supported-attributes
  "The attributes a run can generate."
  (set llm/all-attributes))

(def default-attributes
  "The attributes of a run that names none."
  [:data_sensitivity :semantic_type])

(def poll-ms
  "How often, in milliseconds, a worker that waits on chunk calls reads the status of its run."
  1000)

(def heartbeat-stale-minutes
  "An active run whose heartbeat is older than this is reaped."
  5)

(def ^:private worker-pool-size
  "Runs that execute at once on one node. Later runs wait as `pending`; their chunks share one pool anyway."
  2)

(defonce ^:private ^ExecutorService workers
  (cp/threadpool worker-pool-size {:name "metadata-generation-run" :daemon true}))

(defonce ^:private local-runs
  ;; run id -> {:stop (atom nil-or-reason) :future Future}, for the runs this node executes.
  (atom {}))

(def ^:private zero-usage
  {:input_tokens 0 :output_tokens 0 :cache_read_tokens 0 :cache_creation_tokens 0 :total_tokens 0 :cost_usd 0.0})

;;; Cost

(def ^:private price-per-million-tokens
  "USD per million tokens, keyed by a substring of the model name. Anthropic list prices, as of 2026-10-09."
  {"claude-haiku-4-5"  {:input 1.00 :output 5.00 :cache_write 1.25 :cache_read 0.10}
   "claude-sonnet-4-6" {:input 3.00 :output 15.00 :cache_write 3.75 :cache_read 0.30}})

(defn- call-cost
  "USD cost of `usage` on `model`, or nil when `model` has no price. `:input_tokens` includes both cache buckets."
  [model {:keys [input_tokens output_tokens cache_read_tokens cache_creation_tokens]}]
  (when-let [{:keys [input output cache_write cache_read]}
             (some (fn [[k v]] (when (and model (str/includes? model k)) v)) price-per-million-tokens)]
    (/ (+ (* (- input_tokens cache_read_tokens cache_creation_tokens) input)
          (* cache_creation_tokens cache_write)
          (* cache_read_tokens cache_read)
          (* output_tokens output))
       1e6)))

(defn- add-usage
  "Add the usage of one table, classified on `model`, to the run's `usage`. `:cost_usd` stays nil once a table used
  a model with no price."
  [usage model table-usage]
  (let [cost (call-cost model table-usage)]
    (-> (merge-with + (dissoc usage :cost_usd) table-usage)
        (assoc :cost_usd (when (and cost (:cost_usd usage))
                           (+ (:cost_usd usage) cost))))))

;;; Scope

(mr/def ::start-request
  [:map {:closed true}
   [:schemas    {:optional true} [:maybe [:sequential {:min 1} ms/NonBlankString]]]
   [:table_ids  {:optional true} [:maybe [:sequential {:min 1} ms/PositiveInt]]]
   [:attributes {:optional true} [:maybe [:sequential {:min 1} ::run/attribute]]]])

(defn- bad-request [message]
  (ex-info message {:status-code 400}))

(defn- request-scope [{:keys [schemas table_ids]}]
  (cond
    (and schemas table_ids) (throw (bad-request (tru "Give schemas or table_ids, not both.")))
    schemas                 {:type :schemas :schemas (vec (distinct schemas))}
    table_ids               {:type :tables :table_ids (vec (distinct table_ids))}
    :else                   {:type :database}))

(defn- scope-tables
  "The active tables of `database-id` that `scope` names, ordered by schema then name. Throws a 400 when the scope
  names a schema or table that has no active table in the database, or when it holds no table."
  [database-id {scope-type :type :keys [schemas table_ids]}]
  (let [tables (db/active-tables database-id nil)
        tables (case scope-type
                 :database tables
                 :schemas  (let [wanted  (set schemas)
                                 missing (remove (set (map :schema tables)) schemas)]
                             (when (seq missing)
                               (throw (bad-request (tru "No active tables in schemas: {0}." (pr-str (vec missing))))))
                             (filter #(wanted (:schema %)) tables))
                 :tables   (let [wanted  (set table_ids)
                                 found   (filter #(wanted (:id %)) tables)
                                 missing (remove (set (map :id found)) table_ids)]
                             (when (seq missing)
                               (throw (bad-request (tru "Not active tables of this database: {0}." (pr-str (vec missing))))))
                             found))]
    (when (empty? tables)
      (throw (bad-request (tru "The database has no active tables to classify."))))
    (vec tables)))

(defn- check-attributes! [attributes]
  (when-let [unsupported (seq (remove supported-attributes attributes))]
    (throw (bad-request (tru "Attributes not supported yet: {0}." (pr-str (mapv name unsupported)))))))

;;; Stop

(defn- stop! [reason]
  (throw (ex-info "Metadata generation run stopped" {::stop reason})))

(defn- stop-reason
  "The `::stop` reason in the cause chain of `e`, or nil."
  [e]
  (some #(::stop (ex-data %)) (take-while some? (iterate ex-cause e))))

(defn- usage-limit-message
  "The message of a usage-limit failure in the cause chain of `e`, or nil."
  [e]
  (some #(when (= :metabot/usage-limit-reached (:type (ex-data %)))
           (or (:message (ex-data %)) (ex-message %)))
        (take-while some? (iterate ex-cause e))))

(defn- interrupted? [e]
  (or (.isInterrupted (Thread/currentThread))
      (instance? CancellationException e)
      (context/interrupted? e)))

(defn- check-stop!
  "Throw a stop when the run must stop: the local stop flag is set, the thread is interrupted, or the run's status, read
  at most once per [[poll-ms]], is no longer `running`. The stop reason is `:canceled` for a `canceling` run and
  `:gone` for a run that ended elsewhere, for example by the reaper."
  [{:keys [run-id stop last-poll]}]
  (when-let [reason @stop]
    (stop! reason))
  (when (.isInterrupted (Thread/currentThread))
    (stop! :gone))
  (let [now (System/currentTimeMillis)]
    (when (>= (- now @last-poll) poll-ms)
      (vreset! last-poll now)
      (let [status (db/run-status run-id)]
        (when-not (= :running status)
          (reset! stop (if (= :canceling status) :canceled :gone))
          (stop! @stop))))))

(defn- await-chunks!
  "Wait for every chunk call of `submitted` in order, checking for a stop every [[poll-ms]]. Rethrows a failure as
  soon as its chunk ends, as the chunk threw it."
  [ctx {:keys [futures]}]
  (doseq [^Future f futures]
    (loop []
      (when-not (.isDone f)
        (check-stop! ctx)
        (try
          (.get f poll-ms TimeUnit/MILLISECONDS)
          (catch TimeoutException _ nil)
          (catch ExecutionException _ nil))
        (recur)))
    (cp.impl/deref-fixing-exceptions f)))

;;; Suggestions

(defn- source [field k current-value]
  (cond
    (contains? (:human_set field) k) :human
    (contains? (:ai_set field) k)    :ai
    (some? current-value)            :deterministic
    :else                            :none))

(defn- new-description
  "The description proposed in `entry` when it differs from the current `description`, else nil."
  [description entry]
  (let [proposed (:description entry)]
    (when (and proposed (not= (some-> description str/trim) proposed))
      proposed)))

(defn- confidence [s]
  (#{:high :medium :low} (some-> s keyword)))

(mu/defn table-suggestions :- [:sequential ::suggestion/new-suggestion]
  "The suggestion rows of one classified table for the `attributes` of run `run-id`: a `data_sensitivity` row for every
  field whose proposed label is new or differs from the current one, a `semantic_type` row for every field whose
  proposed type differs from the current one, and a `description` row for every field whose proposed description
  differs from the current one. A human-set current value is a suggestion too, with source `:human`; the parse never
  proposes a description for a human-set description."
  [run-id         :- ms/PositiveInt
   attributes     :- [:set ::run/attribute]
   packet         :- ::context/packet
   entries        :- [:map-of :string ::llm/entry]]
  (vec
   (for [field (:fields packet)
         :let  [entry (get entries (:name field))
                {:keys [status current proposed semantic_changed]}
                (core/diff-field field entry)
                description (new-description (:description field) entry)
                base {:run_id     run-id
                      :table_id   (get-in packet [:table :id])
                      :field_id   (:id field)
                      :confidence (confidence (:confidence proposed))
                      :reasoning  (:reasoning proposed)}]
         suggestion (cond-> []
                      (and (attributes :data_sensitivity) (#{:new :disagree} status))
                      (conj (assoc base
                                   :attribute      :data_sensitivity
                                   :source         (source field :data_sensitivity (:data_sensitivity current))
                                   :current_value  (some-> (:data_sensitivity current) name)
                                   :proposed_value (name (:data_sensitivity proposed))))

                      (and (attributes :semantic_type) semantic_changed)
                      (conj (assoc base
                                   :attribute      :semantic_type
                                   :source         (source field :semantic_type (:semantic_type current))
                                   :current_value  (some-> (:semantic_type current) u/qualified-name)
                                   :proposed_value (u/qualified-name (:semantic_type proposed))))

                      (and (attributes :description) description)
                      (conj (assoc base
                                   :attribute      :description
                                   :source         (source field :description (not-empty (:description field)))
                                   :current_value  (:description field)
                                   :proposed_value description)))]
     suggestion)))

;;; Worker

(defn- classify-table
  "Build the packet of `table`, submit its chunk calls with all Metabot permissions granted, and wait for them while
  checking for a stop. Cancels the chunks not finished on any exit."
  [{:keys [attributes] :as ctx} database table packet-opts]
  (let [packet (database-routing/with-database-routing-off
                 (context/table-packet database table packet-opts))]
    (core/assert-unique-names! table (:fields packet))
    (check-stop! ctx)
    (let [submitted (metabot/do-with-all-metabot-permissions #(llm/submit-packet packet :attributes attributes))]
      (try
        (await-chunks! ctx submitted)
        {:packet packet :classification (llm/collect-packet submitted)}
        (finally
          (llm/cancel-packet submitted))))))

(defn- table-error [table message code]
  {:table_id   (:id table)
   :table_name (:name table)
   :schema     (:schema table)
   :message    message
   :error_code code})

(defn- error-code [e]
  (let [{:keys [error-code type]} (ex-data e)]
    (some-> (or error-code type) u/qualified-name)))

(defn- progress [{:keys [done failed errors usage]}]
  {:done_tables done :failed_tables failed :table_errors errors :usage usage})

(defn- not-processed [state tables message]
  (update state :errors into (map #(table-error % message "not_processed")) tables))

(defn- run-tables!
  "Classify `tables` in order and record each one on the run. Returns the final state, with `:end` set to how the
  run ended: `:succeeded`, `[:stopped reason]` or `[:usage-limit message]`."
  [{:keys [run-id attributes] :as ctx} database tables]
  (let [sample-error (core/sample-connection-error database nil)
        packet-opts  (cond-> {} sample-error (assoc :include-values? false))]
    (loop [state             {:done 0 :failed 0 :errors [] :usage zero-usage}
           [table & more :as remaining] tables]
      (if-not table
        (assoc state :end :succeeded)
        (let [outcome (try
                        (check-stop! ctx)
                        (let [{:keys [packet classification]} (classify-table ctx database table packet-opts)]
                          {:usage       (:usage classification)
                           :model       (:model classification)
                           :suggestions (table-suggestions run-id attributes packet (:fields classification))})
                        (catch Exception e
                          (cond
                            (stop-reason e)         {:end [:stopped (stop-reason e)]}
                            (interrupted? e)        {:end [:stopped :gone]}
                            (usage-limit-message e) {:end [:usage-limit (usage-limit-message e)]}
                            :else                   {:error e})))]
          (cond
            (:end outcome)
            (assoc state :end (:end outcome) :remaining remaining)

            (:error outcome)
            (let [e     (:error outcome)
                  state (-> state
                            (update :failed inc)
                            (update :errors conj (table-error table (or (ex-message e) (str (class e))) (error-code e))))]
              (log/warnf e "Metadata generation run %d failed for table %d" run-id (:id table))
              (if (db/record-table! run-id (progress state) [])
                (recur state more)
                (assoc state :end [:stopped :gone] :remaining more)))

            :else
            (let [state (-> state
                            (update :done inc)
                            (update :usage add-usage (:model outcome) (:usage outcome)))]
              (if (db/record-table! run-id (progress state) (:suggestions outcome))
                (recur state more)
                (assoc state :end [:stopped :gone] :remaining more)))))))))

(defn- finish!
  "Write the terminal status of a run from the final `state` of [[run-tables!]]. A run that ended elsewhere is left
  as it is."
  [run-id {:keys [end remaining] :as state}]
  (let [[kind reason] (if (keyword? end) [end] end)]
    (case kind
      :succeeded
      (db/update-active-run! run-id (assoc (progress state) :status :succeeded))

      :stopped
      (if (= :canceled reason)
        (db/update-active-run! run-id (-> (not-processed state remaining (tru "The run was canceled."))
                                          progress
                                          (assoc :status :canceled :message (tru "Canceled."))))
        (log/infof "Metadata generation run %d ended elsewhere; the worker stops" run-id))

      :usage-limit
      (db/update-active-run! run-id (-> (not-processed state remaining (tru "The AI usage limit was reached."))
                                        progress
                                        (assoc :status :usage_limit :message reason))))))

(defn- execute-run!
  "Execute the run in `ctx` over `tables`. Marks it running unless it was canceled while pending, runs the tables,
  and writes the terminal status. An unexpected failure fails the run."
  [{:keys [run-id] :as ctx} database tables]
  (try
    (if (pos? (db/update-run-with-status! run-id :pending {:status :running :started_at (OffsetDateTime/now) :last_heartbeat (OffsetDateTime/now)}))
      (finish! run-id (run-tables! ctx database tables))
      (when (= :canceling (db/run-status run-id))
        (db/update-active-run! run-id (-> (not-processed {:done 0 :failed 0 :errors [] :usage zero-usage}
                                                         tables (tru "The run was canceled."))
                                          progress
                                          (assoc :status :canceled :message (tru "Canceled."))))))
    (catch Throwable e
      (log/errorf e "Metadata generation run %d failed" run-id)
      (u/ignore-exceptions
        (db/update-active-run! run-id {:status :failed :message (or (ex-message e) (str (class e)))})))
    (finally
      (swap! local-runs dissoc run-id))))

(defn- submit-worker!
  "Run [[execute-run!]] on the worker pool as `creator-id`, so the chunk calls count against that user's usage."
  [run-id database tables attributes creator-id]
  (let [ctx {:run-id     run-id
             :attributes (set attributes)
             :stop       (atom nil)
             :last-poll  (volatile! 0)}]
    (swap! local-runs assoc run-id {:stop (:stop ctx)})
    (let [f (cp/future workers
                       (request/with-current-user creator-id
                         (execute-run! ctx database tables)))]
      (swap! local-runs (fn [m] (cond-> m (contains? m run-id) (assoc-in [run-id :future] f))))
      f)))

;;; Estimate

(def ^:private per-field-cost
  "Total tokens and USD per field for an attribute set, from the Haiku 4.5 bench on the synthetic app schema (TSP-160,
  336 fields). Attribute sets with no bench row use the all-three row, the highest."
  {#{:data_sensitivity :semantic_type}              {:tokens 433 :cost_usd 0.00067}
   #{:data_sensitivity}                             {:tokens 369 :cost_usd 0.00058}
   #{:description}                                  {:tokens 312 :cost_usd 0.00059}
   #{:data_sensitivity :semantic_type :description} {:tokens 493 :cost_usd 0.00079}})

(mr/def ::estimate
  [:map {:closed true}
   [:table_count        ms/IntGreaterThanOrEqualToZero]
   [:field_count        ms/IntGreaterThanOrEqualToZero]
   [:total_tokens       ms/IntGreaterThanOrEqualToZero]
   [:cost_usd           number?]
   [:unavailable_reason [:maybe :keyword]]])

(mu/defn estimate :- ::estimate
  "The size of a run that [[start-run!]] would start for `request`: tables, fields, and about how many tokens and USD
  it uses. `:unavailable_reason` is why a start would fail now, or nil. Throws a 400 for the same scope and attribute
  errors as [[start-run!]]."
  [database :- (ms/InstanceOf :model/Database)
   request  :- ::start-request]
  (let [attributes  (vec (distinct (or (:attributes request) default-attributes)))
        _           (check-attributes! attributes)
        tables      (scope-tables (:id database) (request-scope request))
        field-count (db/active-field-count (mapv :id tables))
        ratio       (or (per-field-cost (set attributes))
                        (per-field-cost (set llm/all-attributes)))]
    {:table_count        (count tables)
     :field_count        field-count
     :total_tokens       (* field-count (:tokens ratio))
     :cost_usd           (* field-count (:cost_usd ratio))
     :unavailable_reason (core/unavailable-reason)}))

;;; Public API

(defn- conflict [database-id]
  (ex-info (tru "A metadata generation run is already active for this database.")
           {:status-code 409 :database-id database-id}))

(mu/defn start-run! :- (ms/InstanceOf :model/MetadataGenerationRun)
  "Start a run over the active tables of `database` that the request names: all of them, those in `:schemas`, or
  `:table_ids`. `:attributes` defaults to [[default-attributes]]. Returns the new run. Throws a 409 when a run is active
  for the database, and a 400 when Metabot cannot run, the scope holds no active table, or an attribute is not
  supported. The run executes as `creator-id`."
  [database   :- (ms/InstanceOf :model/Database)
   request    :- ::start-request
   creator-id :- ms/PositiveInt]
  (let [database-id (:id database)
        scope       (request-scope request)
        attributes  (vec (distinct (or (:attributes request) default-attributes)))
        _           (check-attributes! attributes)
        tables      (scope-tables database-id scope)]
    (when (db/active-run database-id)
      (throw (conflict database-id)))
    (when-let [reason (core/unavailable-reason)]
      (throw (ex-info (tru "AI metadata generation is not available: {0}." (name reason))
                      {:status-code 400 :reason reason :error-code reason})))
    (let [run (try
                (db/insert-run! {:database_id    database-id
                                 :scope          scope
                                 :attributes     attributes
                                 :total_tables   (count tables)
                                 :creator_id     creator-id
                                 :last_heartbeat (OffsetDateTime/now)})
                (catch Exception e
                  (if (db/active-run database-id)
                    (throw (conflict database-id))
                    (throw e))))]
      (submit-worker! (:id run) database tables attributes creator-id)
      run)))

(mu/defn cancel-run! :- [:maybe (ms/InstanceOf :model/MetadataGenerationRun)]
  "Ask the run with `run-id` to stop. A pending or running run becomes `canceling` and its worker writes `canceled`
  when it stops. Returns the run after the request. Throws a 409 when the run has already ended."
  [run-id :- ms/PositiveInt]
  (when-let [run (db/run run-id)]
    (when-not (run/active-statuses (:status run))
      (throw (ex-info (tru "The run has already ended.") {:status-code 409})))
    (when (#{:pending :running} (:status run))
      (db/update-run-with-status! run-id (:status run) {:status :canceling}))
    (some-> (get-in @local-runs [run-id :stop]) (reset! :canceled))
    (db/run run-id)))

(mu/defn retry-failed! :- (ms/InstanceOf :model/MetadataGenerationRun)
  "Start a new run over the tables in the `table_errors` of the ended run `run`, with its attributes, as
  `creator-id`. Throws a 400 when the run is active or has no table errors."
  [database   :- (ms/InstanceOf :model/Database)
   run        :- (ms/InstanceOf :model/MetadataGenerationRun)
   creator-id :- ms/PositiveInt]
  (when (run/active-statuses (:status run))
    (throw (bad-request (tru "The run has not ended."))))
  (let [table-ids (vec (distinct (map :table_id (:table_errors run))))]
    (when (empty? table-ids)
      (throw (bad-request (tru "The run has no failed tables."))))
    (start-run! database {:table_ids table-ids :attributes (:attributes run)} creator-id)))

;;; Heartbeat and reaper

(defn heartbeat-tick!
  "Heartbeat the runs this node executes. Raise the stop flag of a run that is `canceling`; stop and interrupt the
  worker of a run that is no longer active."
  []
  (let [ids (vec (keys @local-runs))]
    (rt/heartbeat-and-reconcile!
     {:model      :model/MetadataGenerationRun
      :active     [:is_active true]
      :ids        ids
      :heartbeat! #(rt/heartbeat-ids! :model/MetadataGenerationRun [:is_active true] :last_heartbeat %)
      :on-gone    (fn [id]
                    (when-let [{:keys [stop future]} (get @local-runs id)]
                      (reset! stop :gone)
                      (some-> ^Future future (.cancel true))))})
    (doseq [id (db/canceling-run-ids ids)]
      (some-> (get-in @local-runs [id :stop]) (reset! :canceled)))))

(defn reap-orphaned-runs!
  "Fail every active run whose heartbeat is older than `stale-minutes`. Returns the reaped rows."
  [stale-minutes]
  (rt/reap-orphaned! {:model    :model/MetadataGenerationRun
                      :active   [:is_active true]
                      :stale    [{:column :last_heartbeat :age stale-minutes :unit :minute}]
                      :terminal {:status    "failed"
                                 :ended_at  :%now
                                 :is_active nil
                                 :message   (str "The run stopped sending heartbeats for " stale-minutes
                                                 " minutes; its node probably stopped.")}}))
