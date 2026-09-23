(ns metabase.transforms-prompt.runner
  "Runs a query transform that contains `:prompt` by evaluating the LLM outside SQL.

  The query is executed through the query processor, so each prompt column holds the rendered prompt
  text. This namespace replaces those values with the LLM's answer and writes the rows into the target
  table."
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.lib.core :as lib]
   [metabase.metabot.self :as metabot.self]
   [metabase.query-processor.core :as qp]
   [metabase.request.core :as request]
   [metabase.transforms-base.interface :as transforms-base.i]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.transforms-prompt.llm :as llm]
   [metabase.util.i18n :as i18n]
   [metabase.util.json :as json]
   [metabase.util.log :as log])
  (:import
   (java.math BigDecimal)
   (java.util.concurrent ExecutionException)))

(set! *warn-on-reflection* true)

(def ^:private max-rows 10000)

(def ^:private parallelism 8)

(def ^:private max-consecutive-failures 5)

(defn- prompt-driver-supported?
  "True when `driver` can run an MBQL transform and insert rows, which is what a prompt run needs."
  [driver database]
  (and (driver.u/supports? driver :transforms/table database)
       (driver.u/supports? driver :transforms/python database)))

(defn- unavailable-message
  [reason]
  (case reason
    :metabot-disabled  (i18n/tru "Metabot is turned off, so prompt() cannot run.")
    :no-llm            (i18n/tru "No AI provider is configured, so prompt() cannot run.")
    :usage-limit       (i18n/tru "The AI usage limit has been reached, so prompt() cannot run.")
    :permission-denied (i18n/tru "You do not have permission to use AI features, so prompt() cannot run.")
    (i18n/tru "prompt() cannot run.")))

(defn- capped-source-query
  [query]
  (let [existing (lib/current-limit query -1)
        cap      (inc max-rows)]
    (-> query
        (lib/limit -1 (if existing (min existing cap) cap))
        transforms-base.u/massage-sql-query)))

(defn- read-source-rows
  [query transform-id]
  (let [result (qp/process-query (assoc-in query [:info :transform-id] transform-id))
        rows   (mapv vec (get-in result [:data :rows]))
        cols   (get-in result [:data :cols])]
    (when (> (count rows) max-rows)
      (throw (ex-info (i18n/tru "prompt() transforms are limited to {0} rows." max-rows)
                      {:status :failed :max-rows max-rows})))
    {:rows rows :cols cols}))

(defn- prompt-columns
  "Prompt columns in `cols`, each `{:index i :output spec}` from [[lib/prompt-output]]."
  [query cols]
  (let [opts-by-name (transforms-base.u/last-stage-prompt-options query)]
    (into []
          (keep-indexed (fn [i col]
                          (when-let [opts (get opts-by-name (:name col))]
                            (let [output (lib/prompt-output opts)]
                              (when-let [message (:error output)]
                                (throw (ex-info message {:status :failed})))
                              {:index i :output output}))))
          cols)))

(defn- cache-key
  [output text]
  [(:json-schema output) text])

