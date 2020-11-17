(ns metabase.models.query-test
  (:require [clojure.test :refer :all]
            [metabase
             [models :refer [Card]]
             [test :as mt]]
            [metabase.models.query :as query]))

(deftest query->database-and-table-ids-test
  (mt/with-temp Card [card {:dataset_query {:database (mt/id)
                                            :type     :query
                                            :query    {:source-table (mt/id :venues)}}}]
    (doseq [[message {:keys [expected query]}]
            {"A basic query"
             {:expected {:database-id 1, :table-id 1}
              :query    {:database 1
                         :type     :query
                         :query    {:source-table 1}}}

             "For native queries, table-id should be nil"
             {:expected {:database-id 1, :table-id nil}
              :query    {:database 1
                         :type     :native
                         :native   {:query "SELECT * FROM some_table;"}}}

             "If the query has a card__id source table, we should fetch database and table ID from the Card"
             {:expected {:database-id (mt/id)
                         :table-id    (mt/id :venues)}
              :query    {:database 1000
                         :type     :query
                         :query    {:source-table (format "card__%d" (:id card))}}}

             "If the query has a source-query we should recursively look at the database/table ID of the source query"
             {:expected {:database-id 5, :table-id 6}
              :query    {:database 5
                         :type     :query
                         :query    {:source-query {:source-table 6}}}}}]
      (testing message
        (is (= expected
               (into {} (query/query->database-and-table-ids query))))))))
