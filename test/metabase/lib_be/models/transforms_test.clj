(ns metabase.lib-be.models.transforms-test
  (:require
   [clojure.test :refer :all]
   [flatland.ordered.map :as ordered-map]
   [metabase.lib-be.core :as lib-be]
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

(deftest ^:parallel preserve-template-tag-order-test
  (testing "Should preserve parameter order when deserializing MBQL from JSON (#5136, QUE2-607)"
    (let [json ((:in lib-be/transform-query)
                {:lib/type :mbql/query
                 :stages   [{:lib/type :mbql.stage/native
                             :template-tags
                             (into
                              (ordered-map/ordered-map)
                              (map (fn [i]
                                     (let [param-name (format "parameter_%d" i)]
                                       [param-name
                                        {:widget-type  :category
                                         :id           (format "00000000-0000-0000-0000-00000000000%d" i)
                                         :name         param-name
                                         :display-name (format "Parameter %d" i)
                                         :type         :dimension
                                         :dimension    [:field {} 1]
                                         :default      nil}])))
                              (range 10))
                             :native   "<<NATIVE QUERY>>"}]
                 :database 2})
          query ((:out lib-be/transform-query) json)]
      (is (instance? flatland.ordered.map.OrderedMap
                     (get-in query [:stages 0 :template-tags])))
      (is (= ["parameter_0"
              "parameter_1"
              "parameter_2"
              "parameter_3"
              "parameter_4"
              "parameter_5"
              "parameter_6"
              "parameter_7"
              "parameter_8"
              "parameter_9"]
             (keys (get-in query [:stages 0 :template-tags])))))))