(defn- fatal-llm-error?
  [^Throwable e]
  (loop [e e]
    (cond
      (nil? e) false
      (#{:metabot/usage-limit-reached :metabot/permission-denied} (:type (ex-data e))) true
      :else (recur (ex-cause e)))))

(defn- unwrap-future
  [^Throwable e]
  (if (instance? ExecutionException e)
    (or (ex-cause e) e)
    e))

(defn- record-failure!
  [cache consecutive output text e]
  (log/warnf "prompt() failed for a row: %s" (ex-message e))
  (swap! cache assoc (cache-key output text) nil)
  (let [n (swap! consecutive inc)]
    (when (>= n max-consecutive-failures)
      (throw (ex-info (format "prompt() failed %d times in a row" max-consecutive-failures)
                      {:status :failed}
                      e)))))

(defn- integral-number?
  [v]
  (and (number? v)
       (or (integer? v)
           (== (double v) (Math/rint (double v))))))

(defn- parse-long-string
  [s]
  (when (re-matches #"-?\d+" s)
    (try
      (parse-long s)
      (catch Exception _
        nil))))

(defn- parse-double-string
  [s]
  (when (re-matches #"-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?" s)
    (try
      (parse-double s)
      (catch Exception _
        nil))))

(defn- parse-datetime
  [s]
  (try
    (t/local-date-time s)
    (catch Exception _
      (try
        (t/local-date-time (t/instant s) (t/zone-id "UTC"))
        (catch Exception _
          nil)))))

(defn- coerce-answer
  "Coerce an LLM answer to the column type in `output`. Returns nil on mismatch
  except for Text, which falls back to `str`."
  [output v]
  (let [base-type (:base-type output)]
    (cond
      (nil? v) nil

      (= base-type :type/Text)
      (cond
        (:json-text? output) (if (string? v) v (json/encode v))
        (string? v)          v
        :else                (str v))

      (= base-type :type/BigInteger)
      (cond
        (integer? v)         v
        (integral-number? v) (long v)
        (string? v)          (parse-long-string v)
        :else                nil)

      (= base-type :type/Float)
      (cond
        (number? v) (double v)
        (string? v) (parse-double-string v)
        :else       nil)

      (= base-type :type/Boolean)
      (cond
        (boolean? v) v
        (string? v)  ({"true" true "false" false} (str/lower-case v))
        :else        nil)

      (= base-type :type/Date)
      (when (string? v)
        (try
          (t/local-date v)
          (catch Exception _
            nil)))

      (= base-type :type/DateTime)
      (when (string? v)
        (parse-datetime v))

      :else (when (some? v) (str v)))))

(defn- coerce-answer!
  [output v mismatches]
  (let [coerced (coerce-answer output v)]
    (when (and (some? v) (nil? coerced))
      (swap! mismatches inc))
    coerced))

(defn- evaluate-pending!
  [pending cache consecutive mismatches]
  (let [futures (mapv (fn [{:keys [text output]}]
                        (future
                          (try
                            [:ok text output (llm/evaluate-prompt text output)]
                            (catch Throwable e
                              (let [e (unwrap-future e)]
                                (if (fatal-llm-error? e)
                                  (throw e)
                                  [:fail text output e]))))))
                      pending)]
    (doseq [result (map deref futures)]
      (case (first result)
        :ok (let [[_ text output value] result]
              (reset! consecutive 0)
              (swap! cache assoc (cache-key output text) (coerce-answer! output value mismatches)))
        :fail (let [[_ text output e] result]
                (record-failure! cache consecutive output text e))))))

(defn- fill-chunk
  [rows columns cache consecutive mismatches]
  (let [pending (into []
                      (comp (mapcat (fn [row]
                                      (keep (fn [{:keys [index output]}]
                                              (let [text (nth row index)]
                                                (when (and (some? text)
                                                           (not (contains? @cache (cache-key output text))))
                                                  {:text text :output output})))
                                            columns)))
                            (distinct))
                      rows)]
    (evaluate-pending! pending cache consecutive mismatches)
    (mapv (fn [row]
            (reduce (fn [row {:keys [index output]}]
                      (let [text (nth row index)]
                        (assoc row index (when (some? text)
                                           (get @cache (cache-key output text))))))
                    (vec row)
                    columns))
          rows)))

(defn- fill-prompt-columns
  [rows columns cancelled?]
  (if (empty? columns)
    (vec rows)
    (let [cache       (atom {})
          consecutive (atom 0)
          mismatches  (atom 0)
          filled      (into []
                            (mapcat (fn [chunk]
                                      (when (and cancelled? (cancelled?))
                                        (throw (ex-info "Transform cancelled" {:status :cancelled})))
                                      (fill-chunk chunk columns cache consecutive mismatches)))
                            (partition-all parallelism rows))]
      (when (pos? @mismatches)
        (log/warnf "prompt() wrote NULL for %d values that did not match the requested type" @mismatches))
      filled)))

(defn- root-type
  [base-type]
  (when base-type
    (some #(when (isa? base-type %) %)
          [:type/Number :type/Date :type/DateTime :type/Instant
           :type/DateTimeWithTZ :type/Text :type/Boolean])))

(defn- insert-type
  [base-type output]
  (cond
    output                (:base-type output)
    (root-type base-type) base-type
    :else                 :type/Text))

(defn- fixup-value
  [original-type prompt? v]
  (cond
    (nil? v) nil
    prompt? v
    (nil? (root-type original-type)) (str v)
    (and (isa? original-type :type/Integer)
         (or (instance? BigDecimal v) (float? v)))
    (bigint v)
    :else v))

(defn- column-definitions
  [cols prompt-cols]
  (let [output-by-index (into {} (map (juxt :index :output) prompt-cols))]
    (mapv (fn [i {:keys [name base_type]}]
            {:name      name
             :type      (insert-type base_type (get output-by-index i))
             :nullable? true})
          (range)
          cols)))

(defn- prepare-rows
  [rows cols prompt-cols]
  (let [prompt? (set (map :index prompt-cols))]
    (mapv (fn [row]
            (mapv (fn [i col v]
                    (fixup-value (:base_type col) (contains? prompt? i) v))
                  (range) cols row))
          rows)))

(defn- table-definition
  [table-name columns indexes]
  (cond-> {:name table-name :columns columns}
    (seq indexes) (assoc :indexes indexes)))

(defn- create-and-insert!
  [driver db-id definition rows]
  (transforms-base.u/create-table-from-schema! driver db-id definition)
  (driver/insert-from-source! driver db-id definition {:type :rows :data rows}))

(defn- drop-quietly!
  [driver db-id table-name]
  (try
    (transforms-base.u/drop-table! driver db-id table-name)
    (catch Exception _)))

(defn- fresh-temp-name
  [driver schema avoid]
  (loop []
    (let [candidate (transforms-base.u/temp-table-name driver schema)]
      (if (= candidate avoid)
        (do (Thread/sleep 1) (recur))
        candidate))))

(defn- transfer-with-rename-tables!
  [driver db-id table-name columns rows indexes]
  (let [source-name (transforms-base.u/temp-table-name driver (namespace table-name))
        holding     (fresh-temp-name driver (namespace table-name) source-name)]
    (try
      (create-and-insert! driver db-id (table-definition source-name columns indexes) rows)
      (transforms-base.u/rename-tables! driver db-id {table-name  holding
                                                      source-name table-name})
      (transforms-base.u/drop-table! driver db-id holding)
      (catch Exception e
        (drop-quietly! driver db-id source-name)
        (throw e)))))

(defn- transfer-with-create-drop-rename!
  [driver db-id table-name columns rows indexes]
  (let [source-name (transforms-base.u/temp-table-name driver (namespace table-name))]
    (try
      (create-and-insert! driver db-id (table-definition source-name columns indexes) rows)
      (transforms-base.u/drop-table! driver db-id table-name)
      (driver/rename-table! driver db-id source-name table-name)
      (catch Exception e
        (drop-quietly! driver db-id source-name)
        (throw e)))))

(defn- transfer-with-drop-create!
  [driver db-id table-name columns rows indexes]
  (transforms-base.u/drop-table! driver db-id table-name)
  (create-and-insert! driver db-id (table-definition table-name columns indexes) rows))

(defn- transfer-table!
  [driver database transform columns rows]
  (let [db-id       (:id database)
        target      (:target transform)
        table-name  (transforms-base.u/qualified-table-name driver target)
        table-index (:indexes target)]
    (if-not (transforms-base.u/target-table-exists? transform)
      (create-and-insert! driver db-id (table-definition table-name columns table-index) rows)
      (cond
        (driver.u/supports? driver :atomic-renames database)
        (transfer-with-rename-tables! driver db-id table-name columns rows table-index)

        (driver.u/supports? driver :rename database)
        (transfer-with-create-drop-rename! driver db-id table-name columns rows table-index)

        :else
        (transfer-with-drop-create! driver db-id table-name columns rows table-index)))))

(defn- ensure-schema!
  [driver db-id database target]
  (when (and (not (str/blank? (:schema target)))
             (not (driver/schema-exists? driver db-id (:schema target))))
    (driver/create-schema-if-needed! driver (driver/connection-spec driver database) (:schema target))))

(defn- run-prompt-transform!
  [{:keys [id source target] :as transform} {:keys [cancelled? run-user-id]}]
  (when-let [message (transforms-base.u/prompt-usage-error transform)]
    (throw (ex-info message {:status :failed})))
  (let [db-id    (get-in source [:query :database])
        database (transforms-base.u/query-transform-database transform)
        driver   (:engine database)]
    (when-not database
      (throw (ex-info "Source database for this transform has been deleted."
                      {:transform-id id :source-database-id db-id :status :failed})))
    (transforms-base.u/throw-if-db-routing-enabled! transform database)
    (when-not (prompt-driver-supported? driver database)
      (throw (ex-info (i18n/tru "This database does not support prompt() transforms.")
                      {:driver driver :status :failed})))
    (when-not run-user-id
      (throw (ex-info (i18n/tru "prompt() transforms need a user to run as.")
                      {:transform-id id :status :failed})))
    (request/with-current-user run-user-id
      (when-let [reason (metabot.self/llm-call-unavailable-reason :permission/metabot-other-tools)]
        (throw (ex-info (unavailable-message reason) {:reason reason :status :failed})))
      (when (and cancelled? (cancelled?))
        (throw (ex-info "Transform cancelled before start" {:status :cancelled})))
      (ensure-schema! driver db-id database target)
      (let [source-query (:query source)
            {:keys [rows cols]} (read-source-rows (capped-source-query source-query) id)
            prompt-cols (prompt-columns source-query cols)
            filled      (fill-prompt-columns rows prompt-cols cancelled?)
            prepared    (prepare-rows filled cols prompt-cols)]
        (transfer-table! driver database transform
                         (column-definitions cols prompt-cols)
                         prepared)
        {:status :succeeded
         :result {:rows-affected (count prepared)}}))))

(defn- execute-prompt-query!
  [transform opts]
  (try
    (run-prompt-transform! transform opts)
    (catch Exception e
      (let [data (ex-data e)]
        (if (= :cancelled (:status data))
          {:status :cancelled :error e}
          (do
            (log/errorf "Error executing prompt transform: %s" (ex-message e))
            {:status :failed :error e}))))))

(defmethod transforms-base.i/execute-prompt-base! :query
  [transform opts]
  (execute-prompt-query! transform opts))
