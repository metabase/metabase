(ns metabase.jev.apps.create-test
  (:require
   [clojure.test :refer :all]
   [metabase.jev.apps.create :as create]
   [metabase.jev.apps.filters :as filters]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest rank-tables-test
  (let [tables [{:id 1 :display_name "Accounts"}
                {:id 2 :display_name "Orders"}
                {:id 3 :display_name "People"}]]
    (testing "tables named in the text, or with matching columns, come first; the rest keep id order"
      (is (= [2 3 1] (map :id (create/rank-tables "orders by state" tables {3 ["State" "Source"]}))))
      (is (= [1 2 3] (map :id (create/rank-tables "tell me a joke" tables {})))))))

(deftest interpret-intent-test
  (let [candidates [{:table {:id 10 :db_id 1 :name "ORDERS" :display_name "Orders" :schema "PUBLIC"}}
                    {:table {:id 11 :db_id 1 :name "PEOPLE" :display_name "People" :schema "PUBLIC"}}]
        answers    {:kind  {:type "choice" :choice "dashboard" :probabilities {:question 0.1 :dashboard 0.9}}
                    :table {:type "choice" :choice "t1" :probabilities {:t0 0.3 :t1 0.6 :none 0.1}}
                    :r0    {:type "noul" :noul 0.8}
                    :r1    {:type "noul" :noul 0.4}}
        result     (create/interpret-intent candidates answers)]
    (is (= {:choice "dashboard" :probabilities {"question" 0.1 "dashboard" 0.9}} (:kind result)))
    (is (= [[11 0.6 0.4] [10 0.3 0.8]] (map (juxt :id :probability :relevance) (:tables result)))
        "tables sorted by the single-table probability, each with its own dashboard relevance")
    (testing "a malformed answer leaves the kind unknown and probabilities at zero"
      (is (= [nil [0.0 0.0]]
             ((juxt :kind #(mapv :probability (:tables %)))
              (create/interpret-intent candidates {:kind {:type "noul" :noul 0.5}})))))))

(deftest ranked-test
  (let [options [{:value {:unit "default"} :label "Default"}
                 {:value {:unit "month"} :label "Month"}
                 {:value {:unit "week"} :label "Week"}]]
    (testing "options ranked by probability, carrying their value, label and probability"
      (is (= [{:unit "month" :label "Month" :probability 0.7}
              {:unit "week" :label "Week" :probability 0.2}
              {:unit "default" :label "Default" :probability 0.1}]
             (:options (create/ranked options {:type "choice" :probabilities {:o0 0.1 :o1 0.7 :o2 0.2}})))))
    (testing "without a usable answer, the first option is still offered"
      (is (= [{:unit "default" :label "Default" :probability 0.0}]
             (:options (create/ranked options nil)))))))

(deftest aggregation-and-breakout-options-test
  (let [columns [{:key "0" :display_name "Total" :kind "number"}
                 {:key "1" :display_name "Created At" :kind "date"}
                 {:key "2" :display_name "Category" :kind "values"}]]
    (is (= [["rows" nil] ["count" nil] ["sum" "0"] ["avg" "0"] ["max" "0"] ["min" "0"] ["distinct" "2"]]
           (map (comp (juxt :operator :column_key) :value) (create/aggregation-options columns))))
    (is (= [nil "1" "2"] (map (comp :column_key :value) (create/breakout-options columns)))
        "no grouping, then dates and categories — not raw numbers")))

(deftest select-cards-test
  (let [cards  (for [[id p] [[1 0.4] [2 0.9] [3 0.6] [4 0.55] [5 0.7] [6 0.8] [7 0.65] [8 0.75] [9 0.85] [10 0.95]]]
                 {:card_id id :probability p})
        result (create/select-cards cards)]
    (is (= [10 2 9 6 8 5 7 3 4 1] (map :card_id result)) "most relevant first")
    (is (= [10 2 9 6 8 5 7 3] (map :card_id (filter :selected result)))
        "at most 8 selected, all at or above the threshold"))
  (testing "the top 3 are selected down to the floor, so a borderline best pick isn't left out"
    (is (= [1 2 3] (map :card_id (filter :selected (create/select-cards
                                                    (for [[id p] [[1 0.49] [2 0.46] [3 0.35] [4 0.28] [5 0.2]]]
                                                      {:card_id id :probability p})))))))
  (testing "nothing is selected when nothing clears the floor"
    (is (empty? (filter :selected (create/select-cards [{:card_id 1 :probability 0.18}]))))))

(deftest tidy-name-test
  (is (= "A sales overview" (create/tidy-name "  a   sales overview ")))
  (is (= "New dashboard" (create/tidy-name "   ")))
  (is (= "New document" (create/tidy-name "" "New document")))
  (is (= 100 (count (create/tidy-name (apply str (repeat 150 "x")))))))

(deftest demote-duplicate-numbers-test
  (testing "the same number on several columns keeps only the likeliest one above the auto-apply bar"
    (is (= [["Subtotal" 0.5] ["Total" 0.9] ["Quantity" 0.3] ["Rating" 0.8]]
           (map (juxt :parameter_name :confidence)
                (filters/demote-duplicate-numbers
                 [{:parameter_name "Subtotal" :parameter_type "number/>=" :value [100] :confidence 0.88}
                  {:parameter_name "Total" :parameter_type "number/>=" :value [100] :confidence 0.9}
                  {:parameter_name "Quantity" :parameter_type "number/>=" :value [100] :confidence 0.3}
                  {:parameter_name "Rating" :parameter_type "number/>=" :value [4] :confidence 0.8}]))))))

(deftest plan-dashboard-only-offers-addable-cards-test
  (testing "cards in a document, or archived, are never offered — dashboards reject document cards"
    (mt/with-temp [:model/Collection {coll-id :id}     {}
                   :model/Document   {doc-id :id}      {:collection_id coll-id
                                                        :creator_id    (mt/user->id :crowberto)}
                   :model/Card       {plain-id :id}    {:collection_id coll-id :table_id (mt/id :orders)
                                                        :last_used_at  (java.time.OffsetDateTime/now)}
                   :model/Card       {in-doc-id :id}   {:collection_id coll-id :table_id (mt/id :orders)
                                                        :document_id   doc-id
                                                        :last_used_at  (java.time.OffsetDateTime/now)}
                   :model/Card       {archived-id :id} {:collection_id coll-id :table_id (mt/id :orders)
                                                        :archived      true
                                                        :last_used_at  (java.time.OffsetDateTime/now)}]
      (mt/with-current-user (mt/user->id :crowberto)
        (let [ask-fn  (fn [_state questions]
                        {:ok true :answers (update-vals questions (constantly {:type "noul" :noul 0.9}))})
              offered (set (map :card_id (:cards (create/plan-dashboard "orders overview" [(mt/id :orders)]
                                                                        {:ask-fn ask-fn}))))]
          (is (contains? offered plain-id))
          (is (not (contains? offered in-doc-id)))
          (is (not (contains? offered archived-id))))))))
