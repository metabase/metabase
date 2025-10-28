(ns representations.schema.v0.question-test
  (:require [clojure.test :refer :all]
            [representations.read :as read]))

(deftest question-schema-test
  (testing "question representation schema with native query is valid"
    (let [question {:type :question
                    :version :v0
                    :ref "question-123"
                    :name "foo question"
                    :description "a test question"
                    :database "database-1"
                    :query "select 1"
                    :collection nil}]
      (is (= question
             (read/parse question)))))
  (testing "question representation schema with mbql query is valid"
    (let [question {:type :question
                    :version :v0
                    :ref "question-123"
                    :name "foo question"
                    :description "a test question"
                    :database "database-1"
                    :mbql_query {:query :some-query}
                    :collection nil}]
      (is (= question
             (read/parse question)))))
  (testing "question representation schema with native mbql query is invalid"
    (let [question {:type :question
                    :version :v0
                    :ref "question-123"
                    :name "foo question"
                    :description "a test question"
                    :database "database-1"
                    :query "select 1"
                    :mbql_query {:query :some-query}
                    :collection nil}]
      (is (thrown-with-msg? Exception
                            #"Value does not match schema"
                            (read/parse question))))))
