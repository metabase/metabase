(ns metabase.metabot.quality.compose-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.quality.compose :as compose]
   [metabase.metabot.quality.constants :as constants]))

(set! *warn-on-reflection* true)

(defn- close-to?
  "True if `a` and `b` agree to three decimals."
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
  (testing "excess kind: contribution = k × max(0, magnitude - baseline)"
    (testing "at baseline → 0"
      (is (= 0.0 (compose/signal-contribution :query-thrash 2))))
    (testing "below baseline → 0 (clamped)"
      (is (= 0.0 (compose/signal-contribution :query-thrash 0)))
      (is (= 0.0 (compose/signal-contribution :query-thrash 1))))
    (testing "above baseline → k × excess"
      (is (= 1.0 (compose/signal-contribution :query-thrash 3)))
      (is (= 8.0 (compose/signal-contribution :query-thrash 10))))))

(deftest signal-contribution-n-expensive-turn-test
  (testing "n-expensive-turn is event-count with k=3"
    (is (= 0.0 (compose/signal-contribution :n-expensive-turn 0)))
    (is (= 3.0 (compose/signal-contribution :n-expensive-turn 1)))
    (is (= 6.0 (compose/signal-contribution :n-expensive-turn 2)))
    (is (= 12.0 (compose/signal-contribution :n-expensive-turn 4)))))

(deftest signal-contribution-unknown-throws-test
  (testing "unknown signal key throws so caller typos surface immediately"
    (is (thrown-with-msg? Exception #"Unknown quality signal"
                          (compose/signal-contribution :not-a-real-signal 1)))))

;; ---------------------------------------------------------------------------
;; compose-score — single-signal worked examples
;;
;; Each row's `expected-raw` is the contribution of one signal firing at the
;; given magnitude (k × m for event-count, k × max(0, m - baseline) for
;; excess); `expected-concern` is `raw / (raw + saturation-C)`.
;; ---------------------------------------------------------------------------

(deftest compose-score-clean-conversation-test
  (testing "no signal fires → score 0.0, concern 0.0, raw 0.0"
    (let [{:keys [quality_score concern raw]} (compose/compose-score {})]
      (is (= 0.0 quality_score))
      (is (= 0.0 concern))
      (is (= 0.0 raw)))))

(deftest compose-score-worked-examples-test
  (testing "single-signal contribution and concern math (3-decimal agreement)"
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
             ["1 n-expensive-turn (k=3)"
              {:n-expensive-turn 1}          3.0 0.231]
             ["2 n-expensive-turn (k=3)"
              {:n-expensive-turn 2}          6.0 0.375]]]
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
    (let [magnitudes  {:canonical-bypass     2
                       :canonical-ignored    3
                       :tool-error-magnitude 1
                       :query-thrash         4
                       :n-expensive-turn     2}
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

;; ---------------------------------------------------------------------------
;; Regression anchor — derived from `signal-params` and `saturation-C`
;;
;; Intentionally fragile: any retune of an event-count signal's `k`, any
;; change to `saturation-C`, or any addition/removal of an event-count signal
;; from `signal-params` flips one of these assertions. Read "this test is
;; failing" as "you changed the composite — bump `composite-version`, queue a
;; backfill, and update the test to reflect the new tuning."
;; ---------------------------------------------------------------------------

(defn- event-count-signal-keys
  "Subset of `constants/signal-keys` whose `:kind` is `:event-count` per
  `signal-params`. Derived rather than hard-coded so the test follows the
  panel."
  []
  (filterv #(= :event-count (get-in constants/signal-params [% :kind]))
           constants/signal-keys))

(defn- expected-concern-from-raw
  "Forward saturation formula. Mirrors `compose-score` but is intentionally
  re-stated here so a refactor of `compose-score`'s shape can't silently
  alter the regression target."
  [raw]
  (let [r (double raw)]
    (/ r (+ r (double constants/saturation-C)))))

(deftest worked-example-regression-anchor-per-event-count-signal-test
  (testing "each event-count signal at magnitude 1 → raw = k, concern = k / (k + saturation-C)"
    (doseq [sig (event-count-signal-keys)]
      (testing sig
        (let [k                                    (double (get-in constants/signal-params [sig :k]))
              expected-c                           (expected-concern-from-raw k)
              {:keys [raw concern quality_score]}  (compose/compose-score {sig 1})]
          (is (= k raw)
              (str sig ": raw must equal that signal's k"))
          (is (close-to? expected-c concern)
              (str sig ": concern must equal k / (k + saturation-C)"))
          (is (close-to? (- expected-c) quality_score)
              (str sig ": quality_score must equal -concern")))))))

(deftest worked-example-regression-anchor-full-event-count-panel-test
  (testing "one event of every event-count signal → raw = Σ k_i over the event-count panel"
    (let [event-count-keys                    (event-count-signal-keys)
          k-for                                #(double (get-in constants/signal-params [% :k]))
          magnitudes                           (zipmap event-count-keys (repeat 1))
          expected-raw                         (reduce + 0.0 (map k-for event-count-keys))
          expected-c                           (expected-concern-from-raw expected-raw)
          {:keys [raw concern quality_score]}  (compose/compose-score magnitudes)]
      (is (close-to? expected-raw raw)
          "raw must equal Σ k_i across the event-count panel")
      (is (close-to? expected-c concern)
          "concern must equal (Σ k_i) / (Σ k_i + saturation-C)")
      (is (close-to? (- expected-c) quality_score)
          "quality_score must equal -concern"))))

(deftest worked-example-regression-anchor-zero-signal-is-positive-zero-test
  (testing "zero-signal score is +0.0, not -0.0. `=` treats both as equal, so the assertion goes through the IEEE-754 raw bit pattern."
    (let [{:keys [quality_score]}  (compose/compose-score {})
          pos-zero-bits             (Double/doubleToRawLongBits 0.0)
          score-bits                (Double/doubleToRawLongBits (double quality_score))]
      (is (= 0.0 quality_score))
      (is (= pos-zero-bits score-bits)
          "score must be +0.0 — a -0.0 here would serialize as \"-0.0\" downstream"))))
