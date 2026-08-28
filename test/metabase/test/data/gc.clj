(ns metabase.test.data.gc
  "Periodic sweep of orphaned test data in our shared cloud warehouses"
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.test.data.interface :as tx]
   [metabase.util.json :as json]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private min-temp-data-hours
  "Floor on `:temp-data-hours`. Must stay above the longest driver job (90 min, in `drivers-stress-test.yml`) or we
  delete a live run's data."
  2)

(def ^:private min-fixture-hours
  "Floor on `:fixture-hours`. Runs share these datasets; collecting them hourly would make every run rebuild its data."
  24)

(def ^:private default-drivers
  "Drivers implementing [[tx/gc-orphans!]]. Athena and Databricks are excluded: their datasets are preloaded, not
  created by tests."
  [:snowflake :bigquery-cloud-sdk :redshift])

(def ^:private default-report-dir
  "Where [[write-report!]] leaves its files for the workflow to upload as an artifact."
  "target/gc-report")

(defn- parse-drivers
  "Driver keywords from a comma-separated string, defaulting to [[default-drivers]]. Blanks are dropped -- an empty
  string is truthy, and would otherwise become the nameless keyword."
  [drivers]
  (or (seq (into [] (comp (map str/trim) (remove str/blank?) (map keyword))
                 (str/split (or drivers "") #",")))
      default-drivers))

(defn- sweep-driver!
  "Sweep one driver and take a census of what is left, each best effort. A driver that cannot connect at all, or a
  census that fails, must cost neither the other drivers nor the deletions this one did manage."
  [driver options]
  (let [results   (try
                    (vec (tx/gc-orphans! driver options))
                    (catch Exception e
                      [{:name nil, :status :failed, :error (ex-message e)}]))
        remaining (try
                    (tx/count-datasets driver)
                    (catch Exception e
                      (log/errorf "[%s] could not count remaining datasets: %s" (name driver) (ex-message e))
                      {}))
        {deleted :deleted, failed :failed} (group-by :status results)]
    (log/infof "[%s] %d deleted, %d failed" (name driver) (count deleted) (count failed))
    (doseq [{dataset-name :name, :keys [error]} failed]
      (log/errorf "[%s] %s: %s" (name driver) (or dataset-name "<server unreachable>") error))
    {:driver    (name driver)
     :deleted   (vec deleted)
     :failed    (vec failed)
     :counts    {:deleted (count deleted), :failed (count failed)}
     :remaining remaining}))

(defn- build-report
  [options driver-reports]
  {:generated-at (str (java.time.Instant/now))
   :options      options
   :totals       {:deleted (reduce + (map #(get-in % [:counts :deleted]) driver-reports))
                  :failed  (reduce + (map #(get-in % [:counts :failed]) driver-reports))}
   :drivers      (vec driver-reports)})

(defn- render-names
  "A collapsed list of object names, or a note that there were none. Collapsed because a bad night can run to
  hundreds of names and the summary still has to be skimmable."
  [heading entries render-entry]
  (if (empty? entries)
    (format "%s: none\n\n" heading)
    (format "<details><summary>%s (%d)</summary>\n\n%s\n</details>\n\n"
            heading
            (count entries)
            (str/join "\n" (map render-entry entries)))))

(defn- render-object
  "One bullet for one object. Both `:server` and `:name` are absent when the driver itself could not be reached, and
  the driver is already the heading, so an absent part is dropped rather than printed as `null`."
  [{dataset-name :name, :keys [server error]}]
  (str "- "
       (str/join " — " (cond-> []
                         server       (conj (format "`%s`" server))
                         dataset-name (conj (format "`%s`" dataset-name))))
       (when (and error (or server dataset-name)) ": ")
       error))

(defn- render-driver [{:keys [driver counts remaining deleted failed]}]
  (str (format "### %s — %d deleted, %d failed\n\n" driver (:deleted counts) (:failed counts))
       (if (empty? remaining)
         "Remaining datasets: unknown\n\n"
         (str "Remaining datasets:\n\n"
              (str/join "\n" (for [[server n] (sort-by key remaining)]
                               (format "- `%s`: %s" server (if (nil? n) "unknown" n))))
              "\n\n"))
       (render-names "Deleted" deleted render-object)
       (render-names "Failed" failed render-object)))

(defn- render-markdown [{:keys [generated-at options totals drivers]}]
  (str (format "## DWH test data sweep\n\n**%d deleted, %d failed** — temp-data-hours %s, fixture-hours %s, %s\n\n"
               (:deleted totals) (:failed totals)
               (:temp-data-hours options) (:fixture-hours options) generated-at)
       (str/join (map render-driver drivers))))

(defn- write-report!
  "Leave the report where the workflow can upload it, and append the human-readable half to the job summary so the
  morning after is legible without downloading anything."
  [report dir]
  (let [markdown (render-markdown report)]
    (.mkdirs (io/file dir))
    (spit (io/file dir "report.json") (json/encode report))
    (spit (io/file dir "report.md") markdown)
    (when-let [summary-file (System/getenv "GITHUB_STEP_SUMMARY")]
      (spit summary-file markdown :append true))
    (log/infof "Wrote sweep report to %s" dir)))

(defn gc-orphans!
  "Sweep orphaned test data from each driver's shared cloud account.

  `:drivers` is a comma-separated string, defaulting to [[default-drivers]].

  `:temp-data-hours` (default 2) is the TTL for per-run garbage, `:fixture-hours` (default 72) for datasets runs
  share. Floored at [[min-temp-data-hours]] and [[min-fixture-hours]].

  `:report-dir` (default [[default-report-dir]]) receives `report.json` and `report.md`.

  Failures don't stop the sweep. They are reported per object, written to the report, and fail the job at the end."
  [{:keys [drivers temp-data-hours fixture-hours report-dir]}]
  (let [options {:temp-data-hours (or temp-data-hours min-temp-data-hours)
                 :fixture-hours   (or fixture-hours 72)}]
    (doseq [[k floor] {:temp-data-hours min-temp-data-hours, :fixture-hours min-fixture-hours}
            :let      [v (get options k)]]
      ;; whole hours, not merely numeric: the drivers interpolate these with `%d`, and a dispatch box lets someone
      ;; hand us 2.5
      (when-not (and (int? v) (>= v floor))
        (throw (ex-info (format "%s must be a whole number of hours >= %d; refusing to sweep with %s"
                                k floor (pr-str v))
                        {:option k, :value v}))))
    ;; we want the extensions, not their before-run hooks: Redshift's creates a session schema, which this job would
    ;; then leak nightly
    (binding [tx/*skip-before-run?* true]
      (let [report (build-report options (mapv #(sweep-driver! % options) (parse-drivers drivers)))]
        ;; write before throwing: the report is most wanted on the runs that fail
        (write-report! report (or report-dir default-report-dir))
        ;; fail loudly rather than going green having deleted nothing
        (when (pos? (get-in report [:totals :failed]))
          (throw (ex-info (format "%d object(s) could not be deleted"
                                  (get-in report [:totals :failed]))
                          {:errors (into [] (comp (mapcat :failed) (map :error)) (:drivers report))})))))))
