(ns mage.project-tests
  (:refer-clojure :exclude [run!])
  (:require
   [mage.shell :as shell]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(def ^:private backend-check-namespaces
  "Backend check namespaces run by [[run!]]."
  '[dev.modules-config-test
    metabase.core.modules-test
    metabase.core.kondo-ratchet-test])

(defn- run-migration-checks! []
  (println "Running migration checks")
  (shell/sh {:dir (str u/project-root-directory "/bin/lint-migrations-file")}
            "clojure" "-M:test"))

(defn- run-backend-checks! []
  (println "Running backend checks")
  (shell/sh "clojure"
            "-X:dev:dev/test:ee:ee-dev:drivers:drivers-dev:test:ci"
            ":only"
            (pr-str backend-check-namespaces)))

(defn run!
  "Run the project-level backend and migration checks."
  ([]
   (run-migration-checks!)
   (run-backend-checks!))
  ([suite]
   (case suite
     "backend-checks"   (run-backend-checks!)
     "migration-checks" (run-migration-checks!))))
