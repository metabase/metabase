(ns mage.project-tests
  (:refer-clojure :exclude [run!])
  (:require
   [mage.shell :as shell]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(def ^:private test-namespaces
  "Repository-invariant test namespaces run by [[run!]]."
  '[dev.modules-config-test
    metabase.core.modules-test
    metabase.core.kondo-ratchet-test])

(defn- run-migration-tests! []
  (println "Running migration linter tests")
  (shell/sh {:dir (str u/project-root-directory "/bin/lint-migrations-file")}
            "clojure" "-M:test"))

(defn- run-invariant-tests! []
  (println "Running backend checks")
  (shell/sh "clojure"
            "-X:dev:dev/test:ee:ee-dev:drivers:drivers-dev:test:ci"
            ":only"
            (pr-str test-namespaces)))

(defn run!
  "Run repository-invariant tests that do not belong to the build or database matrices."
  ([]
   (run-migration-tests!)
   (run-invariant-tests!))
  ([suite]
   (case suite
     "invariants" (run-invariant-tests!)
     "migrations" (run-migration-tests!))))
