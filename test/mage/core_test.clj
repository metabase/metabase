(ns mage.core-test
  (:require
   [babashka.tasks :as bt]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(defn bin-mage-has-help? []
  (doseq [help-cmds [[] [" "] ["  "]
                     ["-h"] ["--help"]
                     [" -h"] [" --help"]
                     ["  -h"] ["  --help"]]
          :let [cmd (str "./bin/mage " (str/join " " help-cmds))]]
    (testing (format "'%s'" (pr-str cmd))
      (let [out (u/sh cmd)]
        (when-not (str/includes? out "The following tasks are available:")
          (System/exit 1))))))

(defn- bb-task-has-example? [task-name]
  (doseq [cmd [(str "./bin/mage " task-name " -h")
               (str "./bin/mage " task-name " --help")]]
    (testing (format "'%s'" cmd)
      (is (str/includes? (u/sh cmd) "Examples:")))))

(defn invalid-task-names-print-help-test []
  (doseq [task-name ["foo" "bar" "baz"]]
    (let [cmd (str "./bin/mage " task-name)]
      (testing (format "'%s'" cmd)
        (let [result (try (bt/shell {:err :string :out :string} "./bin/mage foo")
                          (catch Exception e (:out (:proc (ex-data e)))))]
          (is (str/includes? result "The following tasks are available:")))))))

(deftest mage-tests
  (println "Running mage tests")

  (println "  bb tasks have examples")
  (testing "bb tasks have examples"
    (mapv bb-task-has-example? (u/public-bb-tasks-list)))

  (println "  bb tasks have help")
  (testing "mage has help"
    (bin-mage-has-help?))

  (println "  invalid task names print help")
  (testing "Invalid task name prints help"
    (invalid-task-names-print-help-test)))
