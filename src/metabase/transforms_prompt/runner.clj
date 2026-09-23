(ns metabase.transforms-prompt.runner
  "Runs a query transform that contains `:prompt` by evaluating the LLM outside SQL.

  The query is executed through the query processor, so each prompt column holds the rendered prompt
  text. This namespace replaces those values with the LLM's answer and writes the rows into the target
  table."
  (:require
   [clojure.string :as str]
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

(defn- prompt-column-indexes
  [query cols]
  (let [names (transforms-base.u/last-stage-prompt-names query)]
    (into []
          (keep-indexed (fn [i col]
                          (when (contains? names (:name col))
                            i)))
          cols)))

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
  [cache consecutive text e]
  (log/warnf "prompt() failed for a row: %s" (ex-message e))
  (swap! cache assoc text nil)
  (let [n (swap! consecutive inc)]
    (when (>= n max-consecutive-failures)
      (throw (ex-info (format "prompt() failed %d times in a row" max-consecutive-failures)
                      {:status :failed}
                      e)))))

(defn- evaluate-pending!
  [texts cache consecutive]
  (let [futures (mapv (fn [text]
                        (future
                          (try
                            [:ok text (llm/evaluate-prompt text)]
                            (catch Throwable e
                              (let [e (unwrap-future e)]
                                (if (fatal-llm-error? e)
                                  (throw e)
                                  [:fail text e]))))))
                      texts)]
    (doseq [result (map deref futures)]
      (case (first result)
        :ok (let [[_ text value] result]
              (reset! consecutive 0)
              (swap! cache assoc text value))
        :fail (let [[_ text e] result]
                (record-failure! cache consecutive text e))))))

(defn- fill-chunk
  [rows indexes cache consecutive]
  (let [pending (into []
                      (comp (mapcat (fn [row] (map #(nth row %) indexes)))
                            (remove nil?)
                            (distinct)
                            (remove #(contains? @cache %)))
                      rows)]
    (evaluate-pending! pending cache consecutive)
    (mapv (fn [row]
            (reduce (fn [row idx]
                      (let [text (nth row idx)]
                        (assoc row idx (when (some? text) (get @cache text)))))
                    (vec row)
                    indexes))
          rows)))

(defn- fill-prompt-columns
  [rows indexes cancelled?]
  (if (empty? indexes)
    (vec rows)
    (let [cache        (atom {})
          consecutive  (atom 0)]
      (into []
            (mapcat (fn [chunk]
                      (when (and cancelled? (cancelled?))
                        (throw (ex-info "Transform cancelled" {:status :cancelled})))
                      (fill-chunk chunk indexes cache consecutive)))
            (partition-all parallelism rows)))))

(defn- root-type
  [base-type]
  (when base-type
    (some #(when (isa? base-type %) %)
          [:type/Number :type/Date :type/DateTime :type/Instant
           :type/DateTimeWithTZ :type/Text :type/Boolean])))

(defn- insert-type
  [base-type prompt?]
  (cond
    prompt?                    :type/Text
    (root-type base-type)      base-type
    :else                      :type/Text))

(defn- fixup-value
  [original-type prompt? v]
  (cond
    (nil? v) nil
    prompt? (str v)
    (nil? (root-type original-type)) (str v)
    (and (isa? original-type :type/Integer)
         (or (instance? BigDecimal v) (float? v)))
    (bigint v)
    :else v))

(defn- column-definitions
  [cols prompt-indexes]
  (let [prompt? (set prompt-indexes)]
    (mapv (fn [i {:keys [name base_type]}]
            {:name      name
             :type      (insert-type base_type (contains? prompt? i))
             :nullable? true})
          (range)
          cols)))

(defn- prepare-rows
  [rows cols prompt-indexes]
  (let [prompt? (set prompt-indexes)]
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
            indexes  (prompt-column-indexes source-query cols)
            filled   (fill-prompt-columns rows indexes cancelled?)
            prepared (prepare-rows filled cols indexes)]
        (transfer-table! driver database transform
                         (column-definitions cols indexes)
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
