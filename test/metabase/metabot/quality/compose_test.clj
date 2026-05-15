(ns metabase.metabot.quality.compose-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.quality.compose :as compose]
   [metabase.metabot.quality.constants :as constants]))

(set! *warn-on-reflection* true)

(defn- close-to?
  "True if `a` and `b` agree to three decimals (the precision used in
  strategy-v3's worked-examples table)."
  [a b]
  (< (Math/abs (- (double a) (double b))) 5e-4))

;; ---------------------------------------------------------------------------
;; signal-contribution
;; ---------------------------------------------------------------------------

(deftest signal-contribution-event-count-test
  (testing "event-count kind: contribution = k × magnitude"
    (is (= 0.0 (compose/signal-contribution :canonical-bypass 0)))
    (is (= 3.0 (compose/signal-contribution :canonical-bypass 1)))
    (is (= 9.0 (compose/signal-contribution :canonical-bypass 3)))
    (is (= 2.0 (compose/signal-contribution :canonical-ignored 1)))
    (is (= 10.0 (compose/signal-contribution :canonical-ignored 5)))
    (is (= 1.5 (compose/signal-contribution :search-ignored 1)))
    (is (= 4.5 (compose/signal-contribution :search-ignored 3)))
    (is (= 45.0 (compose/signal-contribution :tool-error-magnitude 15)))
    (is (close-to? 7.5 (compose/signal-contribution :turn-thrash 25)))))

(deftest signal-contribution-excess-test
  (testing "excess kind: contribution = k × max(0, magnitude − baseline)"
    (testing "at baseline → 0"
      (is (= 0.0 (compose/signal-contribution :expensive-search-turn 30000)))
      (is (= 0.0 (compose/signal-contribution :query-thrash 2))))
    (testing "below baseline → 0 (clamped)"
      (is (= 0.0 (compose/signal-contribution :expensive-search-turn 0)))
      (is (= 0.0 (compose/signal-contribution :expensive-search-turn 5000)))
      (is (= 0.0 (compose/signal-contribution :query-thrash 0)))
      (is (= 0.0 (compose/signal-contribution :query-thrash 1))))
    (testing "above baseline → k × excess"
      (is (close-to? 3.0 (compose/signal-contribution :expensive-search-turn 60000)))
      (is (close-to? 7.0 (compose/signal-contribution :expensive-search-turn 100000)))
      (is (close-to? 3.0 (compose/signal-contribution :expensive-tool-turn 60000)))
      (is (= 1.0 (compose/signal-contribution :query-thrash 3)))
      (is (= 8.0 (compose/signal-contribution :query-thrash 10))))))

(deftest signal-contribution-unknown-throws-test
  (testing "unknown signal key throws so caller typos surface immediately"
    (is (thrown-with-msg? Exception #"Unknown quality signal"
                          (compose/signal-contribution :not-a-real-signal 1)))))

;; ---------------------------------------------------------------------------
;; compose-score — single-signal worked examples
;;
;; These rows are drawn from strategy-v3 §"Worked examples" and
;; signals-ref §4.5. Only the rows whose math is internally consistent with
;; `signal-params` are tested here. Combined-row worked examples in the docs
;; (e.g. "1 of each Tier-H/M signal = 16.5") are off by a small constant
;; from the published k values; see the Phase 1B summary in the progress doc.
;; ---------------------------------------------------------------------------

(deftest compose-score-clean-conversation-test
  (testing "no signal fires → score 0.0, concern 0.0, raw 0.0"
    (let [{:keys [quality_score concern raw]} (compose/compose-score {})]
      (is (= 0.0 quality_score))
      (is (= 0.0 concern))
      (is (= 0.0 raw)))))

