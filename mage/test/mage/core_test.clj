(ns mage.core-test
  (:require
   [babashka.tasks :as bt]
   [clojure.string :as str]
   [clojure.test :as t :refer [deftest is testing]]
   [mage.token-scan-test]
   [mage.util :as u]
   [mage.util-test]))

(set! *warn-on-reflection* true)

(comment
  mage.token-scan-test/keep-me
  mage.util-test/keep-me)

(deftest bin-mage-has-help-test
  (doseq [help-cmds [[] [" "] ["  "] ["-h"] ["--help"] [" -h"] [" --help"] ["  -h"] ["  --help"]]
          :let [cmd (str "./bin/mage " (str/join " " help-cmds))
                title (format "'%s' returns help information" (pr-str cmd))]]
    (println title)
    (testing title
      (let [out (u/sh cmd)]
        (is (str/includes? out "The following tasks are available:"))))))

(deftest bb-task-has-example-test
  (doseq [task-name (u/public-bb-tasks-list)
          cmd [(str "./bin/mage " task-name " -h")
               (str "./bin/mage " task-name " --help")]]
    (println "Checking examples for command:" cmd)
    (testing (format "%s has examples with: '%s'" task-name cmd)
      (is (str/includes? (u/sh cmd) "Examples:")))))

(deftest invalid-task-names-print-help-test
  (doseq [task-name ["foo" "bar" "baz"]]
    (let [cmd (str "./bin/mage " task-name)
          title (format "invalid task names like: '%s' print help" cmd)]
      (testing title
        (let [result (try (bt/shell {:err :string :out :string} (str "./bin/mage " task-name))
                          (catch Exception e (:out (:proc (ex-data e)))))]
          (is (str/includes? result "The following tasks are available:")))))))
