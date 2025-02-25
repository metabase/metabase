(ns mage.core-test
  (:require
   [clojure.string :as str]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(def excluded-public-tasks
  "Private tasks aren't tested, and do not have the same level of reliability!!"
  #{"nrepl"})

(defn bb-tasks-list []
  (->> "bb tasks"
       u/shl
       (drop 2)
       (map (comp first #(str/split % #"\s+")))
       (remove excluded-public-tasks)
       vec))

(defn- bb-task-has-example? [task-name]
  (doseq [cmd [(str "bb " task-name " -h")
               (str "bb " task-name " --help")]]
    (println (str "Testing that task has examples with '" cmd "'"))
    (when-not (str/includes? (u/sh cmd) "Examples:")
      (System/exit 1))))

(when (= *file* (System/getProperty "babashka.file"))
  (mapv bb-task-has-example? (bb-tasks-list))
  (println "All tests passed")
  (System/exit 0))
