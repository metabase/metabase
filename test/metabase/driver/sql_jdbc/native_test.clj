(ns metabase.driver.sql-jdbc.native-test
  "Tests for running native queries against SQL databases."
  (:require [clojure.test :refer :all]
            [medley.core :as m]
            [metabase.query-processor :as qp]
            [metabase.test.data :as data]
            [metabase.test.util.log :as tu.log]
            [metabase.util.schema :as su]
            [schema.core :as s]))

(deftest basic-query-test
  (testing "Check that a basic query works"
    (is (= {:status    :completed
            :row_count 2
            :data      {:rows             [[100]
                                           [99]]
                        :cols             [{:name         "ID"
                                            :display_name "ID"
                                            :base_type    :type/BigInteger
                                            :source       :native
                                            :field_ref    [:field-literal "ID" :type/BigInteger]}]
                        :native_form      {:query "SELECT ID FROM VENUES ORDER BY ID DESC LIMIT 2"}
                        :results_timezone "UTC"}}
           (-> (qp/process-query {:native   {:query "SELECT ID FROM VENUES ORDER BY ID DESC LIMIT 2"}
                                  :type     :native
                                  :database (data/id)})
               (m/dissoc-in [:data :results_metadata])
               (m/dissoc-in [:data :insights]))))))

(deftest column-ordering-test
  (testing "Check that column ordering is maintained"
    (is (= {:status    :completed
            :row_count 2
            :data      {:rows             [[100 "Mohawk Bend" 46]
                                           [99 "Golden Road Brewing" 10]]
                        :cols             [{:name         "ID"
                                            :display_name "ID"
                                            :source       :native
                                            :base_type    :type/BigInteger
                                            :field_ref    [:field-literal "ID" :type/BigInteger]}
                                           {:name         "NAME"
                                            :display_name "NAME"
                                            :source       :native
                                            :base_type    :type/Text
                                            :field_ref    [:field-literal "NAME" :type/Text]}
                                           {:name         "CATEGORY_ID"
                                            :display_name "CATEGORY_ID"
                                            :source       :native
                                            :base_type    :type/Integer
                                            :field_ref    [:field-literal "CATEGORY_ID" :type/Integer]}]
                        :native_form      {:query "SELECT ID, NAME, CATEGORY_ID FROM VENUES ORDER BY ID DESC LIMIT 2"}
                        :results_timezone "UTC"}}
           (-> (qp/process-query {:native   {:query "SELECT ID, NAME, CATEGORY_ID FROM VENUES ORDER BY ID DESC LIMIT 2"}
                                  :type     :native
                                  :database (data/id)})
               (m/dissoc-in [:data :results_metadata])
               (m/dissoc-in [:data :insights]))))))

(deftest malformed-sql-response-test
  (testing "Check that we get proper error responses for malformed SQL"
    (tu.log/suppress-output
      (is (schema= {:status     (s/eq :failed)
                    :class      (s/eq org.h2.jdbc.JdbcSQLException)
                    :error      #"^Column \"ZID\" not found"
                    :stacktrace [su/NonBlankString]
                    :json_query {:native   {:query (s/eq "SELECT ZID FROM CHECKINS LIMIT 2")}
                                 :type     (s/eq :native)
                                 s/Keyword s/Any}
                    s/Keyword   s/Any}
                   (qp/process-userland-query
                    {:native   {:query "SELECT ZID FROM CHECKINS LIMIT 2"}
                     :type     :native
                     :database (data/id)}))))))
