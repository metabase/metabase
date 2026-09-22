(ns mage.modules
  (:require
   [cheshire.core :as json]
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.set :as set]
   [clojure.string :as str]
   [dev.module-explorer :as module-explorer]
   [hooks.common.modules :as modules]
   [mage.be-dev :as be-dev]
   [mage.color :as c]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(def default-modules-which-trigger-drivers
  "Modules that, when affected by changes, should trigger driver tests."
  '#{driver transforms})

(def modules-triggering-cloud-drivers
  "Modules not only trigger driver tests, but run cloud drivers as well. Can be duplicative to driver triggers."
  '#{query-processor transforms
     enterprise/transforms enterprise/transforms.python})

;;; TODO (Cam 2025-11-07) changes to test files should only cause us to run tests for that module as well, not
;;; everything that depends on that module directly or indirectly in `src`
(defn- file->ns-symbol [filename]
  (when (re-find #"^(?:(?:src|test)/metabase|enterprise/backend/(?:src|test)/metabase_enterprise)/" filename)
    (-> filename
        (str/replace #"^(?:enterprise/backend/)?(?:src|test)/" "")
        (str/replace #"\.[^./]+$" "")
        (str/replace "/" ".")
        (str/replace "_" "-")
        symbol)))

(defn- file->module [prefix->module filename]
  (or
   (some->> (file->ns-symbol filename) (modules/declared-module prefix->module))
   ;; otherwise a file inside a directory belongs to the (undeclared) module that directory names
   (when-let [[_match module] (re-matches #"^(?:(?:src)|(?:test))/metabase/([^/]+)/.*$" filename)]
     (symbol (str/replace module #"_" "-")))
   (when-let [[_match module] (re-matches #"^enterprise/backend/(?:(?:src)|(?:test))/metabase_enterprise/([^/]+)/.*$" filename)]
     (symbol "enterprise" (str/replace module #"_" "-")))))

(defn- read-modules-config []
  (-> (with-open [r (java.io.PushbackReader. (java.io.FileReader. ".clj-kondo/config/modules/config.edn"))]
        (edn/read r))
      :metabase/modules))

(defn- updated-files->updated-modules [updated-files]
  (let [prefix->module (modules/build-prefix->module (read-modules-config))]
    (into (sorted-set)
          (keep #(file->module prefix->module %))
          updated-files)))

(defn- updated-modules [git-ref]
  (let [git-ref (or git-ref "master")
        updated-files (u/updated-files git-ref)]
    (updated-files->updated-modules updated-files)))

(def ^:private backend-test-source-file-extensions
  [".clj" ".cljc"])

(defn- module->test-path-prefix [modules-config module]
  (let [ns-prefix (modules/module-ns-prefix modules-config module)]
    (str (when (str/starts-with? ns-prefix "metabase-enterprise.") "enterprise/backend/")
         "test/"
         (-> ns-prefix (str/replace "." "/") (str/replace "-" "_")))))

(defn- module->test-paths [modules-config module]
  (let [prefix->module (modules/build-prefix->module modules-config)
        path-prefix    (module->test-path-prefix modules-config module)
        test-dir       (io/file path-prefix)
        test-files     (concat
                        (for [extension backend-test-source-file-extensions
                              :let      [file (io/file (str path-prefix "_test" extension))]
                              :when     (.isFile file)]
                          file)
                        (when (.isDirectory test-dir)
                          (for [file (file-seq test-dir)
                                :when (and (.isFile ^java.io.File file)
                                           (some #(str/ends-with? (str file) %)
                                                 backend-test-source-file-extensions))]
                            file)))]
    (into (sorted-set)
          (comp (filter #(= module (file->module prefix->module (str %))))
                (map str))
          test-files)))

(defn- dependencies
  "Read out the Kondo config for the modules linter; return a map of module => set of modules it directly depends on."
  []
  (let [config (-> (read-modules-config)
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
  '#{metabot.agent-api
     analytics
     analytics.interface
     api
     api-keys
     api-scope
     appearance
     audit-app
     sso.auth-identity
     auth-provider
     batch-processing
     bookmarks
     channel
     util.classloader
     collections
     util.config
     content-verification
     explorations.contextual-interestingness
     custom-viz-plugin
     dashboards
     documents
     api.eid-translation
     embedding
     enterprise/api
     enterprise/sso.scim
     enterprise/serialization
     enterprise/sso
     enterprise/transforms
     enterprise/transforms.inspector
     search.entity-retrieval
     events
     explorations
     formatter
     geojson
     glossary
     indexed-entities
     core.initialization-status
     interestingness
     analytics.internal-stats
     metabot.llm
     session.login-history
     mcp
     measures
     metabot
     mq
     notification
     mcp.oauth-server
     osi
     permissions
     premium-features
     public-sharing
     pulse
     remote-sync
     request
     sample-data
     search
     warehouses.secrets
     segments
     server
     session
     settings
     setup
     metabot.slackbot
     sso
     staleness
     startup
     system
     task
     task.history
     tiles
     timeline
     tracing
     lib.types
     users
     util
     core.version
     audit-app.view-log
     warehouses.schema
     warehouse-schema-overlay
     xrays})

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
  "CLI entry point: print modules affected by changes since `git-ref`, plus driver-test guidance."
  [[git-ref, :as _command-line-args]]
  (let [modules-config (read-modules-config)
        deps (dependencies)
        updated (updated-modules git-ref)
        affected (affected-modules deps updated)
        driver-deps-affected? (not (contains? (unaffected-modules deps updated) 'driver))]
    (print-updated-and-unaffected-modules deps updated driver-deps-affected?)
    (println)
    (println)
    (println "You can run tests for these modules and all downstream modules as follows:")
    (println)
    (println)
    (printf "clojure -X :dev:ee:ee-dev:test :only '%s'\n"
            (pr-str (into [] (mapcat #(module->test-paths modules-config %)) affected)))
    (flush)
    (u/exit 0)))

;;;; =============================================================================
;;;; Module tree
;;;; =============================================================================

(defn- module-display-tree
  "Build the nested map consumed by [[tree-node-lines]].

  Grouping nodes that are not modules omit `:module`."
  [modules-config]
  (reduce (fn [tree module]
            (update-in tree
                       (into []
                             (mapcat (fn [segment] [:children segment]))
                             (module-explorer/module->tree-path modules-config module))
                       assoc :module module))
          {}
          (keys modules-config)))

(defn- sorted-children
  "Sort child nodes alphabetically, with enterprise nodes last."
  [node]
  (sort-by (fn [[segment _]] [(if (or (= segment "enterprise")
                                      (str/starts-with? segment "enterprise/"))
                                1
                                0)
                              segment])
           (:children node)))

(defn- tree-node-lines
  "Render a tree node and its descendants.

  Dashes show depth. Grouping nodes are dimmed. Modules with a custom prefix
  show `*`, or the prefix itself when `show-prefixes?` is true."
  [modules-config show-prefixes? path node]
  (let [depth   (dec (count path))
        module  (:module node)
        display (str/join "." path)
        line    (str (when (pos? depth)
                       (str (apply str (repeat depth "-")) " "))
                     (if module display (c/dark display))
                     (when-let [prefix (and module (module-explorer/explicit-ns-prefix modules-config module))]
                       (if show-prefixes?
                         (str " " (c/yellow (str "(" prefix ")")))
                         (str " " (c/yellow "*")))))]
    (into [line]
          (mapcat (fn [[segment child]]
                    (tree-node-lines modules-config show-prefixes? (conj path segment) child)))
          (sorted-children node))))

(defn- write-explorer!
  "Write the HTML explorer to `output`, or to stdout, and exit."
  [modules-config {:keys [output no-stats]}]
  (let [html (module-explorer/page (module-explorer/explorer-data modules-config {:stats? (not no-stats)}))]
    (if output
      (do (spit output html)
          (println (c/green (str "Wrote " output))))
      (do (print html)
          ;; u/exit throws for bb to catch, which skips the flush at shutdown
          (flush)))
    (u/exit 0)))

(defn cli-print-module-tree
  "Print the module tree, nesting enterprise extensions under their OSS module.

  Marks modules whose namespace prefix differs from their name.
  With `--html`, writes the interactive explorer instead."
  [{:keys [options] :as _parsed}]
  (when (:html options)
    (write-explorer! (read-modules-config) options))
  (let [modules-config (read-modules-config)
        tree           (module-display-tree modules-config)
        roots          (cond->> (sorted-children tree)
                         (:nested-only options) (filter (fn [[_ node]] (seq (:children node)))))
        starred        (count (keep #(module-explorer/explicit-ns-prefix modules-config %) (keys modules-config)))]
    (doseq [[segment node] roots
            line            (tree-node-lines modules-config (:prefixes options) [segment] node)]
      (println line))
    (println)
    (println (c/dark (str (count modules-config) " modules, "
                          (count (filter #(= (namespace %) "enterprise") (keys modules-config)))
                          " enterprise"
                          (when (pos? starred)
                            (str ", " starred " custom prefixes ("
                                 (if (:prefixes options) "shown in parentheses" "marked with *")
                                 ")")))))
    (u/exit 0)))

(defn- changes-important-file-for-drivers?
  "Whether we should always run driver tests because `updated-files` touches something important like
  `deps.edn`."
  [updated-files]
  (some (fn [filename]
          (when (or (str/includes? filename "deps.edn")
                    (str/includes? filename "modules/drivers/"))
            (println (str "Running driver tests because " (pr-str filename) " was changed"))
            filename))
        updated-files))

(defn driver-deps-affected?
  "Returns true if any of `trigger-modules` are affected by the changed modules.
   1-arity and 2-arity trigger on the union of [[default-modules-which-trigger-drivers]] and
   [[modules-triggering-cloud-drivers]]."
  ([modules]
   (driver-deps-affected? (dependencies) modules))
  ([deps modules]
   (driver-deps-affected? deps modules (set/union default-modules-which-trigger-drivers
                                                  modules-triggering-cloud-drivers)))
  ([deps modules trigger-modules]
   ;; Fail clearly when a renamed trigger is missing from the config.
   (when-let [missing (seq (remove #(contains? deps %) trigger-modules))]
     (throw (ex-info (str "Driver-trigger module(s) not declared in the module config: "
                          (pr-str missing))
                     {:missing missing})))
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
        updated-files (u/updated-files git-ref)
        updated (updated-files->updated-modules updated-files)
        drivers-affected? (driver-deps-affected? deps updated)]
    ;; Not strictly necessary, but people looking at CI will appreciate having this extra info.
    (print-updated-and-unaffected-modules deps updated drivers-affected?)
    (u/exit (cond
              (changes-important-file-for-drivers? updated-files) 1
              drivers-affected? 1
              :else 0))))

;;;; =============================================================================
;;;; Fix modules config
;;;; =============================================================================
(defn cli-fix-config
  "Regenerate `.clj-kondo/config/modules/config.edn` so it passes `metabase.core.modules-test`.

  Fast path: evaluate in the running dev nREPL (a few seconds). Fallback: spawn a cold JVM (~25s) when no
  dev REPL is running."
  [{:keys [options] :as _parsed}]
  (let [port  (some-> (:port options) str str/trim parse-long)
        timer (u/start-timer)
        exit  (be-dev/eval-or-spawn
               {:port       port
                :nrepl-ns   "dev.modules-config"
                :nrepl-code "(update-config!)"
                :jvm-args   ["-X:dev" "dev.modules-config/fix-config!"]
                :nrepl-msg  (c/green "Regenerating modules config via the running dev REPL...")
                :jvm-msg    (c/yellow "No dev REPL found — starting a JVM (slower; start your dev REPL for ~5s runs)...")})]
    (printf "\nFinished in %.1fs\n" (/ (u/since-ms timer) 1000.0))
    (flush)
    (u/exit (or exit 0))))

;;;; =============================================================================
;;;; Driver test decisions - consolidated logic for which drivers to run
;;;; =============================================================================

(def ^:private driver-directory->drivers
  "Maps driver directory names to the driver keyword(s) they correspond to.
   Most directories map to a single driver, but some (like mongo) map to multiple test jobs."
  {"athena" [:athena]
   "bigquery-cloud-sdk" [:bigquery]
   "clickhouse" [:clickhouse]
   "databricks" [:databricks]
   "druid-jdbc" [:druid-jdbc]
   "mongo" [:mongo :mongo-ssl :mongo-sharded-cluster]
   "oracle" [:oracle]
   "presto-jdbc" [:presto-jdbc]
   "redshift" [:redshift]
   "snowflake" [:snowflake]
   "sparksql" [:sparksql]
   "sqlserver" [:sqlserver]
   ;; starburst tests are currently disabled in drivers.yml
   ;; "starburst" [:starburst]
   "vertica" [:vertica]})

(defn- drivers-with-file-changes
  "Returns a set of driver keywords that have file changes in modules/drivers/<driver>/."
  [updated-files]
  (into #{}
        (mapcat (fn [filename]
                  (when-let [[_ dir-name] (re-matches #"modules/drivers/([^/]+)/.*" filename)]
                    (get driver-directory->drivers dir-name))))
        updated-files))

(defn- cli-driver-analysis
  "Report what the module graph says about the diff, for the CI gate to decide on.

   This answers only what needs the module dependency graph and the changed-file list. Branch,
   labels, the dispatch input and the shared test-gate verdict are policy, and live in
   `.github/scripts/gate/drivers.ts` with the rules that read them.

   JSON goes to stdout and the human-readable summary to stderr, so a caller can capture one
   without the other.

   Usage:
     ./bin/mage -driver-analysis --git-ref=master"
  [{:keys [options] :as _parsed}]
  (let [git-ref  (get options :git-ref "master")
        analysis (binding [*out* *err*]
                   (let [updated-files (u/updated-files git-ref)
                         updated       (updated-files->updated-modules updated-files)
                         analysis      {:driverDepsAffected         (driver-deps-affected? updated)
                                        :importantFileChanged       (boolean (changes-important-file-for-drivers? updated-files))
                                        :driversChanged             (mapv name (sort (drivers-with-file-changes updated-files)))
                                        :cloudTriggerModulesUpdated (boolean (seq (set/intersection updated modules-triggering-cloud-drivers)))}]
                     (println "")
                     (println "=== Module Analysis ===")
                     (println "Changed modules:" (pr-str updated))
                     (println "Driver module affected:" (:driverDepsAffected analysis))
                     (println "Important file changed:" (:importantFileChanged analysis))
                     (println "Drivers with file changes:" (pr-str (:driversChanged analysis)))
                     (println "Cloud-trigger module updated:" (:cloudTriggerModulesUpdated analysis))
                     analysis))]
    (println (json/generate-string analysis))
    (u/exit 0)))

(defn -main
  "See [[cli-driver-analysis]]."
  [parsed]
  (cli-driver-analysis parsed))
