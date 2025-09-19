(ns metabase-enterprise.representations.v0.question-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.representations.core :as rep]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2]))

(deftest validate-example-yamls
  (testing "Testing valid examples"
    (doseq [filename
            ["test_resources/representations/v0/monthly-revenue.question.yml"]]
      (testing (str "Validating: " filename)
        (let [rep (yaml/from-file filename)]
          (is (rep/validate rep))))))
  (testing "Testing invalid examples"
    (doseq [filename
            ["test_resources/representations/v0/invalid.question.yml"]]
      (testing (str "Validating: " filename)
        (let [rep (yaml/from-file filename)]
          (is (thrown? clojure.lang.ExceptionInfo (rep/validate rep))))))))

(deftest validate-exported-questions
  (doseq [question (t2/select :model/Card :type :question)]
    (let [edn (rep/export question)
          ;; convert to yaml and read back in to convert keywords to strings, etc
          yaml (yaml/generate-string edn)
          rep  (yaml/parse-string yaml)]
      (is (rep/validate rep)))))
