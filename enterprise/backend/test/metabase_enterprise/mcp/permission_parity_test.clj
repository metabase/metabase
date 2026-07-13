(ns metabase-enterprise.mcp.permission-parity-test
  "The sandboxed-user rows of the permission-parity matrix. Sandboxing is EE, so these rows live here
   and reuse the harness in [[metabase.mcp.permission-parity-test]]."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.sandbox.test-util :as met]
   [metabase.mcp.permission-parity-test :as parity]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest execute-sql-sandboxed-user-parity-test
  (testing "a sandboxed user is refused a native query by both surfaces — raw SQL would escape the sandbox"
    (mt/with-premium-features #{:sandboxes}
      (met/with-gtaps! {:gtaps {:venues {}}}
        (parity/check-parity!
         {:scenario :sandboxed-user
          :user     :rasta
          :expect   :denied
          :tool     ["execute_sql" {:database_id (mt/id) :sql "SELECT * FROM VENUES"}]
          :rest     [:post "dataset" {:database (mt/id)
                                      :type     :native
                                      :native   {:query "SELECT * FROM VENUES"}}]})))))

(deftest browse-data-get-fields-sandboxed-user-parity-test
  (testing "a sandboxed user reads a table's metadata through both surfaces — the sandbox filters columns, it does not deny"
    (mt/with-premium-features #{:sandboxes}
      (met/with-gtaps! {:gtaps {:venues {}}}
        (parity/check-parity!
         {:scenario :sandboxed-user
          :user     :rasta
          :expect   :allowed
          :tool     ["browse_data" {:action "get_fields" :table_ids [(mt/id :venues)]}]
          :rest     [:get (str "table/" (mt/id :venues) "/query_metadata")]})))))

(deftest get-parameter-values-sandboxed-user-parity-test
  (testing "a sandboxed user reads a dashboard filter's values through both surfaces — the sandbox narrows the values
            it returns, it does not deny the read"
    (mt/with-premium-features #{:sandboxes}
      (met/with-gtaps! {:gtaps {:venues {}}}
        (mt/with-temp [:model/Card      card {:dataset_query (mt/mbql-query venues)}
                       :model/Dashboard dash {:parameters [{:name "Category" :slug "category"
                                                            :id   "cat" :type "string/="}]}
                       :model/DashboardCard _ {:dashboard_id       (:id dash)
                                               :card_id            (:id card)
                                               :parameter_mappings [{:parameter_id "cat"
                                                                     :card_id      (:id card)
                                                                     :target       [:dimension (mt/$ids venues $category_id->categories.name)]}]}]
          (parity/check-parity!
           {:scenario :sandboxed-user
            :user     :rasta
            :expect   :allowed
            :tool     ["get_parameter_values" {:target "dashboard" :id (:id dash) :parameter_id "cat"}]
            :rest     [:get (str "dashboard/" (:id dash) "/params/cat/values")]}))))))

(deftest execute-question-sandboxed-user-parity-test
  (testing "a sandboxed user may still run a saved question — the sandbox filters rows, it does not deny"
    (mt/with-premium-features #{:sandboxes}
      (met/with-gtaps! {:gtaps {:venues {}}}
        (mt/with-temp [:model/Card card {:dataset_query (mt/mbql-query venues {:limit 1})}]
          (parity/check-parity!
           {:scenario :sandboxed-user
            :user     :rasta
            :expect   :allowed
            :tool     ["execute_question" {:id (:id card)}]
            :rest     [:post (str "card/" (:id card) "/query")]}))))))
