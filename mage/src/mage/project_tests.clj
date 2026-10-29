(ns mage.project-tests
  (:refer-clojure :exclude [run!])
  (:require
   [clojure.string :as str]
   [mage.shell :as shell]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(def ^:private module-check-namespaces
  '[dev.modules-config-test
    metabase.core.module-cycles-test
    metabase.core.modules-test])

(def ^:private honey-sql-check-namespaces
  '[metabase.core.table-or-field-raw-usage-test])

(def ^:private ratchet-test-namespaces
  ;; These test the tooling itself. `./bin/mage kondo-ratchets` checks the source tree.
  '[metabase.core.kondo-ratchet-test
    metabase.core.kondo-ratchet-check-test])

(def ^:private source-layout-check-namespaces
  '[metabase.core.namespace-uniqueness-test])

(def ^:private dbt-import-check-namespaces
  ;; The dbt metrics converter under dev/src/dev/dbt_import/. Its tests live in dev/test, which the backend test
  ;; matrix never scans ([[metabase.test-runner]] only looks for `metabase.*` namespaces), so they run here.
  ;; `dev.dbt-import.e2e-test` is left out: it needs a Postgres warehouse and passes with no assertions without one.
  '[dev.dbt-import.parse-test
    dev.dbt-import.inline-spec-test
    dev.dbt-import.resolve-test
    dev.dbt-import.advanced-metrics-test
    dev.dbt-import.dimensions-test
    dev.dbt-import.emit-test
    dev.dbt-import.core-test
    dev.dbt-import.fixture-test
    dev.dbt-import.marts-test
    dev.dbt-import.sql-test
    dev.dbt-import.adapter-test
    dev.dbt-import.preflight-test
    dev.dbt-import.identifiers-test
    dev.dbt-import.generative-test])

(def ^:private backend-check-namespaces
  (vec (concat module-check-namespaces
               ratchet-test-namespaces
               source-layout-check-namespaces
               honey-sql-check-namespaces
               dbt-import-check-namespaces)))

(def ^:private default-suites
  "Suites the bare `project-tests` command runs, in order."
  ["migrations" "backend" "ratchets"])

;; `sh` is a [[mage.shell/sh*]]-compatible function so unit tests can inspect commands without running them.
;; .github/scripts/check-preresolve-aliases.sh reads the alias strings out of these two functions.

(defn- run-migration-checks! [sh]
  (sh {:dir (str u/project-root-directory "/bin/lint-migrations-file")}
      "clojure" "-M:test"))

(defn- run-clojure-checks! [sh namespaces]
  (sh "clojure"
      "-X:dev:dev/test:ee:ee-dev:drivers:drivers-dev:test:ci"
      ":only"
      (pr-str namespaces)))

(defn- run-ratchet-checks! [sh]
  (sh {:dir u/project-root-directory}
      "./bin/mage" "kondo-ratchets"))

(def ^:private suite-labels
  {"backend"    "backend checks"
   "dbt-import" "dbt-import checks"
   "migrations" "migration checks"
   "modules"    "module checks"
   "ratchets"   "ratchet checks"})

(defn- run-suite!
  "Run one suite and return its exit code.
  A command that cannot be started, or that `sh` times out, counts as a failure rather than aborting the run."
  [sh suite]
  (println "Running" (suite-labels suite))
  (try
    (:exit (case suite
             "backend"    (run-clojure-checks! sh backend-check-namespaces)
             "dbt-import" (run-clojure-checks! sh dbt-import-check-namespaces)
             "migrations" (run-migration-checks! sh)
             "modules"    (run-clojure-checks! sh module-check-namespaces)
             "ratchets"   (run-ratchet-checks! sh)))
    (catch Exception e
      (println "Could not run" (suite-labels suite) "--" (ex-message e))
      1)))

(defn run-suites!
  "Run every suite in `suites` with `sh`, a [[mage.shell/sh*]]-compatible function, and return the names of
  the suites that failed.
  A failing suite does not stop the later ones.
  `sh` streams each command's output as it runs; nothing is printed again afterwards."
  [sh suites]
  (let [failed (into [] (remove #(zero? (run-suite! sh %))) suites)]
    (when (seq failed)
      (println "Failed:" (str/join ", " (map suite-labels failed))))
    failed))

(defn run!
  "Run the project-level checks: every default suite, or just `suite`.
  Exits nonzero when any suite fails."
  ([]
   (run! nil))
  ([suite]
   (when (seq (run-suites! shell/sh* (if suite [suite] default-suites)))
     (u/exit 1))))
