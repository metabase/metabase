(ns metabase-enterprise.data-apps.query-definition-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.data-apps.query-definition :as query-definition]
   [metabase.lib.schema.test-spec :as test-spec]
   [metabase.util.malli.registry :as mr]))

(def ^:private query-definition
  {:stages [{:source       {:type :table :id 1}
             :fields       [{:type :column :name "ID"}
                            {:type :column :name "NAME" :source-field-id 2}]
             :filters      [{:type :operator :operator :>
                             :args [{:type :column :name "PRICE"}
                                    {:type :literal :value 1}]}
                            {:type :segment :id 1}]
             :aggregations [{:type :operator :operator :count :args []}
                            {:type :measure :id 1}
                            {:type :metric :id 1}]
             :breakouts    [{:type :column :name "DATE" :unit :month}
                            {:type :column :name "PRICE" :bins 10}]
             :order-bys    [{:type :column :name "DATE" :unit :month :direction :asc}]
             :limit        10}]})

(deftest ^:parallel supported-query-fields-test
  (is (nil? (mr/explain ::query-definition/query-definition query-definition))))

(deftest ^:parallel unknown-query-fields-test
  (doseq [path [[] [:stages 0] [:stages 0 :source]
                [:stages 0 :fields 0]
                [:stages 0 :filters 0 :args 1]
                [:stages 0 :aggregations 1] [:stages 0 :breakouts 0]
                [:stages 0 :order-bys 0]]]
    (testing (str "Unknown fields are not part of the request contract at " path)
      (is (not (mr/validate ::query-definition/query-definition
                            (assoc-in query-definition (conj path :unexpected) true)))))))

(deftest ^:parallel required-query-source-test
  (is (not (mr/validate ::query-definition/query-definition {:stages []})))
  (is (not (mr/validate ::query-definition/query-definition {:stages [{}]}))))

(deftest ^:parallel internal-column-schemas-remain-open-test
  (let [column {:type :column :name "DATE" :unit :month}]
    (is (mr/validate ::test-spec/test-column-spec column))
    (is (not (mr/validate ::query-definition/column column)))
    (is (mr/validate ::query-definition/breakout column))))

(deftest ^:parallel unsupported-query-features-test
  (doseq [query [{:stages (repeat 2 (first (:stages query-definition)))}
                 (assoc-in query-definition [:stages 0 :source] {:type :card :id 1})
                 (assoc-in query-definition [:stages 0 :joins] [])
                 (assoc-in query-definition [:stages 0 :expressions] [])
                 (assoc-in query-definition [:stages 0 :aggregations]
                           [{:name "count" :value {:type :operator :operator :count :args []}}])]]
    (is (not (mr/validate ::query-definition/query-definition query)))))
