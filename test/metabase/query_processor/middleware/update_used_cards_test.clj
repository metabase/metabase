(ns metabase.query-processor.middleware.update-used-cards-test
  (:require
   [clojure.test :refer :all]
   [metabase.dashboard-subscription-test :as dashboard-subscription-test]
   [metabase.pulse :as pulse]
   [metabase.pulse-test :as pulse-test]
   [metabase.query-processor :as qp]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.query-processor.util :as qp.util]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defmacro with-used-cards-setup!
  [& body]
  `(mt/test-helpers-set-global-values!
     (binding [qp.pipeline/*execute*    (fn [_driver# _query# respond#] (respond# {} []))
               qp.util/*execute-async?* false]
       ~@body)))

(defn- card-last-used-at
  [card-id]
  (t2/select-one-fn :last_used_at :model/Card card-id))

(defn do-test!
  "Check if `last_used_at` of `card-id` is nil, then execute `f`, then check that `last_used_at` is non nil."
  [card-id thunk]
  (mt/with-grouper-realize! [realize]
    (assert (fn? thunk))
    (testing "last_used_at should be nil to start with"
      (is (nil? (card-last-used-at card-id))))
    (thunk)
    (realize)
    (testing "last_used_at should be updated to non nil"
      (is (some? (card-last-used-at card-id))))))

(deftest nested-cards-test
  (with-used-cards-setup!
    (mt/with-temp [:model/Card {card-id :id} {:dataset_query (mt/mbql-query venues)}]
      (do-test! card-id #(qp/process-query (mt/mbql-query nil {:source-table (format "card__%d" card-id)}))))))

(deftest joined-card-test
  (with-used-cards-setup!
    (mt/with-temp [:model/Card {card-id :id} {:dataset_query (mt/mbql-query products)}]
      (do-test! card-id #(qp/process-query (mt/mbql-query orders  {:joins [{:fields       "all",
                                                                            :source-table (format "card__%d" card-id)
                                                                            :condition    [:= $orders.product_id &product.products.id]
                                                                            :alias        "product"}]}))))))

(deftest card-reference-in-native-query-test
  (with-used-cards-setup!
    (mt/with-temp [:model/Card {card-id :id} {:dataset_query (mt/mbql-query venues)}]
      (do-test! card-id #(qp/process-query (mt/native-query {:query         "SELECT * FROM {{#card}}"
                                                             :template-tags {"#card" {:card-id      card-id
                                                                                      :display-name "card"
                                                                                      :id           "card"
                                                                                      :name         "card"
                                                                                      :type         "card"}}}))))))

(deftest alert-test
  (with-used-cards-setup!
    (mt/with-temp [:model/Card {card-id :id} {:dataset_query (mt/mbql-query venues)}]
      (pulse-test/with-pulse-for-card [pulse {:card card-id}]
        (do-test! card-id #(pulse/send-pulse! pulse))))))

(deftest dashboard-subscription-test
  (with-used-cards-setup!
    (mt/with-temp [:model/Dashboard dash          {}
                   :model/Card      {card-id :id} {:dataset_query (mt/mbql-query venues)}]
      (dashboard-subscription-test/with-dashboard-sub-for-card [pulse {:card      card-id
                                                                       :dashboard dash}]
        (do-test! card-id #(pulse/send-pulse! pulse))))))
