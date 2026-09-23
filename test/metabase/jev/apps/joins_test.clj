(ns metabase.jev.apps.joins-test
  (:require [clojure.test :refer [deftest is]]
            [metabase.api.common :as api]
            [metabase.jev.client :as jev]
            [metabase.jev.apps.joins :as joins]
            [metabase.models.interface :as mi]
            [toucan2.core :as t2]))

(deftest candidate-pairs-test
  (let [source [{:id 1 :name "id" :base_type :type/Integer}
                {:id 2 :name "amount" :base_type :type/Float}
                {:id 3 :name "customer_id" :base_type :type/Text}]
        target [{:id 4 :name "_sdc_source_key_id" :base_type :type/Integer}
                {:id 5 :name "id" :base_type :type/Text}
                {:id 6 :name "amount" :base_type :type/Float}]
        pairs (joins/candidate-pairs source target)]
    (is (= #{[1 4] [3 5]} (set (map #(vector (get-in % [:source :id]) (get-in % [:target :id])) pairs))))))

(deftest foreign-key-pairs-prioritized-test
  (let [source [{:id 1 :name "customer" :base_type :type/Integer :fk_target_field_id 4}
                {:id 2 :name "id" :base_type :type/Integer}]
        target [{:id 4 :name "key" :base_type :type/Integer}]
        pair (first (joins/candidate-pairs source target))]
    (is (= 1 (get-in pair [:source :id])))
    (is (= 4 (get-in pair [:target :id])))))

(deftest candidates-respect-permissions-and-reject-invented-edges-test
  (let [captured (atom nil)]
    (with-redefs [api/read-check (fn [& _] {:id 1 :db_id 1 :name "orders"})
                  mi/can-read? #(not= 3 (:id %))
                  t2/select (fn [model & _]
                              (case model
                                :model/Table [{:id 2 :db_id 1 :name "customers"} {:id 3 :db_id 1 :name "secret"}]
                                :model/Field [{:id 10 :table_id 1 :name "customer_id" :base_type :type/Integer}
                                              {:id 20 :table_id 2 :name "id" :base_type :type/Integer}]))
                  jev/key-present? (constantly true)
                  jev/ask (fn [state questions _]
                            (reset! captured {:state state :questions questions})
                            {:ok true :answers {:table_2 {:type "choice" :choice "edge_999" :confidence 1}}})]
      (is (empty? (:suggestions (joins/suggestions [1]))))
      (is (= [2] (mapv :id (get-in @captured [:state :candidate_tables]))))
      (is (= #{:table_2 :rank_2} (set (keys (:questions @captured))))))))

(deftest declared-fk-survives-shortlist-and-jev-outage-test
  (with-redefs [api/read-check (fn [& _] {:id 1 :db_id 1 :name "orders"})
                mi/can-read? (constantly true)
                t2/select (fn [model & _]
                            (case model
                              :model/Table (conj (mapv #(hash-map :id % :db_id 1 :name "orders_related") (range 2 16))
                                                 {:id 99 :db_id 1 :name "customers" :display_name "Customers"})
                              :model/Field [{:id 10 :table_id 1 :name "customer_id" :base_type :type/Integer :fk_target_field_id 20}
                                            {:id 20 :table_id 99 :name "id" :base_type :type/Integer}]))
                jev/key-present? (constantly false)
                jev/ask (fn [& _] (throw (ex-info "Must not classify a declared FK" {})))]
    (let [result (joins/suggestions [1])]
      (is (= 12 (:tables_considered result)))
      (is (= [[99 10 20 true]]
             (mapv (juxt :table_id :source_field_id :target_field_id :existing_fk) (:suggestions result)))))))

(deftest relevance-ranks-within-relationship-groups-test
  (with-redefs [api/read-check (fn [& _] {:id 1 :db_id 1 :name "orders"})
                mi/can-read? (constantly true)
                t2/select (fn [model & _]
                            (case model
                              :model/Table [{:id 2 :db_id 1 :name "customers" :display_name "Customers"}
                                            {:id 3 :db_id 1 :name "products" :display_name "Products"}
                                            {:id 4 :db_id 1 :name "events" :display_name "Events"}]
                              :model/Field [{:id 10 :table_id 1 :name "id" :base_type :type/Integer}
                                            {:id 11 :table_id 1 :name "customer_id" :base_type :type/Integer :fk_target_field_id 20}
                                            {:id 12 :table_id 1 :name "product_id" :base_type :type/Integer :fk_target_field_id 30}
                                            {:id 20 :table_id 2 :name "id" :base_type :type/Integer}
                                            {:id 30 :table_id 3 :name "id" :base_type :type/Integer}
                                            {:id 40 :table_id 4 :name "order_id" :base_type :type/Integer}]))
                jev/key-present? (constantly true)
                jev/ask (fn [state questions _]
                          (is (= "Group by product" (:query_context state)))
                          (is (= "score" (get-in questions [:rank_3 :type])))
                          (is (not (contains? questions :table_2)))
                          {:ok true :answers {:rank_2 {:type "score" :score 0.5}
                                              :rank_3 {:type "score" :score 1.8}
                                              :rank_4 {:type "score" :score 2}
                                              :table_4 {:type "choice" :choice "edge_0" :confidence 0.95}}})]
    (is (= [3 2 4] (mapv :table_id (:suggestions (joins/suggestions [1] "Group by product")))))))
