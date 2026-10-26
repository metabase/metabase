(ns metabase-enterprise.data-sensitivity.runner
  "Background metadata generation runs. [[start-run!]] saves a `metadata_generation_run` row and starts a worker that
  classifies the tables of the run in sequence and upserts the `metadata_generation_proposal` rows of each table; it
  writes no field metadata. The chunk calls of a table run on the shared pool of [[llm/submit-packet]]. One run per
  database can be active.

  Cancel and stop: [[cancel-run!]] ends a pending run as `canceled` at once. For a running run it sets the status to
  `canceling` on the run row, so a cancel from any node reaches the worker, and interrupts the worker when it runs on
  this node. The worker reads the status between tables and every [[poll-ms]] while it waits on chunk calls, cancels
  the chunks in flight, and writes `canceled`. A usage limit ends the run with status `usage_limit`. A table that
  fails is recorded on the run and the run continues. The run records the tables it finished in `done_table_ids`.
  When a run ends before its last table (cancel, usage limit, an unexpected failure, or the reaper), the tables of its
  scope that it did not finish go to `table_errors` with error code `not_processed`, so [[retry-failed!]] covers them.

  Each node heartbeats the runs it owns ([[heartbeat-tick!]]); [[reap-orphaned-runs!]] fails an active run whose
  heartbeat is stale, for example after its node died. The heartbeat does not show that the chunk calls progress, so
  the worker fails a chunk call that runs longer than [[call-timeout-ms]] and aborts its request with
  [[llm/cancel-packet]], which frees the pool thread. The run's `usage` records `max_table_ms` and `slow_calls` so a
  slow provider is visible on the run."
  (:require
   [clojure.string :as str]
   [com.climate.claypoole :as cp]
   [com.climate.claypoole.impl :as cp.impl]
   [metabase-enterprise.data-sensitivity.context :as context]
   [metabase-enterprise.data-sensitivity.core :as core]
   [metabase-enterprise.data-sensitivity.db :as db]
   [metabase-enterprise.data-sensitivity.llm :as llm]
   [metabase-enterprise.data-sensitivity.models.metadata-generation-proposal :as proposal]
   [metabase-enterprise.data-sensitivity.models.metadata-generation-run :as run]
   [metabase.database-routing.core :as database-routing]
   [metabase.metabot.core :as metabot]
   [metabase.request.core :as request]
   [metabase.run-tracking.core :as rt]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.jvm :as u.jvm]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms])
  (:import
   (java.time OffsetDateTime)
   (java.util.concurrent CancellationException ExecutionException ExecutorService Future TimeUnit TimeoutException)))

(set! *warn-on-reflection* true)

(def poll-ms
  "How often, in milliseconds, a worker that waits on chunk calls reads the status of its run."
  1000)

(defn call-timeout-ms
  "How long, in milliseconds, one chunk call may run, its retries included, before the worker fails it. The
  Metabot client socket timeout bounds only the gap between two reads, so a stalled connection can hold a call far
  longer."
  []
  180000)

(defn slow-call-ms
  "A chunk call that runs longer than this, in milliseconds, counts in the run's `usage.slow_calls`."
  []
  60000)

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

(defn- request-scope [{:keys [schemas table_ids]}]
  (cond
    (and schemas table_ids) (throw (core/bad-request (tru "Give schemas or table_ids, not both.")))
    schemas                 {:type :schemas :schemas (vec (distinct schemas))}
    table_ids               {:type :tables :table_ids (vec (distinct table_ids))}
    :else                   {:type :database}))

(defn- tables-in-scope
  "The active tables of `database-id` that `scope` names, ordered by schema then name."
  [database-id {scope-type :type :keys [schemas table_ids]}]
  (let [tables (db/active-tables database-id)]
    (vec (case scope-type
           :database tables
           :schemas  (filter (comp (set schemas) :schema) tables)
           :tables   (filter (comp (set table_ids) :id) tables)))))

