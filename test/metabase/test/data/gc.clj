(ns metabase.test.data.gc
  "Periodic sweep of orphaned test data in our shared cloud warehouses"
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [com.climate.claypoole :as cp]
   [metabase.test.data.interface :as tx]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

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

(defn- census!
  "Datasets on each of a driver's servers, best effort: a count we cannot take must not cost us the sweep.

  Runs on its own thread, which is why the skip is bound here rather than around the whole job: a `binding` does not
  reach pool threads, and losing it would let Redshift's before-run hook create the very session schema this job
  would then leak nightly."
  [driver]
  (binding [tx/*skip-before-run?* true]
    (try
      (tx/count-datasets driver)
      (catch Exception e
        (tx/print-progress! driver "could not count datasets: %s" (ex-message e))
        {}))))

(defn- log-census!
  "One line per driver before anything is deleted, so a run that is killed partway still says what it was up against."
  [driver->counts]
  (doseq [[driver counts] driver->counts]
    (tx/print-progress! driver "%s dataset(s) before sweep%s"
                        (if (empty? counts) "unknown" (reduce + 0 (remove nil? (vals counts))))
                        (if (empty? counts)
                          ""
                          (str " — " (str/join ", " (for [[server n] (sort-by key counts)]
                                                      (format "%s: %s" server (if (nil? n) "unknown" n))))))))
  (let [known (for [counts (vals driver->counts), n (vals counts) :when (some? n)] n)]
    (tx/print-progress! "gc" "%s dataset(s) before sweep, across %d driver(s)"
                        ;; "0" would read as an empty account rather than as a census nothing could answer
                        (if (seq known) (reduce + 0 known) "unknown")
                        (count driver->counts))))

(defn- sweep-driver!
  "Sweep one driver and take a census of what is left, each best effort. A driver that cannot connect at all, or a
  census that fails, must cost neither the other drivers nor the deletions this one did manage.

  `before` is this driver's pre-sweep census, passed in rather than retaken so the report's before and after come
  from the same numbers the log reported."
  [driver before options]
  (binding [tx/*skip-before-run?* true]
    (let [results   (try
                      (vec (tx/gc-orphans! driver options))
                      (catch Exception e
                        (def ee e)
                        [{:name nil, :status :failed, :error (ex-message e)}]))
          remaining (census! driver)
          {:keys [deleted failed]} (group-by :status results)]
      (tx/print-progress! driver "%d deleted, %d failed" (count deleted) (count failed))
      (doseq [{dataset-name :name, :keys [error]} failed]
        (tx/print-progress! driver "FAILED %s: %s" (or dataset-name "<unknown>") error))
      {:driver    (name driver)
       :deleted   deleted
       :failed    failed
       :counts    {:deleted (count deleted), :failed (count failed)}
       :before    before
       :remaining remaining})))

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

(defn- render-driver [{:keys [driver counts before remaining deleted failed]}]
  (str (format "### %s — %d deleted, %d failed\n\n" driver (:deleted counts) (:failed counts))
       (if (empty? remaining)
         "Datasets: unknown\n\n"
         (str "Datasets, before and after:\n\n"
              (str/join "\n" (for [[server n] (sort-by key remaining)]
                               (format "- `%s`: %s → %s"
                                       server
                                       (let [b (get before server)] (if (nil? b) "unknown" b))
                                       (if (nil? n) "unknown" n))))
              "\n\n"))
       (render-names "Deleted" deleted render-object)
       (render-names "Failed" failed render-object)))

(defn- render-markdown [{:keys [generated-at options totals drivers]}]
  (str (format "## DWH test data sweep\n\n**%d deleted, %d failed** — hours %s, %s\n\n"
               (:deleted totals) (:failed totals)
               (:hours options) generated-at)
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
    (tx/print-progress! "gc" "wrote sweep report to %s" dir)))

(defn gc-orphans!
  "Sweep orphaned test data from each driver's shared cloud account.

  `:drivers` is a comma-separated string, defaulting to [[default-drivers]].

  `:hours` is how old a dataset needs to be before it's considered orphaned. Defaults to 12.

  `:tracked?` (default: nil) whether or not to also GC the legacy tracked datasets.
              off by default to avoid disrupting backport branches but easy to run manually.

  `:report-dir` (default: target/gc-report) receives `report.json` and `report.md`.

  Failures don't stop the sweep. They are reported per object, written to the report, and fail the job at the end."
  [{:keys [drivers hours dry-run? tracked? report-dir]}]
  (let [options {:hours (or hours 12) :dry-run? dry-run? :tracked? tracked?}]
    (when (< (:hours options) 4) (throw (Exception. "Must specify at least 4 hours.")))
    (let [swept  (let [ds (parse-drivers drivers)]
                   ;; drivers share nothing, so the job costs the slowest one rather than the sum of all three
                   (cp/with-shutdown! [pool (cp/threadpool (count ds))]
                     (let [before (zipmap ds (doall (cp/pmap pool census! ds)))]
                       (log-census! before)
                       (doall (cp/pmap pool #(sweep-driver! % (get before %) options) ds)))))
          report (build-report options swept)]
      ;; write before throwing: the report is most wanted on the runs that fail
      (write-report! report (or report-dir default-report-dir))
      ;; fail loudly rather than going green having deleted nothing
      (when (pos? (get-in report [:totals :failed]))
        (throw (ex-info (format "%d object(s) could not be deleted"
                                (get-in report [:totals :failed]))
                        {:errors (into [] (comp (mapcat :failed) (map :error)) (:drivers report))}))))))
