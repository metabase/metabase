(ns metabase-enterprise.serialization.v2.util-test
  (:require [clojure.test :refer :all]
            [metabase.models.serialization.util :as serdes.util]
            [metabase.models :refer [Card Database Field Table]]
            [metabase-enterprise.serialization.test-util :as ts]))

(deftest mbql-deserialize-test
  (ts/with-empty-h2-app-db
    (ts/with-temp-dpc [Database   [{db-id      :id} {:name "Metabase Store"}]
                       Table      [{crm-id     :id} {:name  "crm_survey_response"
                                                     :db_id db-id
                                                     :schema "public"}]
                       Field      [{created-id :id} {:name "created_at"
                                                     :table_id crm-id}]
                       Field      [{nps-id     :id} {:name "nps"
                                                     :table_id crm-id}]]
      (is (= {:database db-id
              :type     "query"
              :query    {:source-table crm-id
                         :aggregation  [["cum-count"]]
                         :breakout     [["datetime-field" [:field created-id] "week"]]
                         :filter       ["<" [:field nps-id] 9]}}
             (#'serdes.util/mbql-fully-qualified-names->ids
               {:database "Metabase Store",
                :type     "query",
                :query    {:source-table ["Metabase Store" "public" "crm_survey_response"],
                           :aggregation  [["cum-count"]],
                           :breakout     [["datetime-field" ["field-id" ["Metabase Store" "public"
                                                                         "crm_survey_response" "created_at"]] "week"]],
                           :filter       ["<" ["field-id" ["Metabase Store" "public" "crm_survey_response" "nps"]] 9]}}))))))

