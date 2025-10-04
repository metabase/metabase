(ns metabase-enterprise.representations.v0.export-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.representations.export :as export]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest export-group-test
  (testing "We get the question and database when exporting the question"
    (mt/with-temp [:model/Card question {:type :question
                                         :dataset_query (mt/native-query {:query "select 1"})}]
      (let [database (t2/select-one :model/Database :id (mt/id))
            qrep (export/export-entity question)
            drep (export/export-entity database)
            set (export/export-set #{qrep})]
        (is (= (:id database)
               (:database_id question)))
        (is (= 2 (count set)))
        (is (= #{qrep drep}
               set)))))

  (testing "We get the question, the question it refers to, and database when exporting the question"
    (mt/with-temp [:model/Card question1 {:type :question
                                          :dataset_query (mt/native-query {:query "select 1"})}
                   :model/Card question2 {:type :question
                                          :dataset_query (mt/mbql-query nil {:source-table (str "card__" (:id question1))})}]
      (let [database (t2/select-one :model/Database :id (mt/id))
            qrep1 (export/export-entity question1)
            qrep2 (export/export-entity question2)
            drep (export/export-entity database)
            set (export/export-set #{qrep2})]
        (is (= 3 (count set)))
        (is (= #{qrep2 drep qrep1} set))))))
