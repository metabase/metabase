(ns metabase.sync.analyze.sample
  "The one place sync takes a sample of a table's rows for fingerprints. It uses the driver's
  [[driver/table-random-sample]] only when the driver supports `:table-random-sample`, and otherwise the driver's
  [[driver/table-rows-sample]], as before. The choice is made here, not by method dispatch, so that a driver that
  derives from one with the new method still gets its own `table-rows-sample`."
  (:require
   [clojure.core.async :as a]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.sync.settings :as sync.settings]
   [metabase.sync.util :as sync-util]
   [metabase.util.log :as log]
   [metabase.util.performance :as perf]))

(set! *warn-on-reflection* true)

;; A sync run can bind this to an atom, so that a better sample that failed or took too long for a Database is not
;; tried again for that Database in the same run. It must be dynamic: the run binds it once, and the fingerprint step
;; reaches it through several calls that do not pass state.
#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic *databases-without-better-sample*
  "An atom of the ids of the Databases whose better sample failed in this sync run, or nil outside a run."
  nil)

(defn do-with-better-sample-run
  "Run `thunk` as one sync run for [[*databases-without-better-sample*]], unless one is running already."
  [thunk]
  (if *databases-without-better-sample*
    (thunk)
    (binding [*databases-without-better-sample* (atom #{})]
      (thunk))))

(def ^:private sample-rows
  "About how many rows a sample reads: as many as the first-rows sample of `table-rows-sample` reads."
  10000)

(defn first-rows-sample
  "The sample of `table` from the driver's [[driver/table-rows-sample]], with today's arguments."
  [table fields rff opts]
  {:method :unspecified
   :result (driver/table-rows-sample (driver.u/database->driver (:db_id table)) table fields rff
                                     (perf/select-keys opts [:truncation-size]))})

(defn- better-sample-allowed?
  "Whether sync asks the driver of `table` for a better sample: the table has more rows than the sample would read,
  the better sample did not fail for this Database in this run, and the driver supports it for itself, with a
  [[driver/table-random-sample]] of its own. The last check comes last, since it reads the Database."
  [driver table opts]
  (and (not (some-> (:row-count opts) (<= (:rows opts))))
       (not (some-> *databases-without-better-sample* deref (contains? (:db_id table))))
       (contains? (methods driver/table-random-sample) driver)
       (driver.u/supports? driver :table-random-sample (driver.u/lib-database (:db_id table)))))

(defn- turn-off-better-sample!
  "Stop asking for a better sample of the tables of the Database of `table` for the rest of this run."
  [table]
  (some-> *databases-without-better-sample* (swap! conj (:db_id table))))

(defn- declined?
  "Whether the driver declined to give a better sample of a table: `{:method :first-rows}` with no `:result`."
  [result]
  (and (map? result)
       (= :first-rows (:method result))
       (not (contains? result :result))))

(defn- valid-sample?
  "Whether `result` has the shape [[driver/table-random-sample]] promises."
  [result]
  (and (map? result)
       (keyword? (:method result))
       (contains? result :result)
       (or (nil? (:fraction result)) (number? (:fraction result)))
       (or (nil? (:runs result)) (int? (:runs result)))))

(defn- better-sample
  "The driver's better sample of `table`, or nil when it fails, gives a wrong shape, or takes longer than the time
  limit, which is logged and turns the better sample off for the Database for the rest of the run. A slow sample is
  canceled through the query processor's cancel channel, which cancels its statement. An Error, an interrupt and an
  unreachable warehouse still fail the step."
  [driver table fields rff opts]
  (let [limit-ms (* 1000 (sync.settings/fingerprint-sample-timeout-seconds))
        cancel   (a/promise-chan)
        sample   (future
                   (binding [qp.pipeline/*canceled-chan* cancel]
                     (driver/table-random-sample driver table fields rff opts)))
        result   (try
                   (deref sample limit-ms ::timed-out)
                   (catch java.util.concurrent.ExecutionException e
                     (or (ex-cause e) e))
                   (finally
                     (when-not (realized? sample)
                       (a/put! cancel ::timed-out)
                       (future-cancel sample))))
        give-up  (fn [message & args]
                   (log/warnf "%s; reading the first rows of the tables of its database for the rest of this sync."
                              (apply format message args))
                   (turn-off-better-sample! table)
                   nil)]
    (cond
      (= ::timed-out result)
      (give-up "The better sample of %s took longer than %d s" (sync-util/name-for-logging table) (quot limit-ms 1000))

      (instance? Throwable result)
      (do (sync-util/rethrow-fatal result)
          (when (sync-util/transient-exception? result)
            (throw result))
          (log/warn result "The better sample failed")
          (give-up "The better sample of %s failed" (sync-util/name-for-logging table)))

      (declined? result)
      result

      (not (valid-sample? result))
      (give-up "The better sample of %s gave %s, not a map with a keyword :method and a :result"
               (sync-util/name-for-logging table) (pr-str (dissoc result :result)))

      :else
      result)))

(defn sample
  "Reduce with `rff` a sample of the rows of `fields` of `table`, and return
  `{:method m, :fraction f, :runs n, :result <what rff returned>}` (`:fraction` and `:runs` when the driver gives
  them). The sample is the driver's better one when [[better-sample-allowed?]], and otherwise, or when that fails,
  [[first-rows-sample]], whose method is `:unspecified`. When the driver declines for the table, the sample is
  [[first-rows-sample]], read outside the time limit, with the method `:first-rows`.

  `opts` takes `:truncation-size`; this adds `:rows`, the sample size, and `:row-count`, the row count estimate of
  `table`, or nil when there is none, which the driver must handle."
  [table fields rff opts]
  (let [driver (driver.u/database->driver (:db_id table))
        opts   (assoc opts
                      :rows      sample-rows
                      :row-count (:estimated_row_count table))
        better (when (better-sample-allowed? driver table opts)
                 (better-sample driver table fields rff opts))]
    (cond
      (declined? better) (assoc (first-rows-sample table fields rff opts) :method :first-rows)
      better             better
      :else              (first-rows-sample table fields rff opts))))
