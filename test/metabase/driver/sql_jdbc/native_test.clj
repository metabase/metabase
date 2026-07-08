(ns metabase.driver.sql-jdbc.native-test
  "Tests for running native queries against SQL databases."
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.query-processor.test :as qp]
   [metabase.test :as mt]
   [metabase.util.malli.schema :as ms]))

(deftest ^:parallel basic-query-test
  (testing "Check that a basic query works"
    (is (partial=
         {:status    :completed
          :row_count 2
          :data      {:rows             [[100]
                                         [99]]
                      :cols             [{:name         "ID"
                                          :display_name "ID"
                                          :base_type    :type/BigInteger
                                          :effective_type :type/BigInteger
                                          :source       :native
                                          :field_ref    [:field "ID" {:base-type :type/BigInteger}]}]
                      :native_form      {:query "SELECT ID FROM VENUES ORDER BY ID DESC LIMIT 2"}
                      :results_timezone "UTC"}}
         (-> (qp/process-query {:native   {:query "SELECT ID FROM VENUES ORDER BY ID DESC LIMIT 2"}
                                :type     :native
                                :database (mt/id)})
             (m/dissoc-in [:data :results_metadata])
             (m/dissoc-in [:data :insights]))))))

(deftest ^:parallel column-ordering-test
  (testing "Check that column ordering is maintained"
    (is (partial=
         {:status    :completed
          :row_count 2
          :data      {:rows             [[100 "Mohawk Bend" 46]
                                         [99 "Golden Road Brewing" 10]]
                      :cols             [{:name         "ID"
                                          :display_name "ID"
                                          :source       :native
                                          :base_type    :type/BigInteger
                                          :effective_type :type/BigInteger
                                          :field_ref    [:field "ID" {:base-type :type/BigInteger}]}
                                         {:name         "NAME"
                                          :display_name "NAME"
                                          :source       :native
                                          :base_type    :type/Text
                                          :effective_type :type/Text
                                          :field_ref    [:field "NAME" {:base-type :type/Text}]}
                                         {:name         "CATEGORY_ID"
                                          :display_name "CATEGORY_ID"
                                          :source       :native
                                          :base_type    :type/Integer
                                          :effective_type :type/Integer
                                          :field_ref    [:field "CATEGORY_ID" {:base-type :type/Integer}]}]
                      :native_form      {:query "SELECT ID, NAME, CATEGORY_ID FROM VENUES ORDER BY ID DESC LIMIT 2"}
                      :results_timezone "UTC"}}
         (-> (qp/process-query {:native   {:query "SELECT ID, NAME, CATEGORY_ID FROM VENUES ORDER BY ID DESC LIMIT 2"}
                                :type     :native
                                :database (mt/id)})
             (m/dissoc-in [:data :results_metadata])
             (m/dissoc-in [:data :insights]))))))

(deftest ^:parallel malformed-sql-response-test
  (testing "Check that we get proper error responses for malformed SQL"
    (is (malli= [:map
                 [:status     [:= :failed]]
                 [:class      [:= org.h2.jdbc.JdbcSQLSyntaxErrorException]]
                 [:error      #"^Column \"ZID\" not found"]
                 [:stacktrace [:sequential ms/NonBlankString]]
                 [:json_query [:map
                               [:native [:map [:query [:= "SELECT ZID FROM CHECKINS LIMIT 2"]]]]
                               [:type [:= :native]]]]]
                (qp/process-query
                 (qp/userland-query
                  {:native   {:query "SELECT ZID FROM CHECKINS LIMIT 2"}
                   :type     :native
                   :database (mt/id)}))))))

(deftest ^:parallel malformed-sql-error-type-test
  (testing "Malformed native SQL is classified as :invalid-query regardless of whether the query has parameters (#71637)"
    (testing "without parameters (Statement path)"
      (is (=? {:status     :failed
               :error_type :invalid-query
               :error      #"(?s)Column \"ASDF\" not found.*"}
              (qp/process-query
               (qp/userland-query
                (lib/native-query (mt/metadata-provider) "SELECT * FROM ORDERS GROUP BY ASDF"))))))
    (testing "with parameters (PreparedStatement path)"
      (let [query (-> (lib/native-query (mt/metadata-provider)
                                        "SELECT * FROM ORDERS WHERE CATEGORY = {{category}} GROUP BY ASDF")
                      (assoc :parameters [{:type   :text
                                           :name   "category"
                                           :target [:variable [:template-tag "category"]]
                                           :value  "Widget"}]))]
        (is (=? {:status     :failed
                 :error_type :invalid-query
                 :error      #"(?s)Column \"ASDF\" not found.*"}
                (qp/process-query (qp/userland-query query))))))))
