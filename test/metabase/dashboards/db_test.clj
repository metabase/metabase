(ns metabase.dashboards.db-test
  (:require
   [clojure.test :refer :all]
   [honey.sql :as sql]
   [metabase.dashboards.db :as dashboards.db]))

(set! *warn-on-reflection* true)

(deftest ^:parallel link-card-id-compiles-as-query-parameter-test
  (testing "a non-integer id is rejected when building the link-card query"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"must be an integer"
         (#'dashboards.db/link-card-info-query-for-model "card" {:raw "x"}))))
  (testing "single-id and collection forms both pass a legitimate id as a bind parameter"
    (doseq [ids [42 #{42} [42]]]
      (let [[query & params] (sql/format (#'dashboards.db/link-card-info-query-for-model "card" ids))]
        (is (re-find #"\?" query) "the id appears as a bind parameter")
        (is (= [42] params))))))
