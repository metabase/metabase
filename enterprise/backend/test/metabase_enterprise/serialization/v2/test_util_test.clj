(ns metabase-enterprise.serialization.v2.test-util-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.test-util :as ts]
   [metabase.models :refer [Database Field Table]]
   [metabase.models.serialization :as serdes]
   [metabase.test :as mt]))

(deftest mbql-deserialize-test
  (mt/with-empty-h2-app-db
    (ts/with-temp-dpc [Database   {db-id      :id} {:name "Metabase Store"}
                       Table      {crm-id     :id} {:name  "crm_survey_response"
                                                    :db_id db-id
                                                    :schema "public"}
                       Field      {created-id :id} {:name "created_at"
                                                    :table_id crm-id}
                       Field      {nps-id     :id} {:name "nps"
                                                    :table_id crm-id}]
      (is (= {:database db-id
              :type     "query"
              :query    {:source-table crm-id
                         :aggregation  [["cum-count"]]
                         :breakout     [["datetime-field" [:field created-id] "week"]]
                         :filter       ["<" [:field nps-id] 9]}}
             (#'serdes/mbql-fully-qualified-names->ids
               {:database "Metabase Store",
                :type     "query",
                :query    {:source-table ["Metabase Store" "public" "crm_survey_response"],
                           :aggregation  [["cum-count"]],
                           :breakout     [["datetime-field" ["field-id" ["Metabase Store" "public"
                                                                         "crm_survey_response" "created_at"]] "week"]],
                           :filter       ["<" ["field-id" ["Metabase Store" "public" "crm_survey_response" "nps"]] 9]}}))))))
