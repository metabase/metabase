(ns metabase.query-processor.middleware.update-used-cards-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.dashboard-subscription-test :as dashboard-subscription-test]
   [metabase.pulse :as pulse]
   [metabase.pulse-test :as pulse-test]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.update-used-cards :as qp.update-used-cards]
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
  (assert (fn? thunk))
  (let [original-last-used-at (card-last-used-at card-id)]
   (mt/with-temporary-setting-values [synchronous-batch-updates true]
     (thunk))
   (testing "last_used_at should be updated after executing the query"
     (is (not= original-last-used-at (card-last-used-at card-id))))))

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

(deftest update-used-card-timestamp-test
  (let [now           (t/offset-date-time)
        one-hour-ago  (t/minus now (t/hours 1))
        two-hours-ago (t/minus now (t/hours 2))]
    (testing "update with multiple cards of the same ids will set timestamp to the latest"
      (mt/with-temp
        [:model/Card {card-id-1 :id} {:last_used_at two-hours-ago}]
        (#'qp.update-used-cards/update-used-cards!* [{:id card-id-1 :timestamp two-hours-ago}
                                                     {:id card-id-1 :timestamp one-hour-ago}])
        (is (= one-hour-ago (t2/select-one-fn :last_used_at :model/Card card-id-1)))))

    (testing "if the existing last_used_at is greater than the updating values, do not override it"
      (mt/with-temp
        [:model/Card {card-id-2 :id} {:last_used_at now}]
        (#'qp.update-used-cards/update-used-cards!* [{:id card-id-2 :timestamp one-hour-ago}])
        (is (= now (t2/select-one-fn :last_used_at :model/Card card-id-2)))))))
