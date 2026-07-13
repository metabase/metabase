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
