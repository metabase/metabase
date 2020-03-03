(ns metabase.query-processor.query-to-expected-cols-test
  "Tests for `metabase.query-processor/query->expected-cols`."
  (:require [clojure.test :refer :all]
            [metabase
             [query-processor :as qp]
             [test :as mt]]))

(deftest deduplicate-column-names-test
  (testing "`qp/query->expected-cols` should return deduplicated column names"
    (is (= ["ID" "DATE" "USER_ID" "VENUE_ID" "ID_2" "NAME" "LAST_LOGIN"]
           (map :name (qp/query->expected-cols
                       (mt/mbql-query checkins
                         {:source-table $$checkins
                          :joins
                          [{:fields       :all
                            :alias        "u"
                            :source-table $$users
                            :condition    [:= $user_id &u.users.id]}]})))))))
