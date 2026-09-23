(ns metabase.jev.apps.search-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.jev.apps.search :as search]
   [metabase.jev.client :as jev]
   [metabase.test :as mt]))

(def ^:private candidates
  [{:model "metric" :id 9 :name "Revenue" :description "Canonical revenue metric" :collection_name "Examples"}
   {:model "card" :id 13 :name "Revenue by product category"}
   {:model "card" :id 15 :name "Revenue per quarter" :description "Revenue last quarter vs previous"}
   {:model "dashboard" :id 1 :name "E-commerce Insights" :description nil}])

(defn- stub-ask [answers]
  (fn [state questions _opts]
    (is (= "how much money did we make last quarter" (:search_request state)))
    ;; one score per candidate + the single best-choice question, all in ONE call
    (is (= #{:best :item_0 :item_1 :item_2 :item_3} (set (keys questions))))
    (is (= "score" (:type (:item_0 questions))))
    (is (contains? (:criteria (:best questions)) :none))
    {:ok true :usage {:input_tokens 100 :output_tokens 10} :answers answers}))

(defn- ids [result] (mapv (juxt :model :id) (:ranked result)))

(deftest ordering-and-best-test
  (mt/with-dynamic-fn-redefs [jev/key-present? (constantly true)
                              jev/ask (stub-ask {:item_0 {:type "score" :score 2.0}
                                                 :item_1 {:type "score" :score 1.0}
                                                 :item_2 {:type "score" :score 2.9}
                                                 :item_3 {:type "score" :score 2.0}
                                                 :best   {:type "choice" :choice "item_2" :confidence 0.9}})]
    (let [result (search/rerank "how much money did we make last quarter" candidates)]
      (is (= "ok" (:status result)))
      (testing "sorted by score desc, ties keep original keyword order (metric/9 before dashboard/1)"
        (is (= [["card" 15] ["metric" 9] ["dashboard" 1] ["card" 13]] (ids result))))
      (is (= {:model "card" :id 15 :confidence 0.9} (:best result)))
      (is (= {:input_tokens 100 :output_tokens 10} (:usage result))))))

(deftest best-is-pinned-first-test
  (testing "a confident, score-backed best is pinned first even if another item scored slightly higher"
    (mt/with-dynamic-fn-redefs [jev/key-present? (constantly true)
                                jev/ask (stub-ask {:item_0 {:type "score" :score 2.9}
                                                   :item_1 {:type "score" :score 0.5}
                                                   :item_2 {:type "score" :score 2.8}
                                                   :item_3 {:type "score" :score 0.1}
                                                   :best   {:type "choice" :choice "item_2" :confidence 0.8}})]
      (is (= [["card" 15] ["metric" 9] ["card" 13] ["dashboard" 1]]
             (ids (search/rerank "how much money did we make last quarter" candidates)))))))

(deftest threshold-test
  (let [scores {:item_0 {:type "score" :score 2.0}
                :item_1 {:type "score" :score 1.0}
                :item_2 {:type "score" :score 1.2}
                :item_3 {:type "score" :score 0.0}}
        run    (fn [answers]
                 (mt/with-dynamic-fn-redefs [jev/key-present? (constantly true)
                                             jev/ask (stub-ask (merge scores answers))]
                   (search/rerank "how much money did we make last quarter" candidates)))]
    (testing "confidence below the threshold -> no best"
      (is (nil? (:best (run {:best {:type "choice" :choice "item_0" :confidence 0.4}})))))
    (testing "confident choice the score rubric doesn't back -> no best"
      (is (nil? (:best (run {:best {:type "choice" :choice "item_2" :confidence 0.95}})))))
    (testing "`none` -> no best, but the scores still reorder"
      (let [result (run {:best {:type "choice" :choice "none" :confidence 0.99}})]
        (is (nil? (:best result)))
        (is (= ["metric" 9] (first (ids result))))))
    (testing "at the threshold with a backing score -> best"
      (is (= 9 (:id (:best (run {:best {:type "choice" :choice "item_0"
                                        :confidence search/best-confidence-threshold}}))))))))

(deftest unknown-ids-and-malformed-answers-test
  (mt/with-dynamic-fn-redefs [jev/key-present? (constantly true)
                              jev/ask (fn [& _]
                                        {:ok true
                                         :answers {:item_0  {:type "score" :score 99}      ; out of range
                                                   :item_1  {:type "score" :score "3"}     ; not a number
                                                   :item_2  {:type "score" :score 1.5}
                                                   :item_3  {:type "choice" :score 3}      ; wrong type
                                                   :item_77 {:type "score" :score 3}       ; invented key
                                                   :best    {:type "choice" :choice "item_77" :confidence 1.0}}})]
    (let [result (search/rerank "how much money did we make last quarter"
                                (conj candidates (first candidates)))] ; duplicate is dropped
      (testing "only ids from the request come back, each once"
        (is (= (set (map (juxt :model :id) candidates)) (set (ids result))))
        (is (= 4 (count (:ranked result)))))
      (testing "an invented choice key never becomes best"
        (is (nil? (:best result))))
      (testing "only the valid score counts; unscored items keep keyword order below it"
        (is (= [["card" 15] ["metric" 9] ["card" 13] ["dashboard" 1]] (ids result)))
        (is (= [1.5 nil nil nil] (mapv :score (:ranked result))))))))

(deftest failure-is-data-test
  (testing "Jev error -> original order, unavailable"
    (mt/with-dynamic-fn-redefs [jev/key-present? (constantly true)
                                jev/ask (fn [& _] {:ok false :error "boom"})]
      (let [result (search/rerank "how much money did we make last quarter" candidates)]
        (is (= "unavailable" (:status result)))
        (is (= (mapv (juxt :model :id) candidates) (ids result)))
        (is (nil? (:best result))))))
  (testing "no key -> never calls Jev"
    (mt/with-dynamic-fn-redefs [jev/key-present? (constantly false)
                                jev/ask (fn [& _] (throw (ex-info "must not call" {})))]
      (is (= "unavailable" (:status (search/rerank "revenue last quarter" candidates))))))
  (testing "too few candidates -> never calls Jev"
    (mt/with-dynamic-fn-redefs [jev/key-present? (constantly true)
                                jev/ask (fn [& _] (throw (ex-info "must not call" {})))]
      (is (= "too-few" (:status (search/rerank "revenue last quarter" (take 1 candidates))))))))
