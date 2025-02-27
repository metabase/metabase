(ns mage.core-test
  (:require
   [clojure.string :as str]
   [mage.start-db-test :as start-db-test]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(defn bin-mage-has-help? []
  (doseq [help-cmds [[] [" "] ["  "]
                     ["-h"] ["--help"]
                     [" -h"] [" --help"]
                     ["  -h"] ["  --help"]]]
    (let [cmd (str "./bin/mage " (str/join " " help-cmds))
          out (u/sh cmd)]
      (println (str "Testing that bin/mage has help with '" (pr-str cmd) "'"))
      (when-not (str/includes? out "The following tasks are available:")
        (System/exit 1)))))

(defn bb-tasks-list []
  (->> "bb tasks"
       u/shl
       (drop 2)
       (map (comp first #(str/split % #"\s+")))
       vec))

(defn- bb-task-has-example? [task-name]
  (doseq [cmd [(str "./bin/mage " task-name " -h")
               (str "./bin/mage " task-name " --help")]]
    (println (str "Testing that task has examples with '" cmd "'"))
    (when-not (str/includes? (u/sh cmd) "Examples:")
      (System/exit 1))))

(when (= *file* (System/getProperty "babashka.file"))
  (mapv bb-task-has-example? (bb-tasks-list))
  (bin-mage-has-help?)
  (start-db-test/run-tests)
  (println "All tests passed")
  (System/exit 0))
