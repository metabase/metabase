(ns metabase.test.data.gc
  "Entry point for the nightly sweep of orphaned test data in our shared cloud warehouses, driven by
  `.github/workflows/test.cleanup-dwh-data.yml`.

  This does the cleanup the test suite would like to do itself but can't be trusted to: [[tx/after-run]] never fires
  when a CI job is cancelled, times out, or is killed, and per-driver in-process cleanup has repeatedly been disabled
  for making CI flaky. What leaks costs real money -- a stranded Snowflake database can hold a dynamic table that
  Snowflake goes on refreshing every minute forever.

    clojure -X:dev:drivers:drivers-dev:test metabase.test.data.gc/gc-orphans! :dry-run? true"
  (:require
   [clojure.string :as str]
   [metabase.test.data.interface :as tx]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private min-hours
  "Floor on both thresholds. The longest driver job runs 70 minutes (BigQuery) before hitting its own timeout, so a
  sweep below roughly that can delete a live run's objects out from under it. A typo in the workflow-dispatch form
  shouldn't be able to reach past that guarantee."
  2)

(defn- report! [driver collected dry-run?]
  (let [verb (if dry-run? "would be collected" "collected")]
    (log/infof "[%s] %d object(s) %s%s"
               (name driver) (count collected) verb
               (if (seq collected) (str ": " (str/join ", " collected)) ""))
    ;; a job that deletes things from a shared account should be legible the next morning without digging into logs
    (when-let [summary-file (System/getenv "GITHUB_STEP_SUMMARY")]
      (spit summary-file (format "- **%s** — %d %s\n" (name driver) (count collected) verb) :append true))))

(defn gc-orphans!
  "Sweep orphaned test data from each driver's shared cloud account.

  `:drivers` is a comma-separated string, defaulting to every driver implementing [[tx/gc-orphans!]] -- Athena and
  Databricks are absent on purpose, their datasets being preloaded rather than created by tests.

  `:older-than-hours` (default 2) is the TTL for per-run garbage; `:fixture-hours` (default 72) the TTL for
  content-addressed datasets that runs deliberately share, since collecting those as eagerly would make every run
  rebuild its data from scratch. Both are floored at [[min-hours]].

  `:dry-run?` reports what would go without deleting anything.

  Enumeration failures -- bad credentials, an unreachable warehouse -- propagate and fail the job. Failures to drop an
  individual object are logged and skipped by the driver implementations, on the grounds that the usual cause is
  another run having dropped the same object concurrently."
  [{:keys [drivers older-than-hours fixture-hours dry-run?]}]
  (let [options {:older-than-hours (or older-than-hours min-hours)
                 :fixture-hours    (or fixture-hours 72)
                 :dry-run?         (boolean dry-run?)}]
    (doseq [k [:older-than-hours :fixture-hours]
            :let [v (get options k)]]
      (when-not (and (number? v) (>= v min-hours))
        (throw (ex-info (format "%s must be a number of hours >= %d; refusing to sweep with %s"
                                k min-hours (pr-str v))
                        {:option k, :value v}))))
    ;; loading test extensions normally fires each driver's before-run hook, which for Redshift drops schemas and
    ;; creates a session schema -- destructive even under :dry-run?, and a fresh leak every night. We only want the
    ;; extensions themselves here.
    (binding [tx/*skip-before-run?* true]
      (doseq [driver (map (comp keyword str/trim)
                          (str/split (or drivers "snowflake,bigquery-cloud-sdk,redshift") #","))]
        (report! driver (tx/gc-orphans! driver options) (:dry-run? options))))))
