(ns mage.project-tests
  (:refer-clojure :exclude [run!])
  (:require
   [clojure.string :as str]
   [mage.shell :as shell]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(def ^:private module-check-namespaces
  '[dev.modules-config-test
    metabase.core.modules-test])

(def ^:private ratchet-test-namespaces
  ;; Unit tests for the ratchet tooling. `./bin/mage kondo-ratchets` checks the real tree.
  '[metabase.core.kondo-ratchet-test
    metabase.core.kondo-ratchet-check-test])

(def ^:private backend-check-namespaces
  (vec (concat module-check-namespaces ratchet-test-namespaces)))

(def ^:private default-suites
  "Suites the bare `project-tests` command runs, in order."
  ["migrations" "backend"])

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

(def ^:private suite-labels
  {"backend"    "backend checks"
   "migrations" "migration checks"
   "modules"    "module checks"
   "ratchets"   "ratchet tooling tests"})

(defn- run-suite!
  "Run one suite and return its exit code.
  A command that cannot be started, or that `sh` times out, counts as a failure rather than aborting the run."
  [sh suite]
  (println "Running" (suite-labels suite))
  (try
    (:exit (case suite
             "backend"    (run-clojure-checks! sh backend-check-namespaces)
             "migrations" (run-migration-checks! sh)
             "modules"    (run-clojure-checks! sh module-check-namespaces)
             "ratchets"   (run-clojure-checks! sh ratchet-test-namespaces)))
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
