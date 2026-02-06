(ns metabase.transforms.inspector.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.transforms.inspector.core :as inspector.core]))

;;; -------------------------------------------------- compute-card-result --------------------------------------------------

(deftest compute-card-result-test
  (testing "join-analysis join_step computes null rate"
    (is (= {"output_count" 100 "matched_count" 80 "null_count" 20 "null_rate" 1/5}
           (inspector.core/compute-card-result
            :join-analysis
            {:metadata {:card_type "join_step"}}
            [100 80]))))
  (testing "nil row returns no_data with zero counts"
    (is (= {"no_data" true "output_count" 0 "matched_count" 0 "null_count" 0 "null_rate" nil}
           (inspector.core/compute-card-result
            :join-analysis
            {:metadata {:card_type "join_step"}}
            nil)))))

;;; -------------------------------------------------- triggered-alerts --------------------------------------------------

(deftest triggered-alerts-test
  (let [triggers [{:id "alert-1"
                   :condition {:name :high-null-rate :card_id "step-1"}
                   :severity :warning
                   :message "High null rate"}
                  {:id "alert-2"
                   :condition {:name :high-null-rate :card_id "step-2"}
                   :severity :warning
                   :message "High null rate"}]]
    (testing "returns alerts whose conditions are met"
      (let [card-results {"step-1" {"null_rate" 0.3}
                          "step-2" {"null_rate" 0.1}}
            result (inspector.core/triggered-alerts card-results triggers)]
        (is (= 1 (count result)))
        (is (= "alert-1" (:id (first result))))))
    (testing "returns all matching alerts"
      (let [card-results {"step-1" {"null_rate" 0.3}
                          "step-2" {"null_rate" 0.5}}
            result (inspector.core/triggered-alerts card-results triggers)]
        (is (= 2 (count result)))))
    (testing "returns empty when no conditions met"
      (let [card-results {"step-1" {"null_rate" 0.0}
                          "step-2" {"null_rate" 0.0}}]
        (is (= [] (inspector.core/triggered-alerts card-results triggers)))))))

;;; -------------------------------------------------- triggered-drill-lenses --------------------------------------------------

(deftest triggered-drill-lenses-test
  (let [triggers [{:lens_id "unmatched-rows"
                   :condition {:name :has-unmatched-rows :card_id "step-1"}
                   :params {:join_step 1}
                   :reason "Unmatched rows"}
                  {:lens_id "unmatched-rows"
                   :condition {:name :has-unmatched-rows :card_id "step-2"}
                   :params {:join_step 2}
                   :reason "Unmatched rows"}]]
    (testing "returns drill lenses whose conditions are met"
      (let [card-results {"step-1" {"null_rate" 0.1}
                          "step-2" {"null_rate" 0.01}}
            result (inspector.core/triggered-drill-lenses card-results triggers)]
        (is (= 1 (count result)))
        (is (= {:join_step 1} (:params (first result))))))))

;;; -------------------------------------------------- evaluate-triggers --------------------------------------------------

(deftest evaluate-triggers-test
  (let [lens {:alert_triggers       [{:id "alert-1"
                                      :condition {:name :high-null-rate :card_id "step-1"}
                                      :severity :warning
                                      :message "High null rate"}]
              :drill_lens_triggers  [{:lens_id "unmatched-rows"
                                      :condition {:name :has-unmatched-rows :card_id "step-1"}
                                      :params {:join_step 1}
                                      :reason "Unmatched rows"}]}
        card-results {"step-1" {"null_rate" 0.3}}]
    (testing "evaluates both alert and drill lens triggers"
      (let [result (inspector.core/evaluate-triggers lens card-results)]
        (is (= 1 (count (:alerts result))))
        (is (= 1 (count (:drill_lenses result))))))))

(deftest evaluate-triggers-no-triggers-test
  (let [lens {:alert_triggers [] :drill_lens_triggers []}
        card-results {"step-1" {"null_rate" 0.3}}]
    (testing "returns empty collections when no triggers defined"
      (let [result (inspector.core/evaluate-triggers lens card-results)]
        (is (= [] (:alerts result)))
        (is (= [] (:drill_lenses result)))))))

;;; -------------------------------------------------- interesting-fields --------------------------------------------------

(deftest interesting-fields-test
  (testing "filters out dominated fields and keeps interesting ones"
    (let [fields [{:name "id" :semantic_type :type/PK :base_type :type/Integer}
                  {:name "created" :base_type :type/DateTime}]
          result (inspector.core/interesting-fields fields {})]
      (is (= 1 (count result)))
      (is (= "created" (:name (first result)))))))

;;; -------------------------------------------------- degenerate? --------------------------------------------------

(deftest degenerate-test
  (testing "no_data is degenerate"
    (is (= {:degenerate? true :reason :no-data}
           (inspector.core/degenerate? "c1" :bar {"c1" {"no_data" true}}))))
  (testing ":hidden display is always degenerate"
    (is (= {:degenerate? true}
           (inspector.core/degenerate? "c1" :hidden {"c1" {"row_count" 100}}))))
  (testing "normal data is not degenerate"
    (is (= {:degenerate? false}
           (inspector.core/degenerate? "c1" :bar {"c1" {"row_count" 10}})))))
