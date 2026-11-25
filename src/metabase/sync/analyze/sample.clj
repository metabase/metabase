(ns metabase.sync.analyze.sample
  "The one place sync takes a sample of a table's rows for fingerprints. It uses the driver's
  [[driver/table-random-sample]] only when the driver supports `:table-random-sample`, and otherwise the driver's
  [[driver/table-rows-sample]], as before. The choice is made here, not by method dispatch, so that a driver that
  derives from one with the new method still gets its own `table-rows-sample`."
  (:require
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
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

(defn- first-rows
  "The sample of `table` from the driver's [[driver/table-rows-sample]], with today's arguments."
  [driver table fields rff opts]
  {:method :unspecified
   :result (driver/table-rows-sample driver table fields rff (perf/select-keys opts [:truncation-size]))})

(defn- better-sample-allowed?
  "Whether sync asks the driver of `table` for a better sample: the driver supports it for itself, it did not fail for
  this Database in this run, and the table has more rows than the sample would read."
  [driver table opts]
  (and (driver.u/supports? driver :table-random-sample (driver.u/lib-database (:db_id table)))
       (not (some-> *databases-without-better-sample* deref (contains? (:db_id table))))
       (not (some-> (:row-count opts) (<= (:rows opts))))))

(defn- turn-off-better-sample!
  "Stop asking for a better sample of the tables of the Database of `table` for the rest of this run."
  [table]
  (some-> *databases-without-better-sample* (swap! conj (:db_id table))))

(defn- better-sample
  "The driver's better sample of `table`, or nil when it fails or takes longer than the time limit, which is logged and
  turns the better sample off for the Database for the rest of the run."
  [driver table fields rff opts]
  (let [limit-ms (* 1000 (sync.settings/fingerprint-sample-timeout-seconds))
        sample   (future (driver/table-random-sample driver table fields rff opts))
        result   (try
                   (deref sample limit-ms ::timed-out)
                   (catch java.util.concurrent.ExecutionException e
                     (let [cause (or (ex-cause e) e)]
                       (when (sync-util/transient-exception? cause)
                         (throw cause))
                       cause)))]
    (cond
      (= ::timed-out result)
      (do (future-cancel sample)
          (log/warnf "The better sample of %s took longer than %d s; reading the first rows of the tables of its database for the rest of this sync."
                     (sync-util/name-for-logging table) (quot limit-ms 1000))
          (turn-off-better-sample! table)
          nil)

      (instance? Throwable result)
      (do (log/warnf result "The better sample of %s failed; reading the first rows of the tables of its database for the rest of this sync."
                     (sync-util/name-for-logging table))
          (turn-off-better-sample! table)
          nil)

      :else
      result)))

(defn sample
  "Reduce with `rff` a sample of the rows of `fields` of `table`, and return
  `{:method m, :fraction f, :runs n, :result <what rff returned>}` (`:fraction` and `:runs` when the driver gives
  them). The sample is the driver's better one when [[better-sample-allowed?]], and otherwise, or when that fails, the
  driver's [[driver/table-rows-sample]], whose method is `:unspecified`.

  `opts` takes `:truncation-size`; this adds `:rows`, the sample size, and `:row-count`, the row count estimate of
  `table`."
  [table fields rff opts]
  (let [driver (driver.u/database->driver (:db_id table))
        opts   (assoc opts
                      :rows      sample-rows
                      :row-count (:estimated_row_count table))]
    (or (when (better-sample-allowed? driver table opts)
          (better-sample driver table fields rff opts))
        (first-rows driver table fields rff opts))))
