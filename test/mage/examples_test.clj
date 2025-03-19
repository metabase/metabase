(ns mage.examples-test
  (:require
   [clojure.edn :as edn]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(defn- task->task-maps []
  (dissoc (:tasks (edn/read-string (slurp "bb.edn"))) :requires))

(defn- task->examples []
  (update-vals (task->task-maps) :examples))

(def ^:private excluded-public-task-examples #{"nrepl"})

(defn run-tests
  "This takes a while to run, so it is not run by default. To run it, use the `./bin/mage -test-examples` command."
  []
  (let [public-tasks (set (u/public-bb-tasks-list))]
    (println "Running example tests for:" public-tasks "\n")
    (doseq [[task-name examples] (task->examples)
            :when (contains? public-tasks (str task-name))
            :when (not (excluded-public-task-examples (str task-name)))
            [cmd explaination] examples]
      (println task-name)
      (println "Testing that running ['" cmd "' -> '" explaination "'] returns a 0 exit-code...")
      (try (u/sh cmd)
           (catch Exception _ (println "Failed" task-name ":" cmd))
           (println "OK"))))
  (println "Done.")
  :ok)
