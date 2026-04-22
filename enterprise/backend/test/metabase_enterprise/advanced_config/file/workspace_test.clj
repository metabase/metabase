(ns metabase-enterprise.advanced-config.file.workspace-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.advanced-config.file.workspace :as acf.ws]))

(deftest normalize-test
  (testing "Looks up db-id-by-name to change the indexing of the databases map"
    (is (= {:name "github"
            :databases
            {2
             {:input_schemas ["raw_github"]
              :output_schema "mb__isolation_754bd_github"
              :name          "Analytics Data Warehouse"
              :id            2}}}
           (acf.ws/normalize
            {:db-id-by-name {"Analytics Data Warehouse" 2}}
            {:name "github"
             :databases
             {(keyword "Analytics Data Warehouse")
              {:input_schemas ["raw_github"]
               :output_schema "mb__isolation_754bd_github"}}})))))
