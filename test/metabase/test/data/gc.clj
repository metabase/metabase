(ns metabase.test.data.gc
  "Periodic sweep of orphaned test data in our shared cloud warehouses"
  (:require
   [clojure.string :as str]
   [metabase.test.data.interface :as tx]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private min-temp-data-hours
  "Floor on `:temp-data-hours`. Must stay above the longest driver job (70 min) or we delete a live run's data."
  2)

(def ^:private min-fixture-hours
  "Floor on `:fixture-hours`. Runs share these datasets; collecting them hourly would make every run rebuild its data."
  24)

(def ^:private default-drivers
  "Drivers implementing [[tx/gc-orphans!]]. Athena and Databricks are excluded: their datasets are preloaded, not
  created by tests."
  [:snowflake :bigquery-cloud-sdk :redshift])

(defn- parse-drivers
  "Driver keywords from a comma-separated string, defaulting to [[default-drivers]]. Blanks are dropped -- an empty
  string is truthy, and would otherwise become the nameless keyword."
  [drivers]
  (or (seq (into [] (comp (map str/trim) (remove str/blank?) (map keyword))
                 (str/split (or drivers "") #",")))
      default-drivers))

(defn- report!
  "Log and summarize one driver's results, returning the exceptions among them."
  [driver results]
  (let [{failures true, collected false} (group-by #(instance? Exception %) results)]
    (log/infof "[%s] %d collected, %d failed%s"
               (name driver) (count collected) (count failures)
               (if (seq collected) (str ": " (str/join ", " collected)) ""))
    (doseq [^Exception e failures]
      (log/errorf "[%s] %s" (name driver) (ex-message e)))
    ;; so the morning after is legible without digging through logs
    (when-let [summary-file (System/getenv "GITHUB_STEP_SUMMARY")]
      (spit summary-file
            (format "- **%s** — %d collected, %d failed\n" (name driver) (count collected) (count failures))
            :append true))
    failures))

(defn gc-orphans!
  "Sweep orphaned test data from each driver's shared cloud account.

  `:drivers` is a comma-separated string, defaulting to [[default-drivers]].

  `:temp-data-hours` (default 2) is the TTL for per-run garbage, `:fixture-hours` (default 72) for datasets runs
  share. Floored at [[min-temp-data-hours]] and [[min-fixture-hours]].

  Failures don't stop the sweep, but they are reported per object and fail the job at the end."
  [{:keys [drivers temp-data-hours fixture-hours]}]
  (let [options {:temp-data-hours (or temp-data-hours min-temp-data-hours)
                 :fixture-hours   (or fixture-hours 72)}]
    (doseq [[k floor] {:temp-data-hours min-temp-data-hours, :fixture-hours min-fixture-hours}
            :let      [v (get options k)]]
      (when-not (and (number? v) (>= v floor))
        (throw (ex-info (format "%s must be a number of hours >= %d; refusing to sweep with %s"
                                k floor (pr-str v))
                        {:option k, :value v}))))
    ;; we want the extensions, not their before-run hooks: Redshift's creates a session schema, which this job would
    ;; then leak nightly
    (binding [tx/*skip-before-run?* true]
      (let [failures (into [] (mapcat #(report! % (tx/gc-orphans! % options))) (parse-drivers drivers))]
        ;; fail loudly rather than going green having deleted nothing
        (when (seq failures)
          (throw (ex-info (format "%d object(s) could not be deleted" (count failures))
                          {:errors (mapv ex-message failures)})))))))
