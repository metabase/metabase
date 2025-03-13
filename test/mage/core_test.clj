(ns mage.core-test
  (:require
   [babashka.tasks :as bt]
   [clojure.string :as str]
   [mage.start-db-test :as start-db-test]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(defn bin-mage-has-help? []
  (doseq [help-cmds [[] [" "] ["  "]
                     ["-h"] ["--help"]
                     [" -h"] [" --help"]
                     ["  -h"] ["  --help"]]
          :let [cmd (str "./bin/mage " (str/join " " help-cmds))]]
    (println (str "Testing that bin/mage has help with '" (pr-str cmd) "'"))
    (let [out (u/sh cmd)]
      (when-not (str/includes? out "The following tasks are available:")
        (System/exit 1)))))

(defn- bb-task-has-example? [task-name]
  (doseq [cmd [(str "./bin/mage " task-name " -h")
               (str "./bin/mage " task-name " --help")]]
    (println (str "Testing that task has examples with '" cmd "'"))
    (when-not (str/includes? (u/sh cmd) "Examples:")
      (System/exit 1))))

(defn invalid-task-names-print-help-test []
  (doseq [task-name ["foo" "bar" "baz"]]
    (let [cmd (str "./bin/mage " task-name)]
      (print "testing that" cmd "prints help")
      (let [result (try (bt/shell {:err :string :out :string} "./bin/mage foo")
                        (catch Exception e (:out (:proc (ex-data e)))))]
        (if (str/includes? result "The following tasks are available:")
          (println " OK")
          (System/exit 1))))))

(defn run-tests [& _args]
  (mapv bb-task-has-example? (u/public-bb-tasks-list))
  (bin-mage-has-help?)
  (invalid-task-names-print-help-test)
  (start-db-test/run-tests)
  (println "Examples tests passed"))

;; To call run-tests directly, use:
;; bb ./test/mage/core_test.clj
(when (= *file* (System/getProperty "babashka.file"))
  (run-tests)
  :ok)
