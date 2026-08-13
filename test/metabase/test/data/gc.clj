(ns metabase.test.data.gc
  "Entry point for the nightly sweep of orphaned test data in our shared cloud warehouses, driven by
  `.github/workflows/test.cleanup-dwh-data.yml`.

  Test runs normally clean up after themselves in [[metabase.test.data.interface/after-run]], but that hook never
  fires when a CI job is cancelled, times out, or is killed, and what it leaves behind costs real money -- a leaked
  Snowflake database can hold a dynamic table that Snowflake goes on refreshing every minute forever. Per-driver
  in-process cleanup has repeatedly been disabled for making CI flaky (see
  [[metabase.test.data.snowflake/delete-old-test-data!]] and [[metabase.test.data.bigquery-cloud-sdk/create-db!]]), so
  this sweep runs out of band instead, where it can be as aggressive as we like without any risk of failing an
  unrelated test run.

  Run it from the CLI:

    clojure -X:dev:drivers:drivers-dev:test metabase.test.data.gc/gc-orphans! :dry-run? true
    clojure -X:dev:drivers:drivers-dev:test metabase.test.data.gc/gc-orphans! :drivers '\"snowflake,redshift\"'"
  (:require
   [clojure.string :as str]
   [metabase.test.data.interface :as tx]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private default-drivers
  "Drivers that implement [[tx/gc-orphans!]].

  Athena and Databricks are deliberately absent and must stay that way: both default `*allow-database-creation*` to
  false and run against preloaded datasets, so nothing there was created by a test run and nothing there is safe for
  a sweep to delete."
  [:snowflake :bigquery-cloud-sdk :redshift])

(def ^:private default-older-than-hours
  "How old per-run garbage must be before the sweep collects it. Every leaked object of this kind is pure waste, so
  this wants to be as low as it can safely go: above the longest driver job's `timeout-minutes` (70, BigQuery) plus
  runner queueing, so that a job still in flight can never have its own objects deleted out from under it."
  2)

(def ^:private default-fixture-hours
  "How old a *reusable* test dataset must be before the sweep collects it. Content-addressed `sha_` datasets on
  Snowflake and BigQuery are shared fixtures that runs deliberately reuse rather than garbage, and are stranded only
  when a dataset definition changes. Collecting them as aggressively as per-run garbage would make every run rebuild
  its datasets from scratch and would reintroduce the concurrent half-created-dataset races that hashing them exists
  to prevent."
  72)

(defn- log! [fmt & args]
  ;; `log/info` on an already-formatted string rather than `println`, which is a discouraged var outside the
  ;; explicitly printable namespaces. The durable record of a sweep is the step summary, not this.
  (log/info (apply format fmt args)))

(defn- parse-drivers [drivers]
  (cond
    (nil? drivers)    default-drivers
    (string? drivers) (into [] (comp (map str/trim) (remove str/blank?) (map keyword))
                            (str/split drivers #","))
    (coll? drivers)   (mapv keyword drivers)
    :else             [(keyword drivers)]))

(defn- sweep-driver!
  "Sweep one driver, returning its report augmented with `:driver`, plus `:error` if the sweep itself blew up.

  A driver that throws outright -- bad credentials, unreachable warehouse -- must not stop the other drivers from
  being swept, so it is caught here and surfaced in the exit code instead."
  [driver options]
  (log! "[%s] sweeping (older-than-hours=%d, fixture-hours=%d, dry-run=%s)..."
        (name driver) (:older-than-hours options) (:fixture-hours options) (boolean (:dry-run? options)))
  (try
    (let [{:keys [found dropped failed] :as report} (tx/gc-orphans! driver options)]
      (doseq [object-name found]
        (log! "[%s]   found:   %s" (name driver) object-name))
      (doseq [object-name dropped]
        (log! "[%s]   dropped: %s" (name driver) object-name))
      (doseq [failure failed]
        (log! "[%s]   FAILED:  %s -- %s" (name driver) (:name failure) (:error failure)))
      (log! "[%s] found %d, dropped %d, failed %d"
            (name driver) (count found) (count dropped) (count failed))
      (assoc report :driver driver))
    (catch Throwable e
      (log! "[%s] SWEEP FAILED: %s" (name driver) (ex-message e))
      (assoc tx/empty-gc-report :driver driver :error (ex-message e)))))

(defn- step-summary
  "Markdown summary of the sweep, for `$GITHUB_STEP_SUMMARY`. A job that deletes things from a shared account is only
  as useful as it is reviewable the next morning."
  [reports dry-run?]
  (str/join
   "\n"
   (concat [(format "## Orphaned test data sweep%s" (if dry-run? " (dry run -- nothing deleted)" ""))
            ""
            "| driver | found | dropped | failed |"
            "| --- | ---: | ---: | ---: |"]
           (for [{:keys [driver found dropped failed error]} reports]
             (if error
               (format "| %s | | | **sweep failed: %s** |" (name driver) error)
               (format "| %s | %d | %d | %d |" (name driver) (count found) (count dropped) (count failed))))
           [""]
           (for [{:keys [driver dropped]} reports
                 object-name              dropped]
             (format "- `%s` %s" (name driver) object-name)))))

(defn- write-step-summary! [reports dry-run?]
  (when-let [summary-file (System/getenv "GITHUB_STEP_SUMMARY")]
    (spit summary-file (str (step-summary reports dry-run?) "\n") :append true)))

(defn gc-orphans!
  "Sweep orphaned test data from every requested driver's shared cloud account.

  Options (all optional):

    :drivers          -- comma-separated string or vector; defaults to [[default-drivers]]
    :older-than-hours -- per-run garbage TTL, defaults to [[default-older-than-hours]]
    :fixture-hours    -- reusable dataset TTL, defaults to [[default-fixture-hours]]
    :dry-run?         -- enumerate and report without deleting anything

  Exits non-zero if any driver's sweep threw, so the nightly job goes red on broken credentials rather than
  silently sweeping nothing forever. Individual objects that couldn't be dropped are reported but do NOT fail the
  job -- that is usually just another run having dropped the same object concurrently."
  [{:keys [drivers older-than-hours fixture-hours dry-run?]}]
  (let [options {:older-than-hours (or older-than-hours default-older-than-hours)
                 :fixture-hours    (or fixture-hours default-fixture-hours)
                 :dry-run?         (boolean dry-run?)}
        reports (mapv #(sweep-driver! % options) (parse-drivers drivers))
        broken  (filter :error reports)]
    (log! "Swept %d driver(s): %d object(s) %s, %d failure(s)."
          (count reports)
          (transduce (map (comp count :dropped)) + reports)
          (if dry-run? "would be dropped" "dropped")
          (transduce (map (comp count :failed)) + reports))
    (write-step-summary! reports (boolean dry-run?))
    (when (seq broken)
      (log! "Sweep failed for: %s" (str/join ", " (map (comp name :driver) broken)))
      (System/exit 1))))
