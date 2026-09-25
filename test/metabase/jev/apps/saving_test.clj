(ns metabase.jev.apps.saving-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.jev.apps.saving :as saving]
   [metabase.jev.client :as jev]
   [metabase.test :as mt]))

(def ^:private dup-cands  [{:id 10 :name "Revenue per quarter" :type :question :display :line :collection_id nil}
                           {:id 11 :name "Orders by category" :type :question :display :bar :collection_id nil}])
(def ^:private coll-cands [{:id 5 :name "Sales"} {:id 6 :name "Product"}])

(defn- answers [dup coll]
  {:ok true
   :answers {:duplicate  {:type "choice" :choice (first dup) :confidence (second dup)}
             :collection {:type "choice" :choice (first coll) :confidence (second coll)}}})

(deftest interpret-maps-ids-test
  (let [r (saving/interpret (answers ["card_10" 0.92] ["coll_6" 0.8]) dup-cands coll-cands)]
    (is (= {:card_id 10 :name "Revenue per quarter" :type "question" :display "line" :confidence 0.92}
           (select-keys (:duplicate r) [:card_id :name :type :display :confidence])))
    (is (= {:id 6 :name "Product" :confidence 0.8} (:collection r)))))

(deftest interpret-thresholds-test
  (testing "below threshold -> nil"
    (let [r (saving/interpret (answers ["card_10" (- saving/duplicate-threshold 0.01)]
                                       ["coll_5" (- saving/collection-threshold 0.01)])
                              dup-cands coll-cands)]
      (is (nil? (:duplicate r)))
      (is (nil? (:collection r)))))
  (testing "at threshold -> surfaced"
    (let [r (saving/interpret (answers ["card_10" saving/duplicate-threshold]
                                       ["coll_5" saving/collection-threshold])
                              dup-cands coll-cands)]
      (is (= 10 (-> r :duplicate :card_id)))
      (is (= 5 (-> r :collection :id))))))

(deftest interpret-none-and-garbage-test
  (testing "`none` is never surfaced, however confident"
    (is (= {:duplicate nil :collection nil}
           (saving/interpret (answers ["none" 0.99] ["none" 0.99]) dup-cands coll-cands))))
  (testing "ids outside the candidate set, malformed answers and failures are ignored"
    (is (= {:duplicate nil :collection nil}
           (saving/interpret (answers ["card_999" 0.99] ["coll_42" 0.99]) dup-cands coll-cands)))
    (is (= {:duplicate nil :collection nil}
           (saving/interpret (answers ["card_10" "0.9"] ["coll_5" 1.7]) dup-cands coll-cands)))
    (is (= {:duplicate nil :collection nil}
           (saving/interpret {:ok false :error "boom"} dup-cands coll-cands)))))

(deftest check-endpoint-test
  (mt/with-temp [:model/Collection {coll-id :id} {:name "Jev Sales Test"}
                 :model/Card       {card-id :id} {:name          "Jev test: orders count"
                                                  :collection_id coll-id
                                                  :dataset_query (mt/mbql-query orders {:aggregation [[:count]]})}]
    (let [asked (atom nil)]
      (with-redefs [jev/key-present? (constantly true)
                    jev/ask          (fn [state questions _]
                                       (reset! asked {:state state :questions questions})
                                       {:ok      true
                                        :usage   {:input_tokens 1 :output_tokens 1}
                                        :answers {:duplicate  {:type "choice" :choice (str "card_" card-id) :confidence 0.95}
                                                  :collection {:type "choice" :choice (str "coll_" coll-id) :confidence 0.9}}})]
        (let [r (mt/user-http-request :crowberto :post 200 "jev/saving/check"
                                      {:dataset_query (mt/mbql-query orders {:aggregation [[:count]]})
                                       :name          "How many orders"})]
          (testing "both questions go in ONE call, candidates are offered as options with a `none`"
            (is (= #{:duplicate :collection} (set (keys (:questions @asked)))))
            (is (contains? (get-in @asked [:questions :duplicate :criteria]) (keyword (str "card_" card-id))))
            (is (contains? (get-in @asked [:questions :collection :criteria]) :none))
            (is (string? (get-in @asked [:state :new_question :query_summary]))))
          (is (= "ok" (:status r)))
          (is (= card-id (-> r :duplicate :card_id)))
          (is (= "Jev Sales Test" (-> r :duplicate :collection_name)))
          (is (= coll-id (-> r :collection :id))))))))

(deftest check-unavailable-test
  (with-redefs [jev/key-present? (constantly true)
                jev/ask          (fn [& _] {:ok false :status 500 :error "Jev returned HTTP 500"})]
    (let [r (mt/user-http-request :crowberto :post 200 "jev/saving/check"
                                  {:dataset_query (mt/mbql-query orders {:aggregation [[:count]]})})]
      (is (= "unavailable" (:status r)))
      (is (nil? (:duplicate r)))
      (is (nil? (:collection r))))))

(deftest native-query-table-ids-test
  (testing "native drafts get their tables from the SQL parser (no EE needed)"
    (is (= #{(mt/id :orders) (mt/id :products)}
           (#'saving/query-table-ids
            (#'saving/->query (mt/native-query {:query "SELECT * FROM orders o JOIN products p ON o.product_id = p.id"})))))
    (testing "template tags are compiled away first"
      (is (= #{(mt/id :orders)}
             (#'saving/query-table-ids
              (#'saving/->query (mt/native-query {:query         "SELECT * FROM orders [[WHERE id = {{id}}]]"
                                                  :template-tags {"id" {:id (str (random-uuid)) :name "id" :display-name "ID" :type :number}}}))))))
    (testing "unparseable SQL yields no tables rather than an error"
      (is (= #{} (#'saving/query-table-ids (#'saving/->query (mt/native-query {:query "SELEKT nonsense ((("}))))))))
