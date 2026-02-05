(ns metabase-enterprise.mcp.tools.query-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.mcp.tools :as mcp.tools]
   [metabase-enterprise.mcp.tools.query]))

(deftest run-query-tool-registered-test
  (testing "run_query tool is in the global registry"
    (is (contains? @mcp.tools/global-registry "run_query"))))

(deftest query-table-tool-registered-test
  (testing "query_table tool is in the global registry"
    (is (contains? @mcp.tools/global-registry "query_table"))))

(deftest format-query-result-test
  (testing "format-query-result handles completed results"
    (let [fmt #'metabase-enterprise.mcp.tools.query/format-query-result
          result {:status :completed
                  :data   {:cols [{:name "id" :display_name "ID" :base_type :type/Integer}
                                  {:name "name" :display_name "Name" :base_type :type/Text}]
                           :rows [[1 "Alice"] [2 "Bob"]]}}
          formatted (fmt result)]
      (is (= 2 (:row_count formatted)))
      (is (= 2 (count (:columns formatted))))
      (is (= "Integer" (get-in formatted [:columns 0 :base_type])))))
  (testing "format-query-result handles failed results"
    (let [fmt #'metabase-enterprise.mcp.tools.query/format-query-result
          result {:status :failed :error "bad query"}
          formatted (fmt result)]
      (is (= "bad query" (:error formatted))))))
