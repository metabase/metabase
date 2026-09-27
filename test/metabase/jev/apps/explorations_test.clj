(ns metabase.jev.apps.explorations-test
  (:require [clojure.test :refer [deftest is]]
            [metabase.jev.client :as jev]
            [metabase.jev.apps.explorations :as explorations]))

(def candidates
  [{:id "a" :title "Weekly trend" :description "" :kind "indepth"}
   {:id "b" :title "Monthly trend" :description "" :kind "indepth"}
   {:id "c" :title "Yearly trend" :description "" :kind "indepth"}
   {:id "d" :title "Compare with all orders" :description "" :kind "compare"}])

(deftest bounded-diverse-selection-test
  (with-redefs [jev/key-present? (constantly true)
                jev/ask (fn [state questions _]
                          (is (= "Cancelled orders" (:current_context state)))
                          (is (= 4 (count questions)))
                          {:ok true :usage {:input_tokens 100 :output_tokens 20}
                           :answers {:action_0 {:type "score" :score 3}
                                     :action_1 {:type "score" :score 2.8}
                                     :action_2 {:type "score" :score 2.7}
                                     :action_3 {:type "score" :score 2.6}
                                     :invented {:type "score" :score 3}}})]
    (let [result (explorations/rank-actions "Cancelled orders" candidates)]
      (is (= ["a" "b" "d"] (:selected result)))
      (is (= {:input_tokens 100 :output_tokens 20} (:usage result))))))

(deftest malformed-and-low-scores-test
  (with-redefs [jev/key-present? (constantly true)
                jev/ask (fn [& _]
                          {:ok true :answers {:action_0 {:type "score" :score 99}
                                              :action_1 {:type "score" :score "3"}
                                              :action_2 {:type "choice" :score 3}
                                              :action_3 {:type "score" :score 0.7}}})]
    (let [result (explorations/rank-actions "Orders" candidates)]
      (is (= "no-preference" (:status result)))
      (is (empty? (:selected result)))
      (is (= [nil nil nil 0.7] (mapv :score (:ranked result)))))))

(deftest unavailable-test
  (with-redefs [jev/key-present? (constantly false)
                jev/ask (fn [& _] (throw (ex-info "Must not call" {})))]
    (is (= "unavailable" (:status (explorations/rank-actions "Orders" candidates))))))
