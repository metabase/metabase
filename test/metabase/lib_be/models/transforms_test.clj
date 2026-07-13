(ns metabase.lib-be.models.transforms-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib-be.metadata.bootstrap :as lib-be.bootstrap]
   [metabase.models.interface :as mi]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]))

(deftest ^:parallel handle-bad-template-tags-test
  (testing (str "an malformed template tags map like the one below is invalid. Rather than potentially destroy an entire API "
                "response because of one malformed Card, dump the error to the logs and return nil.")
    (is (= {}
           ((:out lib-be/transform-query)
            (json/encode
             {:database 1
              :type     :native
              :native   {:template-tags 1000}}))))))

(deftest ^:parallel template-tag-validate-saves-test
  (testing "on the other hand we should be a little more strict on the way in and disallow you from saving the invalid stuff"
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
  (mu/disable-enforcement
    (is (= {}
           (lib-be/normalize-query {:query {:source-table "card__117"}})))))

(deftest ^:parallel normalize-busted-query-test-2
  (mu/disable-enforcement
    (is (= {}
           (lib-be/normalize-query {:database 1, :query {:source-table "card__117"}})))))

(deftest ^:parallel normalize-busted-query-test-3
  (mu/disable-enforcement
    (is (= {}
           (lib-be/normalize-query {:database 1, :lib/type :mbql/query, :query {:source-table "card__117"}})))))

(deftest ^:parallel normalize-busted-query-test-4
  (mu/disable-enforcement
    (is (= {}
           (lib-be/normalize-query {:database 1, :type :query, :stages []})))))

(deftest ^:parallel normalize-busted-query-test-5
  (testing "A totally broken query should get normalized to a map rather than return a string or nil"
    (mu/disable-enforcement
      (is (= {}
             ((:out lib-be/transform-query) "WOW THIS IS A MESSED UP DATASET_QUERY!"))))))

(deftest ^:parallel normalize-invalid-widget-type-test
  (is (=? {:lib/type :mbql/query
           :stages   [{:lib/type :mbql.stage/native
                       :template-tags
                       {"device_category"
                        {:widget-type  :category
                         :id           "e8b0b767-0f02-b640-5de3-128e7f7fd71e"
                         :name         "device_category"
                         :display-name "Device category"
                         :type         :dimension
                         :dimension    [:field {} 298221]
                         :default      nil}}
                       :native   "<<NATIVE QUERY>>"}]
           :database 26}
          (mu/disable-enforcement
            (lib-be/normalize-query
             {"database" 26
              "type"     "native"
              "native"   {"template-tags"
                          {"device_category" {"id"           "e8b0b767-0f02-b640-5de3-128e7f7fd71e"
                                              "name"         "device_category"
                                              "display-name" "Device category"
                                              "type"         "dimension"
                                              "dimension"    ["field" 298221 nil]
                                              "widget-type"  "category/="
                                              "default"      nil}}
                          "query" "<<NATIVE QUERY>>"}})))))

(deftest transform-query-out-vm-error-propagates-test
  (testing "a VM Error thrown during dataset_query deserialization propagates instead of yielding an empty query"
    (mt/with-dynamic-fn-redefs [mi/json-out-without-keywordization (fn [_] (throw (Error. "boom")))]
      (is (thrown? Error
                   ((:out lib-be/transform-query) "{}")))))
  (testing "an Exception thrown during dataset_query deserialization yields an empty query"
    (mt/with-dynamic-fn-redefs [mi/json-out-without-keywordization (fn [_] (throw (RuntimeException. "boom")))]
      (is (= {}
             ((:out lib-be/transform-query) "{}")))))
  (testing "an AssertionError thrown during dataset_query deserialization is contained, yielding an empty query"
    (mt/with-dynamic-fn-redefs [mi/json-out-without-keywordization (fn [_] (throw (AssertionError. "boom")))]
      (is (= {}
             ((:out lib-be/transform-query) "{}"))))))

(deftest normalize-query-vm-error-propagates-test
  (testing "a VM Error thrown during query normalization propagates instead of yielding an empty query"
    (mt/with-dynamic-fn-redefs [lib-be.bootstrap/resolve-database (fn [& _] (throw (Error. "boom")))]
      (is (thrown? Error
                   (lib-be/normalize-query {:database 1
                                            :type     :query
                                            :query    {:source-table 2}})))))
  (testing "an Exception thrown during query normalization yields an empty query"
    (mt/with-dynamic-fn-redefs [lib-be.bootstrap/resolve-database (fn [& _] (throw (RuntimeException. "boom")))]
      (is (= {}
             (lib-be/normalize-query {:database 1
                                      :type     :query
                                      :query    {:source-table 2}}))))))
