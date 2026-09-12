(ns mage.modules
  (:require
   ;; mage runs under babashka, which bundles cheshire; metabase.util.json isn't on its classpath
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [cheshire.core :as json]
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.set :as set]
   [clojure.string :as str]
   [hooks.common.modules :as modules]
   [mage.be-dev :as be-dev]
   [mage.color :as c]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(def ^:dynamic ^:private *github-output-only?* false)

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
;;;; CODEOWNERS
;;;; =============================================================================

;;;; `.github/CODEOWNERS` gets a generated block between BEGIN/END markers, one stanza per module.
;;;; A module's src and test dirs are owned when its `:team` (config.edn) has an `:assignee` handle
;;;; (team.json) and the module isn't flagged `:suppress-codeowners`. Otherwise the stanza is commented
;;;; out, ready to enable. Lines outside the markers are hand-maintained (frontend, e2e, docs).

(def ^:private codeowners-path ".github/CODEOWNERS")
(def ^:private team-config-path ".github/team.json")

(def ^:private codeowners-begin-marker
  "# ===== BEGIN generated module ownership (./bin/mage update-codeowners) =====")

(def ^:private codeowners-end-marker
  "# ===== END generated module ownership =====")

(defn- team-name->assignee
  "Team name => GitHub CODEOWNERS handle, from the `assignee` field in team.json.
  Teams without an `assignee` are omitted; their modules only ever render commented out."
  []
  (into {}
        (keep (fn [{:keys [name assignee]}]
                (when assignee
                  [name assignee])))
        (:teams (json/parse-string (slurp team-config-path) true))))

(defn- module->src-path-prefix
  "Backend source directory for `module`. Src-tree mirror of [[module->test-path-prefix]]."
  [modules-config module]
  (let [ns-prefix (modules/module-ns-prefix modules-config module)]
    (str (when (str/starts-with? ns-prefix "metabase-enterprise.") "enterprise/backend/")
         "src/"
         (-> ns-prefix (str/replace "." "/") (str/replace "-" "_")))))

(defn- module->owned-dirs
  "Existing src and test directories `module` contributes, in CODEOWNERS pattern form (repo-relative,
  no leading slash), src first. Directories missing on disk are skipped."
  [modules-config module]
  (into []
        (filter #(.isDirectory (io/file ^String %)))
        [(module->src-path-prefix modules-config module)
         (module->test-path-prefix modules-config module)]))

(defn- codeowners-stanza-lines
  "Lines for one module's stanza: a `# module (team)` header then one line per owned directory.
  `nil` when `dirs` is empty. Lines are live when the team has an `assignee` and the module isn't
  suppressed; otherwise commented out, keeping the handle when known so they're ready to uncomment."
  [{:keys [module team handle suppress? dirs]}]
  (when (seq dirs)
    (let [active? (and (some? handle) (not suppress?))
          note    (cond
                    active?       nil
                    suppress?     "suppressed via :suppress-codeowners"
                    (nil? handle) "no :assignee in team.json")
          header  (format "# %s (%s%s)" (name module) team (if note (str ", " note) ""))
          body    (for [dir dirs
                        :let [line (str dir (when handle (str " " handle)))]]
                    (if active? line (str "# " line)))]
      (into [header] body))))

(defn- module-codeowners-stanza
  "Resolve `module` against the config and assignees, then render its stanza.
  `nil` when the module owns no existing directory."
  [modules-config assignees module]
  (let [cfg (get modules-config module)]
    (codeowners-stanza-lines
     {:module    module
      :team      (:team cfg)
      :handle    (get assignees (:team cfg))
      :suppress? (boolean (:suppress-codeowners cfg))
      :dirs      (module->owned-dirs modules-config module)})))

(defn- codeowners-block
  "Generated block as one string, marker to marker. One stanza per module, sorted by source path so a
  nested child's dirs sort after its parent's (CODEOWNERS applies the last matching pattern)."
  [modules-config assignees]
  (let [stanzas (->> (keys modules-config)
                     (sort-by #(module->src-path-prefix modules-config %))
                     (keep #(module-codeowners-stanza modules-config assignees %)))]
    (str/join
     "\n"
     (concat
      [codeowners-begin-marker
       "#"
       "# Generated by `./bin/mage update-codeowners`. Do not edit by hand."
       "# Ownership comes from each module's :team (.clj-kondo/config/modules/config.edn) and that"
       "# team's :assignee handle (.github/team.json). A stanza is live when its team has an :assignee"
       "# and the module is not :suppress-codeowners; otherwise it is commented out, ready to enable."
       "#"]
      (mapcat #(cons "" %) stanzas)
      [""
       codeowners-end-marker]))))

(defn- splice-codeowners
  "Replace the marked region (inclusive) in `existing` with `block`; append `block` if the markers aren't
  there yet. Returns text ending in one newline."
  [existing block]
  (let [begin (str/index-of existing codeowners-begin-marker)
        end   (str/index-of existing codeowners-end-marker)
        spliced (if (and begin end (< begin end))
                  (str (str/trimr (subs existing 0 begin))
                       "\n\n" block
                       (subs existing (+ end (count codeowners-end-marker))))
                  (str (str/trimr existing) "\n\n" block))]
    (str (str/trimr spliced) "\n")))

(defn- desired-codeowners []
  (splice-codeowners (slurp codeowners-path)
                     (codeowners-block (read-modules-config) (team-name->assignee))))

(defn cli-update-codeowners
  "Regenerate the module-ownership block in `.github/CODEOWNERS`.
  `--check` exits non-zero when the file is stale instead of writing it (for CI)."
  [cli-args]
  (let [check?   (get-in cli-args [:options :check])
        existing (slurp codeowners-path)
        desired  (desired-codeowners)]
    (cond
      (= existing desired)
      (do (println (c/green "CODEOWNERS module ownership is up to date."))
          (u/exit 0))

      check?
      (do (println (c/red "CODEOWNERS module ownership is out of date. Run ./bin/mage update-codeowners."))
          (u/exit 1))

      :else
      (do (spit codeowners-path desired)
          (println (c/green (str "Updated " codeowners-path ".")))
          (u/exit 0)))))

;;;; =============================================================================
;;;; Module tree
;;;; =============================================================================

(defn- module->tree-path
  "The path segments used to display `module` in the tree.

  An enterprise module appears under its OSS counterpart when one exists.
  Otherwise its full `enterprise/` name appears at the root."
  [modules-config module]
  (let [segments (str/split (name module) #"\.")]
    (if (= (namespace module) "enterprise")
      (if (contains? modules-config (symbol (first segments)))
        ;; Keep an enterprise subtree together under its OSS module.
        (into [(first segments) "enterprise"] (rest segments))
        (into [(str "enterprise/" (first segments))] (rest segments)))
      segments)))

(defn- explicit-ns-prefix
  "Return a module's custom `:ns-prefix`, or `nil` when it uses the default."
  [modules-config module]
  (let [prefix (get-in modules-config [module :ns-prefix])]
    (when (and prefix (not= prefix (modules/default-ns-prefix module)))
      prefix)))

(defn- module-display-tree
  "Build the nested map consumed by [[tree-node-lines]].

  Grouping nodes that are not modules omit `:module`."
  [modules-config]
  (reduce (fn [tree module]
            (update-in tree
                       (into [] (mapcat (fn [segment] [:children segment])) (module->tree-path modules-config module))
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
                     (when-let [prefix (and module (explicit-ns-prefix modules-config module))]
                       (if show-prefixes?
                         (str " " (c/yellow (str "(" prefix ")")))
                         (str " " (c/yellow "*")))))]
    (into [line]
          (mapcat (fn [[segment child]]
                    (tree-node-lines modules-config show-prefixes? (conj path segment) child)))
          (sorted-children node))))

(defn cli-print-module-tree
  "Print the module tree, nesting enterprise extensions under their OSS module.

  Marks modules whose namespace prefix differs from their name."
  [{:keys [options] :as _parsed}]
  (let [modules-config (read-modules-config)
        tree           (module-display-tree modules-config)
        roots          (cond->> (sorted-children tree)
                         (:nested-only options) (filter (fn [[_ node]] (seq (:children node)))))
        starred        (count (keep #(explicit-ns-prefix modules-config %) (keys modules-config)))]
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
            (when-not *github-output-only?*
              (println (str "Running driver tests because " (pr-str filename) " was changed")))
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

(defn- parse-bool
  "Parse a string boolean from CLI args. Returns true for 'true', false otherwise."
  [s]
  (= (str/lower-case (str s)) "true"))

(defn- parse-only-driver
  "Parse the `--only-driver` CLI arg into a driver keyword, or nil when unset.

  Throws on an unknown driver: a typo would otherwise read as `nil` and quietly run the normal decisions
  instead of the one job that was asked for."
  [s]
  (when-not (str/blank? s)
    (let [driver (keyword (str/trim s))]
      (when-not (contains? (set all-drivers) driver)
        (throw (ex-info (str "Unknown driver: " (str/trim s))
                        {:driver driver, :known-drivers (mapv name all-drivers)})))
      driver)))

(defn- parse-labels
  "Parse comma-separated labels string into a set of label strings."
  [labels-str]
  (if (str/blank? labels-str)
    #{}
    (into #{} (map str/trim) (str/split labels-str #","))))

(defn run-driver-label
  "PR label string that opts `driver`'s test job into a given CI run."
  [driver]
  (str "ci:run-" (name driver)))

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
   {:keys [force-run pr-labels skip particular-driver-changed? only-driver]}
   driver-deps-affected?
   updated]
  (cond
    ;; Priority 0: a request for one named driver job (workflow_dispatch on drivers.yml). Runs exactly
    ;; that driver and nothing else -- not even H2/Postgres, since asking for a job by name is a
    ;; stronger signal than any rule below.
    only-driver
    (if (= driver only-driver)
      {:should-run true
       :reason     (str "requested via --only-driver=" (name only-driver))}
      {:should-run false
       :reason     (str "--only-driver=" (name only-driver) " requested instead")})

    ;; Priority 1: Global force-run. Every driver runs.
    force-run
    {:should-run true
     :reason "force-run (master/release branch or ci:run-all label)"}

    ;; Priority 2: Global skip (no backend changes)
    skip
    {:should-run false
     :reason "workflow skip (no backend changes)"}

    ;; Priority 3: H2 and Postgres always run when backend tests run
    (#{:h2 :postgres} driver)
    {:should-run true
     :reason "H2/Postgres always run"}

    ;; Priority 4: ci:run-all-drivers or ci:run-<driver> label
    (or (contains? pr-labels "ci:run-all-drivers")
        (contains? pr-labels (run-driver-label driver)))
    {:should-run true
     :reason (if (contains? pr-labels "ci:run-all-drivers")
               "ci:run-all-drivers label"
               (str (run-driver-label driver) " label"))}

    ;; Priority 5: The driver's own source changed - the change is exactly what needs testing.
    (contains? particular-driver-changed? driver)
    {:should-run true
     :reason "driver files changed"}

    ;; Priority 6: Cloud driver + ci:run-all-cloud-drivers label
    (and (contains? cloud-drivers driver)
         (contains? pr-labels "ci:run-all-cloud-drivers"))
    {:should-run true
     :reason "ci:run-all-cloud-drivers label"}

    ;; Priority 7: Cloud driver + module triggering cloud dbs updated → run it
    (and (contains? cloud-drivers driver)
         (seq (set/intersection updated modules-triggering-cloud-drivers)))
    {:should-run true
     :reason "Module updated which explicitly triggers cloud drivers"}

    ;; Priority 8: Cloud driver + driver deps affected (e.g., deps.edn changed)
    (and (contains? cloud-drivers driver)
         driver-deps-affected?)
    {:should-run true
     :reason "driver module affected by shared code changes"}

    ;; Priority 9: Cloud driver, no relevant changes → skip
    (contains? cloud-drivers driver)
    {:should-run false
     :reason "no relevant changes for cloud driver"}

    ;; Priority 10: Driver deps affected by shared code changes
    driver-deps-affected?
    {:should-run true
     :reason "driver module affected by shared code changes"}

    ;; Priority 11: Self-hosted driver, not affected
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
       --force-run=false \\
       --pr-labels=ci:run-all-cloud-drivers,other-label \\
       --skip=false \\
       --only-driver=bigquery"
  [{:keys [options] :as _parsed}]
  (let [github-output-only? (some? (:github-output-only options))
        git-ref (get options :git-ref "master")
        force-run (parse-bool (:force-run options))
        only-driver (parse-only-driver (:only-driver options))
        ;; force-run and --only-driver each decide every driver on their own, so the change
        ;; analysis is not consulted there.
        analysis (when-not (or force-run only-driver)
                   (let [updated-files (u/updated-files git-ref)
                         updated (updated-files->updated-modules updated-files)
                         driver-affected? (driver-deps-affected? updated)
                         important-file-changed? (changes-important-file-for-drivers? updated-files)]
                     {:particular-driver-changed? (drivers-with-file-changes updated-files)
                      :updated updated
                      :driver-affected? driver-affected?
                      :important-file-changed? important-file-changed?}))
        {:keys [particular-driver-changed? updated driver-affected? important-file-changed?]} analysis
        ctx {:git-ref git-ref
             :force-run force-run
             :pr-labels (parse-labels (:pr-labels options))
             :skip (parse-bool (:skip options))
             :particular-driver-changed? (or particular-driver-changed? #{})
             :only-driver only-driver}
        decisions (mapv (fn [driver]
                          (assoc (driver-decision driver
                                                  ctx
                                                  ;; module dependency check combines both conditions
                                                  (boolean (or driver-affected? important-file-changed?))
                                                  (or updated #{}))
                                 :driver driver))
                        all-drivers)]
    (if github-output-only?
      ;; In github-output-only mode, print just the key=value lines (no colors)
      (doseq [{:keys [driver should-run]} decisions]
        (println (str (name driver) "-should-run=" should-run)))
      (do
        ;; Print module analysis summary
        (when analysis
          (println "")
          (println "=== Module Analysis ===")
          (println "Changed modules:" (pr-str updated))
          (println "Driver module affected:" driver-affected?)
          (println "Important file changed:" (boolean important-file-changed?))
          (println "Drivers with file changes:" (pr-str particular-driver-changed?)))
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
            (println (str (name driver) "-should-run=false"))))))
    (u/exit 0)))

(defn -main
  "See [[cli-driver-decisions]]."
  [{:keys [options] :as parsed}]
  (binding [*github-output-only?* (:github-output-only options)]
    (cli-driver-decisions parsed)))
