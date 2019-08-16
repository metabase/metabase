(ns metabase.driver.sql-jdbc.native-test
  "Tests for running native queries against SQL databases."
  (:require [expectations :refer [expect]]
            [medley.core :as m]
            [metabase.query-processor :as qp]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.util.log :as tu.log]
            [metabase.util.schema :as su]
            [schema.core :as s]))

;; Just check that a basic query works
(expect
  {:status    :completed
   :row_count 2
   :data      {:rows        [[100]
                             [99]]
               :cols        [{:name         "ID"
                              :display_name "ID"
                              :base_type    :type/Integer
                              :source       :native
                              :field_ref    [:field-literal "ID" :type/Integer]}]
               :native_form {:query "SELECT ID FROM VENUES ORDER BY ID DESC LIMIT 2"}}}
  (-> (qp/process-query {:native   {:query "SELECT ID FROM VENUES ORDER BY ID DESC LIMIT 2"}
                         :type     :native
                         :database (data/id)})
      (m/dissoc-in [:data :results_metadata])
      (m/dissoc-in [:data :insights])))

;; Check that column ordering is maintained
(expect
  {:status    :completed
   :row_count 2
   :data      {:rows        [[100 "Mohawk Bend" 46]
                             [99 "Golden Road Brewing" 10]]
               :cols        [{:name         "ID"
                              :display_name "ID"
                              :source       :native
                              :base_type    :type/Integer
                              :field_ref    [:field-literal "ID" :type/Integer]}
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
               :native_form {:query "SELECT ID, NAME, CATEGORY_ID FROM VENUES ORDER BY ID DESC LIMIT 2"}}}
  (-> (qp/process-query {:native   {:query "SELECT ID, NAME, CATEGORY_ID FROM VENUES ORDER BY ID DESC LIMIT 2"}
                         :type     :native
                         :database (data/id)})
      (m/dissoc-in [:data :results_metadata])
      (m/dissoc-in [:data :insights])))

;; Check that we get proper error responses for malformed SQL
(tu/expect-schema
  {:status     (s/eq :failed)
   :class      (s/eq java.lang.Exception)
   :error      (s/eq "Column \"ZID\" not found")
   :stacktrace [su/NonBlankString]
   :query      {:native {:query (s/eq "SELECT ZID FROM CHECKINS LIMIT 2")}
                :type (s/eq :native)}
   :cause      {:class (s/eq org.h2.jdbc.JdbcSQLException)
                :error #"Column \"ZID\" not found; SQL statement:.*"}}
  (tu.log/suppress-output
    (qp/process-query {:native   {:query "SELECT ZID FROM CHECKINS LIMIT 2"}
                       :type     :native
                       :database (data/id)})))
