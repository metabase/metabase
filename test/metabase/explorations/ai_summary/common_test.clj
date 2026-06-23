(ns metabase.explorations.ai-summary.common-test
  "Unit tests for the pure helpers in [[metabase.explorations.ai-summary.common]].

  Tests stay pure: no DB, no LLM. The one LLM-touching function under test —
  `run-with-repair` — exercises its control flow against a stubbed `call-llm`
  via `with-redefs`."
  (:require
   [clojure.test :refer :all]
   [metabase.explorations.ai-summary.common :as common]))

;;; ---------------------------------------------- chart-rank-key ----------------------------------------------

(defn- q
  "Build a fake hydrated ExplorationQuery for ranking/selection tests. Ids are
  numeric, as they always are in production."
  [id card-id dim-id ctx det]
  {:id id :card_id card-id :dimension_id dim-id
   :contextual_interestingness_score ctx :interestingness_score det})

(defn- rank-order
  "Ids of `queries` sorted best-first by `chart-rank-key`."
  [queries]
  (mapv :id (sort-by common/chart-rank-key #(compare %2 %1) queries)))

(deftest chart-rank-key-deterministic-secondary-test
  (testing "Equal contextual score → higher deterministic score ranks first"
    ;; id 1 = low det, id 2 = high det
    (is (= [2 1]
           (rank-order [(q 1 10 11 0.5 0.2)
                        (q 2 20 21 0.5 0.9)])))))

(deftest chart-rank-key-contextual-is-primary-test
  (testing "Contextual score dominates: a high-det/low-ctx chart ranks below a high-ctx/low-det chart"
    ;; id 1 = interesting-but-irrelevant, id 2 = relevant
    (is (= [2 1]
           (rank-order [(q 1 10 11 0.2 0.99)
                        (q 2 20 21 0.7 0.10)])))))

(deftest chart-rank-key-stable-tiebreak-test
  (testing "Identical ctx and det resolve deterministically (lower id first)"
    (is (= [10 20]
           (rank-order [(q 20 1 1 0.5 0.5)
                        (q 10 2 2 0.5 0.5)])))))

;;; ---------------------------------------------- select-pool ----------------------------------------------

(deftest select-pool-balances-across-metrics-test
  (testing "A metric with many strong breakouts cannot crowd out other metrics' top breakouts"
    ;; metric A (card 1): five strong breakouts; metric B (card 2) and C (card 3): one each
    (let [metric-a [(q 101 1 11 0.7 0.9) (q 102 1 12 0.7 0.8) (q 103 1 13 0.7 0.7)
                    (q 104 1 14 0.7 0.6) (q 105 1 15 0.7 0.5)]
          metric-b [(q 201 2 21 0.7 0.4)]
          metric-c [(q 301 3 31 0.5 0.9)]
          pool     (set (map :id (common/select-pool 4 (concat metric-a metric-b metric-c))))]
      (is (contains? pool 201) "metric B's only chart survives")
      (is (contains? pool 301) "metric C's only chart survives, despite lower contextual score")
      (is (<= (count (filter #{101 102 103 104 105} pool)) 2)
          "the dominant metric is capped, not allowed to fill the pool")
      ;; pure global ranking would have selected 101..104 and dropped 201 and 301
      (is (not= #{101 102 103 104} pool)))))

(deftest select-pool-balances-dimensions-within-metric-test
  (testing "Within one metric, a single dimension's fan-out doesn't bury another dimension's best breakout"
    (let [dim1 [(q 1101 1 100 0.7 0.9) (q 1102 1 100 0.7 0.7)]
          dim2 [(q 1200 1 200 0.7 0.8)]
          pool (set (map :id (common/select-pool 2 (concat dim1 dim2))))]
      (is (= #{1101 1200} pool)
          "second slot goes to the other dimension (det 0.8), not dim1's weaker breakout (det 0.7)"))))

(deftest select-pool-weights-by-metric-relevance-test
  (testing "Big relevance gap → strong metric earns several breakouts, pointless metric squeezed out"
    (let [helpful   [(q 1 1 11 0.9 0.9) (q 2 1 12 0.9 0.8) (q 3 1 13 0.9 0.7)]
          pointless [(q 4 2 21 0.15 0.9) (q 5 2 22 0.15 0.8) (q 6 2 23 0.15 0.7)]
          pool      (set (map :id (common/select-pool 3 (concat helpful pointless))))]
      (is (= #{1 2 3} pool)
          "all three slots go to the relevant metric; the pointless metric is excluded")))
  (testing "Comparable metrics interleave — very-interesting does not crowd out sort-of-interesting"
    (let [very   [(q 1 1 11 0.9 0.9) (q 2 1 12 0.9 0.8) (q 3 1 13 0.9 0.7)]
          sortof [(q 4 2 21 0.6 0.9) (q 5 2 22 0.6 0.8) (q 6 2 23 0.6 0.7)]
          pool   (set (map :id (common/select-pool 4 (concat very sortof))))]
      (is (contains? pool 4) "the sort-of-interesting metric's top breakout still gets in")
      (is (= 2 (count (filter #{1 2 3} pool))) "very-interesting metric gets 2 of 4 slots")
      (is (= 2 (count (filter #{4 5 6} pool))) "sort-of-interesting metric gets 2 of 4 slots"))))

(deftest select-pool-treats-segments-as-distinct-breakouts-test
  (testing "Same metric+dimension, different segments are spread as separate breakouts"
    (let [mk     (fn [id seg det] {:id id :card_id 1 :dimension_id 10 :segment_id seg
                                   :contextual_interestingness_score 0.7 :interestingness_score det})
          charts [(mk 1 nil 0.9) (mk 2 nil 0.85) (mk 3 "A" 0.8) (mk 4 "B" 0.7)]
          pool   (set (map :id (common/select-pool 2 charts)))]
      ;; grouping by (dimension, segment) sends the 2nd slot to a different segment (id 3),
      ;; not another chart from the same unsegmented breakout (id 2)
      (is (= #{1 3} pool)))))

;;; ---------------------------------------------- variant-label / group-breakouts ----------------------------------------------

(deftest variant-label-test
  (is (= "full breakdown" (common/variant-label "default")))
  (is (= "top-N + Other" (common/variant-label "top-n-other")))
  (is (= "series over time" (common/variant-label "time-facet")))
  (testing "unknown variants fall back to the raw type"
    (is (= "weird" (common/variant-label "weird")))))

(defn- pc
  "A minimal prepped-chart record for breakout-grouping tests."
  [id card dim seg score qtype]
  {:exploration-query-id id :card-id card :dimension-id dim :segment-id seg
   :score score :query-type qtype :variant-label (common/variant-label qtype)})

(deftest group-breakouts-bundles-variants-test
  (testing "Charts grouped by (metric, dimension, segment); variants ordered best-first; breakouts best-first"
    (let [charts [(pc 1 100 10 nil 0.5 "default")
                  (pc 2 100 10 nil 0.9 "top-n-other")  ; same breakout as 1, higher score
                  (pc 3 100 20 nil 0.7 "default")       ; different dimension
                  (pc 4 100 10 "S" 0.6 "default")]      ; same dim, different segment
          bs    (common/group-breakouts charts)]
      (is (= 3 (count bs)) "(10,nil), (20,nil), (10,S) are three distinct breakouts")
      (let [b0 (first bs)]
        (is (= 2 (:rep-id b0)) "representative is the highest-scored variant (top-n-other, id 2)")
        (is (= [2 1] (mapv :exploration-query-id (:variants b0))) "variants ordered best-first")
        (is (= 0.9 (:score b0))))
      (is (= [0.9 0.7 0.6] (mapv :score bs)) "breakouts ordered best-first by representative score"))))

;;; ---------------------------------------------- summarize-parts ----------------------------------------------

(deftest summarize-parts-collapses-by-type-test
  (testing "Reasoning chunks concat with newlines, non-tool text concats, usage stays as-is"
    (let [parts [{:type :reasoning :reasoning "step 1"}
                 {:type :text :text "narration"}
                 {:type :reasoning :reasoning "step 2"}
                 {:type :tool-input :function "structured_output" :arguments {:document {}}}
                 {:type :usage :usage {:in 100 :out 50}}]
          out   (#'common/summarize-parts parts)]
      (is (= "step 1\nstep 2" (:reasoning out)))
      (is (= "narration" (:text out)))
      (is (= {:in 100 :out 50} (:usage out)))
      (is (= parts (:all out)) "raw parts always retained under :all"))))

(deftest summarize-parts-omits-empty-keys-test
  (testing "Missing reasoning / text / usage do not appear in the output map"
    (let [out (#'common/summarize-parts [{:type :tool-input :function "x"}])]
      (is (= [:all] (keys out))))))

;;; ---------------------------------------------- run-with-repair ----------------------------------------------
;;;
;;; `run-with-repair` is the phase-agnostic LLM call + validate + one-repair-retry
;;; loop both phases run through. The control flow has three branches: pass on
;;; first attempt, pass on repair, fail after repair. We exercise each branch
;;; against a stubbed `call-llm` (private fn — redef via #').

(defn- with-stubbed-llm!
  "Run `body` with the private `call-llm` swapped for a function that returns
  successive elements of `responses` on each call. Each response is the
  full `{:response :parts}` map."
  [responses body-fn]
  (let [calls    (atom 0)
        history  (atom [])]
    (with-redefs [common/call-llm (fn [_llm-config messages _schema _tag]
                                    (swap! history conj messages)
                                    (let [n (deref calls)]
                                      (swap! calls inc)
                                      (nth responses n)))]
      (body-fn {:calls calls :history history}))))

(deftest run-with-repair-passes-first-attempt-test
  (testing "Valid first response → :ok, one attempt, no repair message"
    (with-stubbed-llm!
      [{:response {:x 1} :parts []}]
      (fn [{:keys [calls history]}]
        (let [out (common/run-with-repair
                   {:thread-id      42
                    :phase-name     "phase-1"
                    :prompt         "go"
                    :schema         {}
                    :extract-fn     identity
                    :validate-fn    (constantly [])
                    :repair-builder (fn [_ _] "should not be called")})]
          (is (= :ok (:outcome out)))
          (is (= {:x 1} (:value out)))
          (is (= 1 (count (:attempts out))))
          (is (= 1 (deref calls)) "only one LLM call")
          (is (= 1 (count (deref history)))
              "no repair message constructed"))))))

(deftest run-with-repair-recovers-on-repair-test
  (testing "Invalid first, valid retry → :ok, two attempts, repair message includes errors"
    (let [validate-calls (atom 0)
          repair-built   (atom nil)]
      (with-stubbed-llm!
        [{:response {:bad 1} :parts []}
         {:response {:good 1} :parts []}]
        (fn [{:keys [history]}]
          (let [out (common/run-with-repair
                     {:thread-id      42
                      :phase-name     "phase-1"
                      :prompt         "go"
                      :schema         {}
                      :extract-fn     identity
                      :validate-fn    (fn [v]
                                        (swap! validate-calls inc)
                                        (if (:good v) [] ["nope"]))
                      :repair-builder (fn [prev errors]
                                        (reset! repair-built {:prev prev :errors errors})
                                        "fix it")})]
            (is (= :ok (:outcome out)))
            (is (= {:good 1} (:value out)))
            (is (= 2 (count (:attempts out))))
            (is (= 2 @validate-calls))
            (is (= {:bad 1} (:prev @repair-built))
                "repair builder gets the *extracted* prior value")
            (is (= ["nope"] (:errors @repair-built)))
            (let [retry-messages (second @history)]
              (is (= 3 (count retry-messages))
                  "retry transcript = original user msg + assistant echo + repair user msg")
              (is (= "fix it" (:content (last retry-messages))))
              (is (= "assistant" (:role (second retry-messages)))))))))))

(deftest run-with-repair-gives-up-after-repair-test
  (testing "Invalid first AND invalid retry → :failed, :final-errors populated"
    (with-stubbed-llm!
      [{:response {:bad 1} :parts []}
       {:response {:still-bad 1} :parts []}]
      (fn [_]
        (let [out (common/run-with-repair
                   {:thread-id      42
                    :phase-name     "phase-2"
                    :prompt         "go"
                    :schema         {}
                    :extract-fn     identity
                    :validate-fn    (constantly ["broken"])
                    :repair-builder (fn [_ _] "fix it")})]
          (is (= :failed (:outcome out)))
          (is (nil? (:value out)))
          (is (= ["broken"] (:final-errors out)))
          (is (= 2 (count (:attempts out)))))))))

(deftest run-with-repair-records-validation-errors-per-attempt-test
  (testing "Each attempt's record carries its own validation-errors vector"
    (with-stubbed-llm!
      [{:response {:r 1} :parts []}
       {:response {:r 2} :parts []}]
      (fn [_]
        (let [errors-by-response {{:r 1} ["bad1"]
                                  {:r 2} []}
              out (common/run-with-repair
                   {:thread-id      1
                    :phase-name     "phase-1"
                    :prompt         "go"
                    :schema         {}
                    :extract-fn     identity
                    :validate-fn    (fn [v] (errors-by-response v ["unknown"]))
                    :repair-builder (fn [_ _] "fix")})
              [a1 a2] (:attempts out)]
          (is (= ["bad1"] (:validation-errors a1)))
          (is (= []       (:validation-errors a2)))
          (is (= 1 (:attempt a1)))
          (is (= 2 (:attempt a2))))))))
