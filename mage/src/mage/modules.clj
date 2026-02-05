(ns mage.modules
  (:require
   ^:clj-kondo/ignore
   [cheshire.core :as json]
   [clojure.edn :as edn]
   [clojure.set :as set]
   [clojure.string :as str]
   [mage.color :as c]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(def ^:dynamic ^:private *github-output-only?* false)

(def default-modules-which-trigger-drivers
  "Modules that, when affected by changes, should trigger driver tests."
  ['driver 'transforms])

;;; TODO (Cam 2025-11-07) changes to test files should only cause us to run tests for that module as well, not
;;; everything that depends on that module directly or indirectly in `src`
(defn- file->module [filename]
  (or
   (when-let [[_match module] (re-matches #"^(?:(?:src)|(?:test))/metabase/([^/]+)/.*$" filename)]
     (symbol (str/replace module #"_" "-")))
   (when-let [[_match module] (re-matches #"^enterprise/backend/(?:(?:src)|(?:test))/metabase_enterprise/([^/]+)/.*$" filename)]
     (symbol "enterprise" (str/replace module #"_" "-")))))

(defn- updated-files->updated-modules [updated-files]
  (into (sorted-set)
        (keep file->module)
        updated-files))

(defn- updated-modules [git-ref]
  (let [git-ref (or git-ref "master")
        updated-files (u/updated-files git-ref)]
    (updated-files->updated-modules updated-files)))

(defn- module->test-directory
  [module]
  (case (namespace module)
    "enterprise" (str "enterprise/backend/test/metabase_enterprise/" (str/replace (name module) #"-" "_"))
    nil (str "test/metabase/" (str/replace (name module) #"-" "_"))))

(defn- dependencies
  "Read out the Kondo config for the modules linter; return a map of module => set of modules it directly depends on."
  []
  (let [config (-> (with-open [r (java.io.PushbackReader. (java.io.FileReader. ".clj-kondo/config/modules/config.edn"))]
                     (edn/read r))
                   :metabase/modules
                   ;; ignore the config for [[metabase.connection-pool]] which comes from one of our libraries.
                   (dissoc 'connection-pool))]
    (into (sorted-map)
          (map (fn [[k config]]
                 [k (:uses config)]))
          config)))

(defn- direct-dependents
  "Set of modules that directly depend on `module`."
  [deps module]
  (into (sorted-set)
        (keep (fn [[a-module module-deps]]
                (when (or (= module-deps :any)
                          (contains? module-deps module))
                  a-module)))
        deps))

(comment
  (direct-dependents (dependencies) 'driver))

(defn- indirect-dependents
  "Set of modules that either directly or indirectly depend on `module`."
  ([deps module]
   (indirect-dependents deps module (sorted-set)))
  ([deps module acc]
   (let [module-deps (direct-dependents deps module)
         new-deps (set/difference module-deps acc)
         acc (into acc new-deps)]
     (reduce
      (fn [acc new-dep]
        (indirect-dependents deps new-dep acc))
      acc
      new-deps))))

(def driver-affecting-overrides
  "These modules affect drivers when computing, but we want to override and not consider them to affect drivers."
  '#{analytics
     api
     api-keys
     appearance
     audit-app
     auth-identity
     auth-provider
     batch-processing
     channel
     classloader
     collections
     config
     content-verification
     dashboards
     eid-translation
     embedding
     enterprise/api
     enterprise/scim
     enterprise/serialization
     enterprise/sso
     events
     formatter
     initialization-status
     internal-stats
     login-history
     notification
     permissions
     public-sharing
     pulse
     remote-sync
     request
     search
     secrets
     server
     session
     settings
     setup
     sso
     startup
     system
     task
     task-history
     timeline
     types
     users
     util
     version
     view-log})

(defn- affected-modules
  "Set of modules that are direct or indirect dependents of `modules`, and thus are affected by changes to them.
   Includes the changed modules themselves (a module is always affected by its own changes)."
  [deps modules]
  (let [sorted-modules (into (sorted-set) modules)]
    (into sorted-modules
          (mapcat (partial indirect-dependents deps))
          modules)))

(defn- unaffected-modules
  "Return the set of modules that are unaffected "
  [deps modules]
  (set/difference
   (into (sorted-set) (keys deps))
   (affected-modules deps modules)))

(comment
  (unaffected-modules (dependencies) '#{enterprise/billing}))

(defn- print-updated-and-unaffected-modules [deps updated driver-deps-affected?]
  (let [unaffected (unaffected-modules deps updated)]
    (println "These modules have changed:" (pr-str updated))
    (println)
    (println)
    (println "These are all the modules are unaffected by these changes:" (pr-str unaffected))
    (println)
    (println)
    (println "(By unaffected, this means these modules do not have a direct or indirect dependency on the modules that have been changed.)")
    (println)
    (println)
    (println (if driver-deps-affected?
               (c/red "Driver tests " (c/bold "MUST be run") ".")
               (c/green "Driver tests " (c/bold "CAN be skipped") "")))))

(defn cli-print-affected-modules
  [[git-ref, :as _command-line-args]]
  (let [deps (dependencies)
        updated (updated-modules git-ref)
        affected (affected-modules deps updated)
        driver-deps-affected? (not (contains? (unaffected-modules deps updated) 'driver))]
    (print-updated-and-unaffected-modules deps updated driver-deps-affected?)
    (println)
    (println)
    (println "You can run tests for these modules and all downstream modules as follows:")
    (println)
    (println)
    (printf "clojure -X :dev:ee:ee-dev:test :only '%s'\n" (pr-str (mapv module->test-directory affected)))
    (flush)
    (u/exit 0)))

(defn- changes-important-file-for-drivers?
  "Whether we should always run driver tests if we have changes relative to `git-ref` to something important like
  `deps.edn`."
  [git-ref]
  (some (fn [filename]
          (when (or (str/includes? filename "deps.edn")
                    (str/includes? filename "modules/drivers/"))
            (when-not *github-output-only?*
              (println (str "Running driver tests because " (pr-str filename) " was changed")))
            filename))
        (u/updated-files (or git-ref "master"))))

(defn- remove-non-driver-test-namespaces [files]
  (into []
        (remove (fn [filename]
                  (when (and (some #(str/includes? filename %)
                                   ["test/" "enterprise/backend/test/"])
                             (not (some #(str/includes? filename %)
                                        ["query_processor"
                                         "driver"])))
                    (when-not *github-output-only?*
                      (println (str "Ignorning changes in test namespace " (pr-str filename))))
                    filename)))
        files))

(defn driver-deps-affected?
  "Returns true if any of `trigger-modules` are affected by the changed modules.
   1-arity and 2-arity use [[default-modules-which-trigger-drivers]] for backwards compatibility."
  ([modules]
   (driver-deps-affected? (dependencies) modules))
  ([deps modules]
   (driver-deps-affected? deps modules default-modules-which-trigger-drivers))
  ([deps modules trigger-modules]
   (let [unaffected (unaffected-modules deps (remove driver-affecting-overrides modules))]
     (boolean
      (some #(not (contains? unaffected %)) trigger-modules)))))

(defn cli-can-skip-driver-tests
  "Exits with zero status code if we can skip driver tests, nonzero if we cannot.

  Invoke this from the CLI with

    ./bin/mage can-skip-driver-tests [git-ref]"
  [[git-ref, :as _arguments]]
  (let [deps (dependencies)
        git-ref (or git-ref "master")
        updated-files (remove-non-driver-test-namespaces (u/updated-files git-ref))
        updated (updated-files->updated-modules updated-files)
        drivers-affected? (driver-deps-affected? deps updated)]
    ;; Not strictly necessary, but people looking at CI will appreciate having this extra info.
    (print-updated-and-unaffected-modules deps updated drivers-affected?)
    (u/exit (cond
              (changes-important-file-for-drivers? git-ref) 1
              drivers-affected? 1
              :else 0))))

;;;; =============================================================================
;;;; Driver test decisions - consolidated logic for which drivers to run
;;;; =============================================================================

(def cloud-drivers
  "Drivers that run on cloud infrastructure and require secrets. These are more expensive to run,
  since they need round trip times, so we skip them on PRs unless specifically needed."
  #{:athena :bigquery :databricks :redshift :snowflake})

(def ^:private all-drivers
  "All driver test jobs in drivers.yml, in order."
  [:h2
   :athena
   :bigquery
   :clickhouse
   :databricks
   :druid
   :druid-jdbc
   :mongo
   :mongo-ssl
   :mongo-sharded-cluster
   :mysql-mariadb
   :oracle
   :postgres
   :presto-jdbc
   :redshift
   :snowflake
   :sparksql
   :sqlite
   :sqlserver
   :vertica])

(def ^:private driver-directory->drivers
  "Maps driver directory names to the driver keyword(s) they correspond to.
   Most directories map to a single driver, but some (like mongo) map to multiple test jobs."
  {"athena" [:athena]
   "bigquery-cloud-sdk" [:bigquery]
   "clickhouse" [:clickhouse]
   "databricks" [:databricks]
   "druid" [:druid]
   "druid-jdbc" [:druid-jdbc]
   "mongo" [:mongo :mongo-ssl :mongo-sharded-cluster]
   "oracle" [:oracle]
   "presto-jdbc" [:presto-jdbc]
   "redshift" [:redshift]
   "snowflake" [:snowflake]
   "sparksql" [:sparksql]
   "sqlite" [:sqlite]
   "sqlserver" [:sqlserver]
   ;; starburst tests are currently disabled in drivers.yml
   ;; "starburst" [:starburst]
   "vertica" [:vertica]})

(defn- drivers-with-file-changes
  "Returns a set of driver keywords that have file changes in modules/drivers/<driver>/."
  [git-ref]
  (let [updated-files (u/updated-files (or git-ref "master"))]
    (into #{}
          (mapcat (fn [filename]
                    (when-let [[_ dir-name] (re-matches #"modules/drivers/([^/]+)/.*" filename)]
                      (get driver-directory->drivers dir-name))))
          updated-files)))

;;; driver quarantine

(def ^:private ci-test-config-url
  "https://raw.githubusercontent.com/metabase/ci-test-config/refs/heads/master/ci-test-config.json")

(defn- read-ci-test-config []
  (json/parse-string (slurp ci-test-config-url) keyword))

(defn- quarantined-drivers []
  (-> (read-ci-test-config)
      (get-in [:ignored :drivers] [])
      (->> (map keyword))
      (set)))

(defn- parse-bool
  "Parse a string boolean from CLI args. Returns true for 'true', false otherwise."
  [s]
  (= (str/lower-case (str s)) "true"))

(defn- parse-labels
  "Parse comma-separated labels string into a set of label strings."
  [labels-str]
  (if (str/blank? labels-str)
    #{}
    (into #{} (map str/trim) (str/split labels-str #","))))

(defn break-quarantine-label [driver]
  (str "break-quarantine-" (name driver)))

(defn- driver-decision
  "Determine if a driver should run and why.

   Returns a map with :should-run (boolean) and :reason (string).

   For the decision priority order, see: mage -driver-decisions -h

   ## What counts as 'driver deps affected'?

   The driver module is considered affected when:
   - Files in modules/drivers/* are changed (triggers all drivers)
   - deps.edn is changed (triggers all drivers)
   - Clojure modules that the 'driver' module depends on are changed"
  [driver
   {:keys [is-master-or-release pr-labels skip particular-driver-changed? verbose?]}
   driver-deps-affected?
   quarantined-drivers
   updated]
  (cond
    ;; Priority 1: Global skip (no backend changes)
    skip
    {:should-run false
     :reason "workflow skip (no backend changes)"}

    ;; Priority 2: H2 and Postgres always run when backend tests run
    (#{:h2 :postgres} driver)
    {:should-run true
     :reason "H2/Postgres always run"}

    ;; Priority 3: Quarantined drivers (respected even on master/release)
    (contains? quarantined-drivers driver)
    (do
      (when verbose?
        (println "Driver" (name driver) "is quarantined; checking for '" (break-quarantine-label driver) "' label...."))
      (if (contains? pr-labels (break-quarantine-label driver))
        {:should-run true
         :reason (str "driver is quarantined, but " (break-quarantine-label driver) " label found; running anyway")}
        {:should-run false
         :reason "driver is quarantined"}))

    ;; Priority 4: Master/release branch - all (non-quarantined) drivers run
    is-master-or-release
    {:should-run true
     :reason "master/release branch"}

    ;; Priority 5: Cloud driver + ci:all-cloud-drivers label
    (and (contains? cloud-drivers driver)
         (contains? pr-labels "ci:all-cloud-drivers"))
    {:should-run true
     :reason "ci:all-cloud-drivers label"}

    ;; Priority 6: Cloud driver + its files changed
    (and (contains? cloud-drivers driver)
         (contains? particular-driver-changed? driver))
    {:should-run true
     :reason (str "driver files changed (modules/drivers/" (name driver) "/**)")}

    ;; Priority 7: Cloud driver + query-processor updated → run it
    (and (contains? cloud-drivers driver)
         (contains? updated 'query-processor))
    {:should-run true
     :reason "query-processor module updated"}

    ;; Priority 8: Cloud driver, no relevant changes → skip
    (contains? cloud-drivers driver)
    {:should-run false
     :reason "no relevant changes for cloud driver"}

    ;; Priority 9: Driver deps affected by shared code changes
    driver-deps-affected?
    {:should-run true
     :reason "driver module affected by shared code changes"}

    ;; Priority 10: Self-hosted driver, not affected
    :else
    {:should-run false
     :reason "driver module not affected"}))

(defn- cli-driver-decisions
  "Determine which driver tests should run based on PR context.

   Outputs decisions in GITHUB_OUTPUT format (key=value lines) plus human-readable logs.
   Use --github-output-only to output only the key=value lines for CI.

   Usage:
     ./bin/mage -driver-decisions \\
       --git-ref=master \\
       --is-master-or-release=false \\
       --pr-labels=ci:all-cloud-drivers,other-label \\
       --skip=false"
  [{:keys [options] :as _parsed}]
  (let [github-output-only? (some? (:github-output-only options))
        git-ref (get options :git-ref "master")
        ;; Detect file changes for ALL drivers via git diff
        particular-driver-changed? (drivers-with-file-changes git-ref)
        ctx {:git-ref git-ref
             :is-master-or-release (parse-bool (:is-master-or-release options))
             :pr-labels (parse-labels (:pr-labels options))
             :skip (parse-bool (:skip options))
             :particular-driver-changed? particular-driver-changed?
             :verbose? (not github-output-only?)}
        quarantined (quarantined-drivers)
        updated-files (remove-non-driver-test-namespaces
                       (u/updated-files git-ref))
        updated (updated-files->updated-modules updated-files)
        driver-affected? (driver-deps-affected? updated)
        important-file-changed? (changes-important-file-for-drivers? git-ref)
        ;; For module dependency check, combine both conditions
        effective-driver-affected? (or driver-affected? important-file-changed?)
        decisions (mapv (fn [driver]
                          (assoc (driver-decision driver ctx effective-driver-affected? quarantined updated)
                                 :driver driver))
                        all-drivers)
        ;; Check for quarantined drivers with file changes but no break-quarantine label
        quarantined-with-changes (into #{}
                                       (filter (fn [driver]
                                                 (and (contains? quarantined driver)
                                                      (contains? particular-driver-changed? driver)
                                                      (not (contains? (:pr-labels ctx)
                                                                      (break-quarantine-label driver))))))
                                       all-drivers)]

    (if github-output-only?
      ;; In github-output-only mode, print just the key=value lines (no colors)
      (do
        (doseq [{:keys [driver should-run]} decisions]
          (println (str (name driver) "-should-run=" should-run)))
        (doseq [driver quarantined-with-changes]
          (println (str (name driver) "-quarantine-conflict=true"))))

      (do
        ;; Print module analysis summary
        (println "")
        (println "=== Module Analysis ===")
        (println "Changed modules:" (pr-str updated))
        (println "Driver module affected:" driver-affected?)
        (println "Important file changed:" (boolean important-file-changed?))
        (println "Drivers with file changes:" (pr-str particular-driver-changed?))
        (println "")

        ;; Print human-readable decision summary
        (println "=== Driver Decisions ===")
        (doseq [{:keys [driver should-run reason]} decisions]
          (println (format "%-25s %s - %s"
                           (name driver)
                           (if should-run (c/green "RUN ") (c/yellow "SKIP"))
                           reason)))
        (println "")

        ;; Print GITHUB_OUTPUT preview with colors
        (let [{drivers-to-run true drivers-to-skip false} (group-by :should-run decisions)]
          (println (c/green (str "\n=== Drivers to Run (" (count drivers-to-run) ") ===")))
          (doseq [{:keys [driver]} drivers-to-run]
            (println (str (name driver) "-should-run=true")))
          (println (c/yellow (str "\n=== Drivers to Skip (" (count drivers-to-skip) ") ===")))
          (doseq [{:keys [driver]} drivers-to-skip]
            (println (str (name driver) "-should-run=false"))))

        ;; Output quarantine conflict warnings with colors
        (when (seq quarantined-with-changes)
          (println "")
          (println (c/red "⚠️  WARNING: Quarantined driver(s) have file changes but tests will NOT run!"))
          (println (c/red "=== Quarantine Conflicts ==="))
          (doseq [driver quarantined-with-changes]
            (println (c/red (str "  • " (name driver) " - add label '" (break-quarantine-label driver) "' to run tests")))
            (println (str (name driver) "-quarantine-conflict=true"))))))

    (u/exit 0)))

(defn -main
  "See [[cli-driver-decisions]]."
  [{:keys [options] :as parsed}]
  (binding [*github-output-only?* (:github-output-only options)]
    (cli-driver-decisions parsed)))
