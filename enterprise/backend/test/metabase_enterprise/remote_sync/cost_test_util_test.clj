(ns metabase-enterprise.remote-sync.cost-test-util-test
  "Tests for the cost helpers. Not ^:parallel: [[cost/measure!]] uses the JVM-wide JDBC counter."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.cost-test-util :as cost]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(deftest rows-rewritten-empty-table-test
  (testing ":rows-rewritten of one card insert does not depend on whether the Card table was empty before"
    (mt/with-empty-h2-app-db!
      (let [user      (t2/insert-returning-pk! :model/User {:email      "cost@example.com"
                                                            :first_name "Cost"
                                                            :last_name  "Test"
                                                            :password   "p4ssw0rd!x"})
            db        (t2/insert-returning-pk! :model/Database {:name "Cost" :engine :h2 :details {}})
            new-card! (fn [n]
                        (t2/insert-returning-pk! :model/Card
                                                 {:name                   (str "Cost card " n)
                                                  :creator_id             user
                                                  :database_id            db
                                                  :display                :table
                                                  :visualization_settings {}
                                                  :dataset_query          {:database db
                                                                           :type     :native
                                                                           :native   {:query "SELECT 1"}}}))
            into-empty    (cost/measure! #(new-card! 1))
            into-nonempty (cost/measure! #(new-card! 2))]
        (is (= (:rows-rewritten into-nonempty)
               (:rows-rewritten into-empty)))))))
