(ns metabase.lib-be.models.transforms-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib-be.core :as lib-be]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]))

(deftest ^:parallel handle-bad-template-tags-test
  (testing (str "an malformed template tags map like the one below is invalid. Rather than potentially destroy an entire API "
                "response because of one malformed Card, dump the error to the logs and return nil.")
    (is (= nil
           ((:out lib-be/transform-query)
            (json/encode
             {:database 1
              :type     :native
              :native   {:template-tags 1000}}))))))

(deftest ^:parallel template-tag-validate-saves-test
  (testing "on the other hand we should be a little more strict on the way and disallow you from saving the invalid stuff"
    ;; TODO -- we should make sure this returns a good error message so we don't have to dig thru the exception chain.
    (is (thrown?
         Exception
         ((:in lib-be/transform-query)
          {:database 1
           :type     :native
           :native   {:template-tags {100 [:field-id "WOW"]}}})))))

(deftest ^:parallel normalize-empty-query-test
  (is (= {}
         ((:out lib-be/transform-query) "{}"))))

(deftest ^:parallel normalize-busted-query-test
  ;; this validation should be done even in prod
  (mu/disable-enforcement
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"\QQuery must include :database\E"
         (lib-be/normalize-query {:query {:source-table "card__117"}})))))

(deftest ^:parallel normalize-busted-query-test-2
  ;; this validation should be done even in prod
  (mu/disable-enforcement
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"\QQuery must include :lib/type or :type\E"
         (lib-be/normalize-query {:database 1, :query {:source-table "card__117"}})))))

(deftest ^:parallel normalize-busted-query-test-3
  ;; this validation should be done even in prod
  (mu/disable-enforcement
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"\QMBQL 4 keys like :type, :query, or :native are not allowed in MBQL 5 queries with :lib/type\E"
         (lib-be/normalize-query {:database 1, :lib/type :mbql/query, :query {:source-table "card__117"}})))))

(deftest ^:parallel normalize-busted-query-test-4
  ;; this validation should be done even in prod
  (mu/disable-enforcement
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"\QMBQL 5 :stages is not allowed in an MBQL 4 query with :type\E"
         (lib-be/normalize-query {:database 1, :type :query, :stages []})))))
