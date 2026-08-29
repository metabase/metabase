(ns mage.project-tests
  (:refer-clojure :exclude [run!])
  (:require
   [mage.shell :as shell]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(def ^:private module-check-namespaces
  "Module check namespaces run by [[run!]]."
  '[dev.modules-config-test
    metabase.core.modules-test])

(def ^:private ratchet-check-namespaces
  "Ratchet check namespaces run by [[run!]]."
  '[metabase.core.kondo-ratchet-test])

(def ^:private backend-check-namespaces
  "Backend check namespaces run by [[run!]]."
  (vec (concat module-check-namespaces ratchet-check-namespaces)))

(defn- run-migration-checks! []
  (println "Running migration checks")
  (shell/sh {:dir (str u/project-root-directory "/bin/lint-migrations-file")}
            "clojure" "-M:test"))

(defn- run-clojure-checks! [label namespaces]
  (println "Running" label)
  (shell/sh "clojure"
            "-X:dev:dev/test:ee:ee-dev:drivers:drivers-dev:test:ci"
            ":only"
            (pr-str namespaces)))

(defn- run-backend-checks! []
  (run-clojure-checks! "backend checks" backend-check-namespaces))

(defn- run-module-checks! []
  (run-clojure-checks! "module checks" module-check-namespaces))

(defn- run-ratchet-checks! []
  (run-clojure-checks! "ratchet checks" ratchet-check-namespaces))

(defn run!
  "Run the project-level backend and migration checks."
  ([]
   (run-migration-checks!)
   (run-backend-checks!))
  ([suite]
   (case suite
     "backend"    (run-backend-checks!)
     "migrations" (run-migration-checks!)
     "modules"    (run-module-checks!)
     "ratchets"   (run-ratchet-checks!))))