(defn- scope-tables
  "The active tables of `database-id` that `scope` names, ordered by schema then name. Throws a 400 when the scope
  names a schema or table that has no active table in the database, or when it holds no table."
  [database-id {scope-type :type :keys [schemas table_ids] :as scope}]
  (let [tables (tables-in-scope database-id scope)]
    (case scope-type
      :database nil
      :schemas  (when-let [missing (seq (remove (set (map :schema tables)) schemas))]
                  (throw (core/bad-request (tru "No active tables in schemas: {0}." (str/join ", " missing)))))
      :tables   (when-let [missing (seq (remove (set (map :id tables)) table_ids))]
                  (throw (core/bad-request (tru "Not active tables of this database: {0}." (str/join ", " missing))))))
    (when (empty? tables)
      (throw (core/bad-request (tru "The database has no active tables to classify."))))
    tables))

(defn- parse-request
  "The `:scope`, `:attributes` and `:tables` of a start `request` for `database-id`. `:attributes` defaults to
  [[llm/default-attributes]]. Throws the 400s of [[scope-tables]]."
  [database-id request]
  (let [scope (request-scope request)]
    {:scope      scope
     :attributes (vec (distinct (or (:attributes request) (sort llm/default-attributes))))
     :tables     (scope-tables database-id scope)}))

;;; Stop

(defn- stop! [reason]
  (throw (ex-info "Metadata generation run stopped" {::stop reason})))