(deftest compose-score-worked-examples-test
  (testing "single-signal rows from strategy-v3 worked-examples (3-decimal agreement)"
    (doseq [[label magnitudes expected-raw expected-concern]
            [["1 tool error"                {:tool-error-magnitude 1}     3.0 0.231]
             ["2 tool errors"               {:tool-error-magnitude 2}     6.0 0.375]
             ["5 tool errors"               {:tool-error-magnitude 5}    15.0 0.600]
             ["15 tool errors"              {:tool-error-magnitude 15}   45.0 0.818]
             ["30 tool errors"              {:tool-error-magnitude 30}   90.0 0.900]
             ["1 canonical-bypass event"    {:canonical-bypass 1}         3.0 0.231]
             ["3 canonical-bypass events"   {:canonical-bypass 3}         9.0 0.474]
             ["1 cap-burn"                  {:iter-cap-burned 1}          3.0 0.231]
             ["3 cap-burns"                 {:iter-cap-burned 3}          9.0 0.474]
             ["1 broken turn"               {:turn-broken 1}              3.0 0.231]
             ["5 broken turns"              {:turn-broken 5}             15.0 0.600]
             ["5 ignored canonical entities"
              {:canonical-ignored 5}        10.0 0.500]
             ["query-thrash 10 rewrites (excess 8)"
              {:query-thrash 10}             8.0 0.444]
             ["turn-thrash excess 25"
              {:turn-thrash 25}              7.5 0.429]
             ["expensive-search-turn 100K (excess 70K)"
              {:expensive-search-turn 100000} 7.0 0.412]]]
      (testing label
        (let [{:keys [quality_score concern raw]} (compose/compose-score magnitudes)]
          (is (close-to? expected-raw raw)
              (str label " — raw"))
          (is (close-to? expected-concern concern)
              (str label " — concern"))
          (is (close-to? (- expected-concern) quality_score)
              (str label " — quality_score = -concern")))))))

;; ---------------------------------------------------------------------------
;; compose-score — structural properties
;; ---------------------------------------------------------------------------

(deftest compose-score-includes-every-signal-in-contributions-test
  (testing "contributions map contains every signal-key even when input is sparse"
    (let [{:keys [contributions]} (compose/compose-score {:tool-error-magnitude 1})]
      (is (= (set constants/signal-keys) (set (keys contributions))))
      (is (= 3.0 (:tool-error-magnitude contributions)))
      (is (= 0.0 (:canonical-bypass contributions)))
      (is (= 0.0 (:turn-thrash contributions))))))

(deftest compose-score-contributions-sum-to-raw-test
  (testing "raw = sum of contributions"
    (let [magnitudes  {:canonical-bypass       2
                       :canonical-ignored      3
                       :tool-error-magnitude   1
                       :query-thrash           4
                       :expensive-search-turn  50000}
          {:keys [raw contributions]} (compose/compose-score magnitudes)]
      (is (close-to? raw (reduce + 0.0 (vals contributions)))))))

(deftest compose-score-monotonicity-test
  (testing "more evidence → more concern (never less)"
    (let [scores (map #(:concern (compose/compose-score {:tool-error-magnitude %}))
                      [0 1 2 5 10 30])]
      (is (apply <= scores)
          "concern non-decreasing as tool-error count grows"))))

(deftest compose-score-quality-score-range-test
  (testing "quality_score ∈ (-1, 0]"
    (doseq [n [0 1 5 100 1000 1000000]]
      (let [{:keys [quality_score]}
            (compose/compose-score {:tool-error-magnitude n})]
        (is (<= -1.0 quality_score 0.0)
            (str "n=" n " → score=" quality_score))))
    (testing "score approaches -1 asymptotically but never reaches it"
      (let [score (:quality_score
                   (compose/compose-score {:tool-error-magnitude 1000000}))]
        (is (< -1.0 score))
        (is (< score -0.999))))))

(deftest compose-score-zero-signal-distinct-from-no-input-test
  (testing "explicit-zero magnitudes behave identically to missing keys"
    (let [a (compose/compose-score {})
          b (compose/compose-score (zipmap constants/signal-keys (repeat 0)))]
      (is (= (:quality_score a) (:quality_score b)))
      (is (= (:raw a) (:raw b))))))
