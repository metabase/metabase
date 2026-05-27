(ns metabase.explorations.query-plan.llm-test
  "Unit tests for the LLM planner's pure pieces: the structured-response
  extractor, the per-item and plan-wide validators, and the variant
  dispatch coverage. The full LLM call path (prompt + repair retry +
  materialization) needs a real DB and a stub; that's covered separately."
  (:require
   [clojure.test :refer :all]
   [metabase.explorations.query-plan.llm :as qp.llm]
   [metabase.explorations.query-plan.variants :as variants]))

;;; ---------------------------------------------------------------------------
;;; Private helpers under test
;;; ---------------------------------------------------------------------------

(def ^:private extract-plan  #'qp.llm/extract-plan)
(def ^:private validate-plan #'qp.llm/validate-plan)

;;; ---------------------------------------------------------------------------
;;; Fixture metric-by-id maps
;;; ---------------------------------------------------------------------------

(defn- text-dim
  "Snapshot of a categorical text dim — no temporal/numeric type derivation."
  [dim-id distinct-count]
  {:dimension_id   dim-id
   :display_name   dim-id
   :effective_type :type/Text
   :semantic_type  :type/Category
   :fingerprint    {:global {:distinct-count distinct-count}}})

(defn- date-dim
  "Snapshot of a date dim."
  [dim-id]
  {:dimension_id   dim-id
   :display_name   dim-id
   :effective_type :type/Date
   :semantic_type  :type/CreationDate})

(defn- datetime-dim
  [dim-id]
  {:dimension_id   dim-id
   :display_name   dim-id
   :effective_type :type/DateTime
   :semantic_type  :type/CreationTimestamp})

(defn- numeric-dim
  [dim-id]
  {:dimension_id   dim-id
   :display_name   dim-id
   :effective_type :type/Float
   :semantic_type  :type/Score})

(defn- metric-with-dims
  "Build the per-metric context lookup the validator consumes. `dim-map` is
  `{dimension_id dim-snapshot}` — each entry counts as applicable (target
  resolved). `temporal?` toggles whether the metric carries a default
  temporal breakout. `segments` is a vector of `{:id :name}` maps."
  ([metric-id dim-map]
   (metric-with-dims metric-id dim-map false []))
  ([metric-id dim-map temporal?]
   (metric-with-dims metric-id dim-map temporal? []))
  ([metric-id dim-map temporal? segments]
   {:metric-id                 metric-id
    :default-temporal-breakout (when temporal? {:column "created_at" :unit "month"})
    :segments                  segments
    :applicability             (into {}
                                     (map (fn [[did d]]
                                            [did {:target [:field 1 nil] :dim d}]))
                                     dim-map)}))

;;; ---------------------------------------------------------------------------
;;; extract-plan
;;; ---------------------------------------------------------------------------

(deftest extract-plan-test
  (testing "Extracts plan with keyword keys"
    (let [resp {:plan [{:metric_id 1 :dimension_id "d1" :variant "default" :rationale "r"}]
                :rationale "ok"}]
      (is (= {:plan [{:metric_id 1 :dimension_id "d1" :variant "default" :params {} :rationale "r"}]
              :rationale "ok"}
             (extract-plan resp)))))
  (testing "Extracts plan with string keys (LLM-shaped tool response)"
    (let [resp {"plan" [{"metric_id" 1 "dimension_id" "d1" "variant" "default" "rationale" "r"
                         "params" {"k" 5}}]
                "rationale" "ok"}]
      (is (= {:plan [{:metric_id 1 :dimension_id "d1" :variant "default"
                      :params {"k" 5} :rationale "r"}]
              :rationale "ok"}
             (extract-plan resp)))))
  (testing "Returns nil on non-map response"
    (is (nil? (extract-plan nil)))
    (is (nil? (extract-plan "string")))))

;;; ---------------------------------------------------------------------------
;;; validate-plan — per-item rules
;;; ---------------------------------------------------------------------------

(defn- errs [metric-by-id plan]
  (validate-plan metric-by-id {:plan plan :rationale "rationale text"}))

(deftest validate-default-item-test
  (let [m {1 (metric-with-dims 1 {"d1" (text-dim "d1" 5)})}]
    (testing "Accepts a well-formed default item"
      (is (= [] (errs m [{:metric_id 1 :dimension_id "d1" :variant "default"
                          :params {} :rationale "r"}]))))
    (testing "Rejects unknown metric_id"
      (let [e (errs m [{:metric_id 99 :dimension_id "d1" :variant "default"
                        :params {} :rationale "r"}])]
        (is (some #(re-find #"metric_id=99 is not in the chosen metrics" %) e))))
    (testing "Rejects unknown dimension_id"
      (let [e (errs m [{:metric_id 1 :dimension_id "unknown" :variant "default"
                        :params {} :rationale "r"}])]
        (is (some #(re-find #"no resolvable target" %) e))))
    (testing "Rejects unknown variant"
      (let [e (errs m [{:metric_id 1 :dimension_id "d1" :variant "magic"
                        :params {} :rationale "r"}])]
        (is (some #(re-find #"not a known variant" %) e))))))

(deftest validate-discrete-dim-variants-test
  (testing "top-n-other rejects on temporal dim"
    (let [m {1 (metric-with-dims 1 {"d-date" (date-dim "d-date")})}
          e (errs m [{:metric_id 1 :dimension_id "d-date" :variant "top-n-other"
                      :params {:k 5} :rationale "r"}])]
      (is (some #(re-find #"requires a non-temporal dim" %) e))))
  (testing "top-n-other accepts a numeric dim (may be semantically categorical)"
    ;; Many integer columns are semantically categorical (status codes,
    ;; enum-like IDs) even when the DB types them as numbers. The validator
    ;; trusts the LLM's judgement; only clearly-temporal dims are rejected.
    (let [m {1 (metric-with-dims 1 {"d-num" (numeric-dim "d-num")})}]
      (is (= [] (errs m [{:metric_id 1 :dimension_id "d-num" :variant "top-n-other"
                          :params {:k 5} :rationale "r"}])))))
  (testing "top-n-other requires integer k"
    (let [m {1 (metric-with-dims 1 {"d1" (text-dim "d1" 100)})}
          e (errs m [{:metric_id 1 :dimension_id "d1" :variant "top-n-other"
                      :params {} :rationale "r"}])]
      (is (some #(re-find #"params.k" %) e))))
  (testing "top-n-other rejects out-of-range k"
    (let [m {1 (metric-with-dims 1 {"d1" (text-dim "d1" 100)})}]
      (is (seq (errs m [{:metric_id 1 :dimension_id "d1" :variant "top-n-other"
                         :params {:k 2} :rationale "r"}])))
      (is (seq (errs m [{:metric_id 1 :dimension_id "d1" :variant "top-n-other"
                         :params {:k 99} :rationale "r"}])))))
  (testing "Valid top-n-other passes"
    (let [m {1 (metric-with-dims 1 {"d1" (text-dim "d1" 100)})}]
      (is (= [] (errs m [{:metric_id 1 :dimension_id "d1" :variant "top-n-other"
                          :params {:k 10} :rationale "r"}]))))))

(deftest validate-temporal-variants-test
  (testing "temporal-pattern-day requires a temporal dim"
    (let [m {1 (metric-with-dims 1 {"d1" (text-dim "d1" 5)})}
          e (errs m [{:metric_id 1 :dimension_id "d1" :variant "temporal-pattern-day"
                      :params {} :rationale "r"}])]
      (is (some #(re-find #"requires a temporal dim" %) e))))
  (testing "temporal-pattern-day accepts a date dim"
    (let [m {1 (metric-with-dims 1 {"d" (date-dim "d")})}]
      (is (= [] (errs m [{:metric_id 1 :dimension_id "d" :variant "temporal-pattern-day"
                          :params {} :rationale "r"}])))))
  (testing "temporal-pattern-hour rejects a date-only dim"
    (let [m {1 (metric-with-dims 1 {"d" (date-dim "d")})}
          e (errs m [{:metric_id 1 :dimension_id "d" :variant "temporal-pattern-hour"
                      :params {} :rationale "r"}])]
      (is (some #(re-find #"DateTime" %) e))))
  (testing "temporal-pattern-hour accepts a datetime dim"
    (let [m {1 (metric-with-dims 1 {"d" (datetime-dim "d")})}]
      (is (= [] (errs m [{:metric_id 1 :dimension_id "d" :variant "temporal-pattern-hour"
                          :params {} :rationale "r"}]))))))

(deftest validate-time-facet-needs-metric-temporal-test
  (testing "time-facet rejects when metric has no default temporal breakout"
    (let [m {1 (metric-with-dims 1 {"d1" (text-dim "d1" 5)} false)}
          e (errs m [{:metric_id 1 :dimension_id "d1" :variant "time-facet"
                      :params {} :rationale "r"}])]
      (is (some #(re-find #"default temporal breakout" %) e))))
  (testing "time-facet accepted when metric has temporal breakout and dim is categorical"
    (let [m {1 (metric-with-dims 1 {"d1" (text-dim "d1" 5)} true)}]
      (is (= [] (errs m [{:metric_id 1 :dimension_id "d1" :variant "time-facet"
                          :params {} :rationale "r"}]))))))

(deftest validate-per-value-time-series-temporal-axis-test
  (testing "Falls back to metric's default temporal breakout when no temporal_dimension_id"
    (let [m {1 (metric-with-dims 1 {"d1" (text-dim "d1" 5)} true)}]
      (is (= [] (errs m [{:metric_id 1 :dimension_id "d1" :variant "per-value-time-series"
                          :params {:k 5} :rationale "r"}])))))
  (testing "Rejects when neither default temporal breakout nor temporal_dimension_id"
    (let [m {1 (metric-with-dims 1 {"d1" (text-dim "d1" 5)} false)}
          e (errs m [{:metric_id 1 :dimension_id "d1" :variant "per-value-time-series"
                      :params {:k 5} :rationale "r"}])]
      (is (some #(re-find #"needs a temporal axis" %) e))))
  (testing "Accepts an LLM-chosen temporal_dimension_id even when metric lacks default temporal"
    (let [m {1 (metric-with-dims 1 {"d1"     (text-dim "d1" 5)
                                    "d-date" (date-dim "d-date")}
                                 false)}]
      (is (= [] (errs m [{:metric_id 1 :dimension_id "d1" :variant "per-value-time-series"
                          :params {:k 5 :temporal_dimension_id "d-date"} :rationale "r"}])))))
  (testing "Rejects temporal_dimension_id that doesn't resolve on the metric"
    (let [m {1 (metric-with-dims 1 {"d1" (text-dim "d1" 5)} true)}
          e (errs m [{:metric_id 1 :dimension_id "d1" :variant "per-value-time-series"
                      :params {:k 5 :temporal_dimension_id "unknown"} :rationale "r"}])]
      (is (some #(re-find #"temporal_dimension_id.*has no resolvable target" %) e))))
  (testing "Rejects temporal_dimension_id that names a non-temporal dim"
    (let [m {1 (metric-with-dims 1 {"d1"     (text-dim "d1" 5)
                                    "d-text" (text-dim "d-text" 5)}
                                 true)}
          e (errs m [{:metric_id 1 :dimension_id "d1" :variant "per-value-time-series"
                      :params {:k 5 :temporal_dimension_id "d-text"} :rationale "r"}])]
      (is (some #(re-find #"is not a temporal dim" %) e)))))

(deftest validate-filtered-subset-test
  (let [m {1 (metric-with-dims 1 {"d1" (text-dim "d1" 5)})}]
    (testing "filtered-subset requires non-empty filter_values"
      (is (seq (errs m [{:metric_id 1 :dimension_id "d1" :variant "filtered-subset"
                         :params {} :rationale "r"}])))
      (is (seq (errs m [{:metric_id 1 :dimension_id "d1" :variant "filtered-subset"
                         :params {:filter_values []} :rationale "r"}]))))
    (testing "Valid filtered-subset passes"
      (is (= [] (errs m [{:metric_id 1 :dimension_id "d1" :variant "filtered-subset"
                          :params {:filter_values ["foo" "bar"]} :rationale "r"}]))))))

(deftest validate-segment-test
  (let [m {1 (metric-with-dims 1 {"d1" (text-dim "d1" 5)} false
                               [{:id 7 :name "Active"}])}]
    (testing "Valid segment passes"
      (is (= [] (errs m [{:metric_id 1 :dimension_id "d1" :variant "default"
                          :params {:segment_id 7} :rationale "r"}]))))
    (testing "Invalid segment rejected"
      (let [e (errs m [{:metric_id 1 :dimension_id "d1" :variant "default"
                        :params {:segment_id 99} :rationale "r"}])]
        (is (some #(re-find #"not in metric M1's available segments" %) e))))))

(deftest validate-plan-wide-test
  (let [m {1 (metric-with-dims 1 {"d1" (text-dim "d1" 5)})}]
    (testing "Empty plan fails the minimum"
      (let [e (validate-plan m {:plan [] :rationale "r"})]
        (is (some #(re-find #"need at least" %) e))))
    (testing "Blank rationale fails"
      (let [e (validate-plan m
                             {:plan [{:metric_id 1 :dimension_id "d1" :variant "default"
                                      :params {} :rationale "r"}]
                              :rationale ""})]
        (is (some #(re-find #"`rationale` must be a non-empty string" %) e))))
    (testing "Duplicate items rejected"
      (let [item {:metric_id 1 :dimension_id "d1" :variant "default"
                  :params {} :rationale "r"}
            e    (errs m [item item])]
        (is (some #(re-find #"duplicate items" %) e))))
    (testing "Non-map response rejected"
      (let [e (validate-plan m nil)]
        (is (= ["plan response must be an object with `plan` and `rationale`"] e))))
    (testing "Errors accumulate (don't short-circuit)"
      (let [e (errs m [{:metric_id 99   :dimension_id "d1" :variant "default" :params {} :rationale "r"}
                       {:metric_id 1    :dimension_id "unknown" :variant "default" :params {} :rationale "r"}
                       {:metric_id 1    :dimension_id "d1" :variant "magic"   :params {} :rationale "r"}])]
        (is (>= (count e) 3))))))

;;; ---------------------------------------------------------------------------
;;; Variant dispatch table
;;; ---------------------------------------------------------------------------

(deftest known-variants-cover-validator-rules-test
  (testing "Every variant the validator names is in the dispatch table"
    (let [validator-vars #{"default" "temporal-pattern-day" "temporal-pattern-hour"
                           "time-facet" "top-n-other" "per-value-time-series"
                           "filtered-subset"}]
      (is (= validator-vars variants/known-variants)))))