(defn- stop-reason
  "The `::stop` reason in the cause chain of `e`, or nil."
  [e]
  (some #(::stop (ex-data %)) (u.jvm/full-exception-chain e)))

(defn- usage-limit-message
  "The message of a usage-limit failure in the cause chain of `e`, or nil."
  [e]
  (some #(when (= :metabot/usage-limit-reached (:type (ex-data %)))
           (or (:message (ex-data %)) (ex-message %)))
        (u.jvm/full-exception-chain e)))

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

(defn- check-call-time!
  "Throw when the chunk call of `timing` has run longer than [[call-timeout-ms]]."
  [timing]
  (when-let [timer (:timer @timing)]
    (when (> (u/since-ms timer) (call-timeout-ms))
      (throw (ex-info (tru "The AI provider did not answer within {0} seconds." (quot (call-timeout-ms) 1000))
                      {:error-code "llm_call_timeout"})))))

(defn- slow-calls
  "The number of chunk calls of `submitted` that started and ran, or have run so far, longer than [[slow-call-ms]]."
  [{:keys [timings]}]
  (count (filter (fn [timing]
                   (when-let [{:keys [timer elapsed-ms]} @timing]
                     (> (or elapsed-ms (u/since-ms timer)) (slow-call-ms))))
                 timings)))

(defn- await-chunks!
  "Wait for every chunk call of `submitted` in order, checking for a stop and for a call that runs too long every
  [[poll-ms]]. Rethrows a failure as soon as its chunk ends, as the chunk threw it."
  [ctx {:keys [futures timings]}]
  (doseq [[^Future f timing] (map vector futures timings)]
    (loop []
      (when-not (.isDone f)
        (check-stop! ctx)
        (check-call-time! timing)
        (try
          (.get f poll-ms TimeUnit/MILLISECONDS)
          (catch TimeoutException _ nil)
          (catch ExecutionException _ nil))
        (recur)))
    (cp.impl/deref-fixing-exceptions f)))

;;; Proposals

(defn- new-description
  "The description proposed in `entry` when it differs from the current `description`, else nil."
  [description entry]
  (let [proposed (:description entry)]
    (when (and proposed (not= (some-> description str/trim) proposed))
      proposed)))

(defn- confidence [s]
  (#{:high :medium :low} (some-> s keyword)))

(mu/defn table-proposals :- [:sequential ::proposal/new-proposal]
  "The proposals of one classified table for the `attributes` of run `run-id`: a `data_sensitivity` proposal for
  every field whose proposed label is new or differs from the current one, a `semantic_type` proposal for every field
  whose proposed type differs from the current one, and a `description` proposal for every field whose proposed
  description differs from the current one. A human-set current value gets a proposal too; the parse never proposes a
  description for a human-set description."
  [run-id     :- ms/PositiveInt
   attributes :- [:set ::run/attribute]
   packet     :- ::context/packet
   entries    :- [:map-of :string ::llm/entry]]
  (vec
   (for [field (:fields packet)
         :let  [entry (get entries (:name field))
                {:keys [status current proposed semantic_changed]}
                (core/diff-field field entry)
                description (new-description (:description field) entry)
                base {:last_run_id run-id
                      :table_id    (get-in packet [:table :id])
                      :field_id    (:id field)
                      :confidence  (confidence (:confidence proposed))
                      :reasoning   (:reasoning proposed)}]
         p     (cond-> []
                 (and (attributes :data_sensitivity) (#{:new :disagree} status))
                 (conj (assoc base
                              :attribute      :data_sensitivity
                              :proposed_value (name (:data_sensitivity proposed))))

                 (and (attributes :semantic_type) semantic_changed
                      (not (isa? (:semantic_type current) :Relation/*)))
                 (conj (assoc base
                              :attribute      :semantic_type
                              :proposed_value (u/qualified-name (:semantic_type proposed))))

                 (and (attributes :description) description)
                 (conj (assoc base
                              :attribute      :description
                              :proposed_value description)))]
     p)))

;;; Worker

(defn- classify-table
  "Build the packet of `table`, submit its chunk calls with all Metabot permissions granted, and wait for them while
  checking for a stop. Cancels the chunks not finished on any exit. Returns the number of [[slow-calls]] with the
  result. On a failure or stop, puts the model, the usage of the chunks that finished and the slow calls in the
  `:spent` volatile of `ctx`, then rethrows."
  [{:keys [attributes] :as ctx} database table packet-opts]
  (let [packet (database-routing/with-database-routing-off
                 (context/table-packet database table packet-opts))]
    (core/assert-unique-names! table (:fields packet))
    (check-stop! ctx)
    (let [submitted (metabot/do-with-all-metabot-permissions #(llm/submit-packet packet :attributes attributes))]
      (try
        (await-chunks! ctx submitted)
        {:packet packet :classification (llm/collect-packet submitted) :slow-calls (slow-calls submitted)}
        (catch Throwable e
          (vreset! (:spent ctx) {:model      (:model submitted)
                                 :usage      (llm/completed-usage submitted)
                                 :slow-calls (slow-calls submitted)})
          (throw e))
        (finally
          (llm/cancel-packet submitted))))))

(defn- table-error
  ([table message code]
   {:table_id   (:id table)
    :table_name (:name table)
    :schema     (:schema table)
    :message    message
    :error_code code})
  ([table message code elapsed-ms]
   (assoc (table-error table message code) :elapsed_ms elapsed-ms)))

(defn- error-code [e]
  (let [{:keys [error-code type]} (ex-data e)]
    (some-> (or error-code type) u/qualified-name)))

(defn- progress [{:keys [done done-ids failed errors usage max-table-ms slow-calls] :or {max-table-ms 0 slow-calls 0}}]
  {:done_tables    done
   :done_table_ids done-ids
   :failed_tables  failed
   :table_errors   errors
   :usage          (assoc usage :max_table_ms max-table-ms :slow_calls slow-calls)})

(defn- not-processed [state tables message]
  (update state :errors into (map #(table-error % message "not_processed")) tables))

(def ^:private start-state
  {:done 0 :done-ids [] :failed 0 :errors [] :usage zero-usage})

(defn- canceled-changes
  "The changes that end a run canceled from `state`, with `tables` recorded as not processed."
  [state tables]
  (-> (not-processed state tables (tru "The run was canceled."))
      progress
      (assoc :status :canceled :message (tru "Canceled."))))

(defn- with-unprocessed-errors
  "The `table_errors` of the saved `run`, plus a `not_processed` error with `message` for each table of its scope that
  is neither in `done_table_ids` nor in `table_errors`."
  [run message]
  (let [finished (into (set (:done_table_ids run)) (map :table_id) (:table_errors run))]
    (into (vec (:table_errors run))
          (comp (remove (comp finished :id))
                (map #(table-error % message "not_processed")))
          (tables-in-scope (:database_id run) (:scope run)))))

(defn- add-spent
  "Add the usage of the chunks that finished in a table that failed or stopped, and its slow calls, from
  [[classify-table]], to `state`."
  [state {:keys [model usage slow-calls]}]
  (cond-> state
    usage      (update :usage add-usage model usage)
    slow-calls (update :slow-calls (fnil + 0) slow-calls)))

(defn- add-table-time [state elapsed-ms]
  (update state :max-table-ms (fnil max 0) elapsed-ms))

(defn- run-tables!
  "Classify `tables` in order and record each one on the run. Returns the final state, with `:end` set to how the
  run ended: `:succeeded`, `[:stopped reason]` or `[:usage-limit message]`."
  [{:keys [run-id attributes spent stop] :as ctx} database tables]
  (let [sample-error (core/sample-connection-error database nil)
        packet-opts  (cond-> {} sample-error (assoc :include-values? false))]
    (loop [state             start-state
           [table & more :as remaining] tables]
      (if-not table
        (assoc state :end :succeeded)
        (let [_       (vreset! spent nil)
              timer   (u/start-timer)
              outcome (try
                        (check-stop! ctx)
                        (let [{:keys [packet classification slow-calls]} (classify-table ctx database table packet-opts)]
                          {:usage       (:usage classification)
                           :model       (:model classification)
                           :slow-calls  slow-calls
                           :proposals   {:table_id   (:id table)
                                         :attributes attributes
                                         :proposals  (table-proposals run-id attributes packet
                                                                      (:fields classification))}})
                        (catch Exception e
                          (cond
                            (stop-reason e)         {:end [:stopped (stop-reason e)]}
                            (interrupted? e)        {:end [:stopped (or @stop :gone)]}
                            (usage-limit-message e) {:end [:usage-limit (usage-limit-message e)]}
                            :else                   {:error e})))
              elapsed (long (u/since-ms timer))]
          (if (:end outcome)
            (assoc (add-spent state @spent) :end (:end outcome) :remaining remaining)
            (let [e     (:error outcome)
                  state (if e
                          (-> (add-spent state @spent)
                              (add-table-time elapsed)
                              (update :failed inc)
                              (update :errors conj (table-error table (or (ex-message e) (str (class e))) (error-code e)
                                                                elapsed)))
                          (-> state
                              (add-table-time elapsed)
                              (update :done inc)
                              (update :done-ids conj (:id table))
                              (update :slow-calls (fnil + 0) (:slow-calls outcome))
                              (update :usage add-usage (:model outcome) (:usage outcome))))]
              (when e
                (log/warnf e "Metadata generation run %d failed for table %d" run-id (:id table)))
              (if (db/record-table! run-id (progress state) (:proposals outcome))
                (recur state more)
                (assoc state :end [:stopped :gone] :remaining more)))))))))

(defn- finish!
  "Write the terminal status of a run from the final `state` of [[run-tables!]]. A run that is `canceling` after its
  last table ends canceled. A run that ended elsewhere is left as it is."
  [run-id {:keys [end remaining] :as state}]
  (let [[kind reason] (if (keyword? end) [end] end)]
    (case kind
      :succeeded
      (when (and (zero? (db/update-run-with-status! run-id :running (assoc (progress state) :status :succeeded)))
                 (= :canceling (db/run-status run-id)))
        (db/update-run-with-status! run-id :canceling (canceled-changes state nil)))

      :stopped
      (if (= :canceled reason)
        (db/update-active-run! run-id (canceled-changes state remaining))
        (log/infof "Metadata generation run %d ended elsewhere; the worker stops" run-id))

      :usage-limit
      (db/update-active-run! run-id (-> (not-processed state remaining (tru "The AI usage limit was reached."))
                                        progress
                                        (assoc :status :usage_limit :message reason))))))

(defn- execute-run!
  "Execute the run in `ctx` over `tables`. Marks it running unless it was canceled while pending, runs the tables,
  and writes the terminal status. A cancel interrupts the worker, so the interrupt flag is cleared before the terminal
  write. An unexpected failure fails the run, unless the run was canceled."
  [{:keys [run-id stop] :as ctx} database tables]
  (try
    (if (pos? (db/update-run-with-status! run-id :pending {:status :running :started_at (OffsetDateTime/now) :last_heartbeat (OffsetDateTime/now)}))
      (let [state (run-tables! ctx database tables)]
        (Thread/interrupted)
        (finish! run-id state))
      (when (= :canceling (db/run-status run-id))
        (db/update-active-run! run-id (canceled-changes start-state tables))))
    (catch Throwable e
      (Thread/interrupted)
      (let [canceled? (= :canceled @stop)
            errors    (u/ignore-exceptions
                        (with-unprocessed-errors (db/run run-id) (if canceled?
                                                                   (tru "The run was canceled.")
                                                                   (tru "The run failed before it processed the table."))))]
        (when-not canceled?
          (log/errorf e "Metadata generation run %d failed" run-id))
        (u/ignore-exceptions
          (db/update-active-run! run-id (cond-> (if canceled?
                                                  {:status :canceled :message (tru "Canceled.")}
                                                  {:status :failed :message (or (ex-message e) (str (class e)))})
                                          errors (assoc :table_errors errors))))))
    (finally
      (swap! local-runs dissoc run-id))))

(defn- interrupt-local-run!
  "Set the stop flag of the run with `run-id` that this node executes to `reason`, and interrupt its worker."
  [run-id reason]
  (when-let [{:keys [stop future]} (get @local-runs run-id)]
    (reset! stop reason)
    (some-> ^Future future (.cancel true))))

(defn- submit-worker!
  "Run [[execute-run!]] on the worker pool as `creator-id`, so the chunk calls count against that user's usage."
  [run-id database tables attributes creator-id]
  (let [ctx {:run-id     run-id
             :attributes (set attributes)
             :stop       (atom nil)
             :last-poll  (volatile! 0)
             :spent      (volatile! nil)}]
    (swap! local-runs assoc run-id {:stop (:stop ctx)})
    (let [f (cp/future workers
                       (request/with-current-user creator-id
                         (execute-run! ctx database tables)))]
      (swap! local-runs (fn [m] (cond-> m (contains? m run-id) (assoc-in [run-id :future] f))))
      f)))

;;; Estimate

(def ^:private per-field-cost
  "Total tokens and USD per field for an attribute set: medians of a Haiku 4.5 bench over a synthetic database of
  75 tables and 1,380 fields, 3 runs each. Attribute sets with no bench row use the all-three row, the
  highest."
  {#{:data_sensitivity :semantic_type}              {:tokens 281 :cost_usd 0.00059}
   #{:data_sensitivity}                             {:tokens 253 :cost_usd 0.00051}
   #{:description}                                  {:tokens 245 :cost_usd 0.00054}
   #{:data_sensitivity :semantic_type :description} {:tokens 324 :cost_usd 0.00070}})

(mr/def ::estimate
  [:map {:closed true}
   [:table_count        ms/IntGreaterThanOrEqualToZero]
   [:field_count        ms/IntGreaterThanOrEqualToZero]
   [:total_tokens       ms/IntGreaterThanOrEqualToZero]
   [:cost_usd           number?]
   [:unavailable_reason [:maybe :keyword]]])

(mu/defn estimate :- ::estimate
  "The size of a run that [[start-run!]] would start for `request`: tables, fields, and about how many tokens and USD
  it uses. `:unavailable_reason` is why a start would fail now, or nil. Throws a 400 for the same scope errors as
  [[start-run!]]."
  [database :- (ms/InstanceOf :model/Database)
   request  :- ::start-request]
  (let [{:keys [attributes tables]} (parse-request (:id database) request)
        field-count (db/active-field-count (mapv :id tables))
        ratio       (or (per-field-cost (set attributes))
                        (per-field-cost (set run/attributes)))]
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
  `:table_ids`. `:attributes` defaults to [[llm/default-attributes]]. Returns the new run. Throws a 409 when a run is active
  for the database, and a 400 when Metabot cannot run or the scope holds no active table. The run executes as `creator-id`."
  [database   :- (ms/InstanceOf :model/Database)
   request    :- ::start-request
   creator-id :- ms/PositiveInt]
  (let [database-id (:id database)
        {:keys [scope attributes tables]} (parse-request database-id request)]
    (when (db/active-run database-id)
      (throw (conflict database-id)))
    (when-let [reason (core/unavailable-reason)]
      (throw (ex-info (tru "AI metadata generation is not available.")
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
  "Stop the run with `run-id`. A pending run becomes `canceled` at once, with the tables of its scope recorded as not
  processed. A running run becomes `canceling`; its worker, interrupted when it runs on this node, writes `canceled`
  when it stops. Returns the run after the request. Throws a 409 when the run has already ended."
  [run-id :- ms/PositiveInt]
  (when-let [run (db/run run-id)]
    (when-not (run/active-statuses (:status run))
      (throw (ex-info (tru "The run has already ended.") {:status-code 409})))
    (if (pos? (db/update-run-with-status! run-id :pending
                                          (canceled-changes start-state (tables-in-scope (:database_id run) (:scope run)))))
      (when-let [{:keys [future]} (get @local-runs run-id)]
        (swap! local-runs dissoc run-id)
        (some-> ^Future future (.cancel false)))
      (do (db/update-run-with-status! run-id :running {:status :canceling})
          (interrupt-local-run! run-id :canceled)))
    (db/run run-id)))

(mu/defn retry-failed! :- (ms/InstanceOf :model/MetadataGenerationRun)
  "Start a new run over the tables in the `table_errors` of the ended run `run` that are still active, with its
  attributes, as `creator-id`. These are the tables that failed and the tables the run did not process. Throws a 400
  when the run is active or none of these tables is active."
  [database   :- (ms/InstanceOf :model/Database)
   run        :- (ms/InstanceOf :model/MetadataGenerationRun)
   creator-id :- ms/PositiveInt]
  (when (run/active-statuses (:status run))
    (throw (core/bad-request (tru "The run has not ended."))))
  (let [active    (set (map :id (db/active-tables (:id database))))
        table-ids (into [] (comp (map :table_id) (distinct) (filter active)) (:table_errors run))]
    (when (empty? table-ids)
      (throw (core/bad-request (tru "The run has no failed tables that are still active."))))
    (start-run! database {:table_ids table-ids :attributes (:attributes run)} creator-id)))

;;; Heartbeat and reaper

(defn heartbeat-tick!
  "Heartbeat the runs this node executes. Stop and interrupt the worker of a run that is `canceling`. Stop and
  interrupt the worker of a run that is no longer active, and remove the run from the local runs, as a worker that
  never started does not remove it."
  []
  (let [ids (vec (keys @local-runs))]
    (rt/heartbeat-and-reconcile!
     {:model      :model/MetadataGenerationRun
      :active     [:is_active true]
      :ids        ids
      :heartbeat! #(rt/heartbeat-ids! :model/MetadataGenerationRun [:is_active true] :last_heartbeat %)
      :on-gone    (fn [id]
                    (interrupt-local-run! id :gone)
                    (swap! local-runs dissoc id))})
    (doseq [id (db/canceling-run-ids ids)]
      (interrupt-local-run! id :canceled))))

(defn reap-orphaned-runs!
  "Fail every active run whose heartbeat is older than `stale-minutes`, and record the tables it did not process as
  `not_processed` in its `table_errors`. Returns the reaped rows."
  [stale-minutes]
  (let [reaped (rt/reap-orphaned! {:model    :model/MetadataGenerationRun
                                   :active   [:is_active true]
                                   :stale    [{:column :last_heartbeat :age stale-minutes :unit :minute}]
                                   :terminal {:status    "failed"
                                              :ended_at  :%now
                                              :is_active nil
                                              :message   (tru "The run stopped sending heartbeats for {0} minutes; its node probably stopped."
                                                              stale-minutes)}})]
    (doseq [{run-id :id} reaped]
      (try
        (when-let [run (db/run run-id)]
          (db/update-run-with-status! run-id :failed
                                      {:table_errors (with-unprocessed-errors
                                                       run (tru "The run stopped before it processed the table."))}))
        (catch Exception e
          (log/warnf e "Could not record the unprocessed tables of reaped metadata generation run %d" run-id))))
    reaped))
