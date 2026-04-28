(ns metabase-enterprise.serialization.v2.test-util-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.test-util :as ts]
   [metabase.models.serialization :as serdes]
   [metabase.test :as mt]))

(deftest mbql-deserialize-test
  (mt/with-empty-h2-app-db!
    (ts/with-temp-dpc [:model/Database   {db-id      :id} {:name "Metabase Store"}
                       :model/Table      {crm-id     :id} {:name  "crm_survey_response"
                                                           :db_id db-id
                                                           :schema "public"}
                       :model/Field      {created-id :id} {:name "created_at"
                                                           :table_id crm-id}
                       :model/Field      {nps-id     :id} {:name "nps"
                                                           :table_id crm-id}]
      (is (= {:database db-id
              :type     "query"
              :query    {:source-table crm-id
                         :aggregation  [["cum-count"]]
                         :breakout     [[:field created-id {"temporal-unit" "week"}]]
                         :filter       ["<" [:field nps-id nil] 9]}}
             (#'serdes/import-mbql
              {:database "Metabase Store",
               :type     "query",
               :query    {:source-table ["Metabase Store" "public" "crm_survey_response"],
                          :aggregation  [["cum-count"]],
                          :breakout     [["field"
                                          ["Metabase Store" "public"
                                           "crm_survey_response" "created_at"]
                                          {"temporal-unit" "week"}]]
                          :filter       ["<" ["field" ["Metabase Store" "public" "crm_survey_response" "nps"] nil] 9]}}))))))
