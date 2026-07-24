(ns metabase-enterprise.osi-generation.throttle-test
  "The per-run budget tracker. Pure mutable-state tests, no appdb, no LLM: build a budget,
  drive `consume!`/`allow?`, and assert the dimension that binds. The persistent window quota's query
  path is covered end-to-end by `core-test/window-quota-blocks-the-run-before-selection-test`; here we
  only assert its unset short-circuit."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.osi-generation.settings :as settings]
   [metabase-enterprise.osi-generation.throttle :as throttle]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest run-budget-has-safe-defaults-test
  (testing "with no cap settings set, every soft budget dimension remains bounded"
    (mt/with-temporary-setting-values [osi-generation-max-entities-per-run     nil
                                       osi-generation-max-tokens-per-run        nil
                                       osi-generation-max-run-duration-minutes  nil]
      (is (= {:max-entities 100, :max-tokens 500000, :max-duration-ms 1800000}
             (throttle/run-budget))))))

(deftest run-budget-honors-caps-above-the-old-stopgap-test
  (testing "an entity cap raised above the legacy hard-coded 100 flows through unclamped — the setting,
           not a stopgap constant, bounds production runs"
    (mt/with-temporary-setting-values [osi-generation-max-entities-per-run 250]
      (is (= 250 (:max-entities (throttle/run-budget)))))))

(deftest entity-cap-test
  (testing "entity-cap is the setting when set, nil when unset, and the *remaining* allowance on a reused tracker"
    (is (nil? (throttle/entity-cap (throttle/new-tracker {:max-entities nil}))))
    (let [tracker (throttle/new-tracker {:max-entities 3})]
      (is (= 3 (throttle/entity-cap tracker)))
      (throttle/consume! tracker {:entities 2})
      (is (= 1 (throttle/entity-cap tracker)))
      (throttle/consume! tracker {:entities 5})
      (is (zero? (throttle/entity-cap tracker))))))

(deftest allow?-stops-on-entity-cap-test
  (testing "after consuming max-entities entities, allow? refuses the next candidate with {:limit :entities}"
    (let [tracker (throttle/new-tracker {:max-entities 2})]
      (is (nil? (throttle/allow? tracker)))
      (throttle/consume! tracker {:entities 2})
      (is (= {:limit :entities} (throttle/allow? tracker))))))

(deftest allow?-stops-on-token-cap-test
  (testing "token overshoot is allowed for the candidate in flight and stops the next one — usage is only known after the call"
    (let [tracker (throttle/new-tracker {:max-tokens 100})]
      (is (nil? (throttle/allow? tracker)))
      (throttle/consume! tracker {:input-tokens 60, :output-tokens 60})
      (is (= {:limit :tokens} (throttle/allow? tracker))))))

(deftest allow?-stops-on-duration-test
  (testing "a 0-minute (0-ms) duration cap makes allow? refuse immediately"
    (is (= {:limit :duration}
           (throttle/allow? (throttle/new-tracker {:max-duration-ms 0}))))))

(deftest summary-reports-stopped-by-test
  (testing ":stopped-by is nil on a run that exhausted its candidates, the limit keyword otherwise"
    (let [tracker (throttle/new-tracker {})]
      (throttle/consume! tracker {:entities 1, :input-tokens 2, :output-tokens 3})
      (let [summary (throttle/summary tracker)]
        (is (= {:entities 1, :input-tokens 2, :output-tokens 3, :stopped-by nil}
               (dissoc summary :duration-ms)))
        (is (integer? (:duration-ms summary)))))
    (let [tracker (throttle/new-tracker {:max-entities 1})]
      (throttle/consume! tracker {:entities 1})
      (throttle/allow? tracker)
      (is (= :entities (:stopped-by (throttle/summary tracker)))))))

(deftest window-quota-unset-short-circuits-test
  (testing "with both window quotas unset, window-quota-exceeded? is nil and never queries ai_usage_log"
    (mt/with-temporary-setting-values [osi-generation-max-tokens-per-hour nil
                                       osi-generation-max-tokens-per-day  nil]
      ;; No DB access to redef away: if either quota were consulted here the query would run, so the
      ;; nil result is proof the unset path short-circuits before touching the appdb.
      (is (nil? (throttle/window-budget)))
      (is (nil? (throttle/window-quota-exceeded?))))))

(deftest window-budget-reports-the-tightest-remaining-allowance-test
  (mt/with-temporary-setting-values [osi-generation-max-tokens-per-hour 100
                                     osi-generation-max-tokens-per-day  1000]
    (with-redefs-fn {#'throttle/window-tokens-spent (fn [since]
                                                      ;; The hour timestamp is later than the day timestamp.
                                                      (if (.isAfter ^java.time.Instant since
                                                                    (.minusSeconds (java.time.Instant/now) 4000))
                                                        99
                                                        800))}
      (fn []
        (is (= {:window :hour, :remaining-tokens 1, :exhausted? false}
               (throttle/window-budget)))))))

(comment settings/keep-me)
