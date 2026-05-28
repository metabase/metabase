(ns metabase.metabot.quality.metrics-test
  "Pure unit tests. Each test hand-builds a minimal normalized struct
  (entity sets + tool-events) and feeds it through
  [[metabase.metabot.quality.metrics/compute]]. No DB hits — governance is
  an empty map (the metrics that consult it land in a later phase)."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.quality.metrics :as metrics]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------
;;; Builders
;;; ---------------------------------------------------------------------------

(defn- atom-rec
  [type id]
  {:type type :id id :id-str (str id) :provenance []})

(defn- entity-key [type id] [type (str id)])

(defn- set-of
  [atoms]
  (into {} (map (fn [a] [(entity-key (:type a) (:id a)) a])) atoms))

(defn- normalized
  "Minimal normalized struct. `metrics/compute` reads the authored (`:Q`)
  and hallucinated (`:H`) sets, `:tool-events`, and the temporal
  terminal-state. Defaults to a clean exit so grounding / failure-rate
  tests don't have to set it."
  [& {:keys [Q H tool-events terminal-state]
      :or   {Q [] H [] tool-events [] terminal-state :model_signaled_done}}]
  {:sets        {:P {} :D {} :Q (set-of Q) :I {} :H (set-of H)}
   :tool-events tool-events
   :temporal    {:terminal-state terminal-state}})

;;; ---------------------------------------------------------------------------
;;; Grounding — bare fraction
;;; ---------------------------------------------------------------------------

(deftest grounding-na-on-empty-authored-set-test
  (testing "no authored entities → grounding is N/A"
    (is (= :na (:grounding (metrics/compute (normalized) {}))))))

(deftest grounding-zero-when-sole-authored-entity-ungrounded-test
  (testing "a single authored entity that was never surfaced → grounding 0.0"
    (let [a (atom-rec "card" 1)]
      (is (= 0.0 (:grounding (metrics/compute (normalized :Q [a] :H [a]) {})))))))

(deftest grounding-is-one-minus-ungrounded-fraction-test
  (testing "grounding = 1 − |never-surfaced| / |authored|"
    ;; 1 of 20 authored entities ungrounded → 1 − 1/20 = 0.95
    (let [qs (for [i (range 20)] (atom-rec "card" i))
          h  [(atom-rec "card" 0)]]
      (is (= 0.95 (:grounding (metrics/compute (normalized :Q qs :H h) {})))))))

(deftest grounding-one-when-everything-surfaced-test
  (testing "every authored entity was surfaced → grounding 1.0"
    (let [qs (for [i (range 5)] (atom-rec "card" i))]
      (is (= 1.0 (:grounding (metrics/compute (normalized :Q qs :H []) {})))))))

(deftest grounding-keeps-fields-in-denominator-test
  (testing "field-type authored entities count in the grounding denominator —
            an ungrounded authored field is a real signal"
    ;; authored {field 1, card 2}; ungrounded {field 1} → 1 − 1/2 = 0.5
    (let [f (atom-rec "field" 1)
          c (atom-rec "card" 2)]
      (is (= 0.5 (:grounding (metrics/compute (normalized :Q [f c] :H [f]) {})))))))

;;; ---------------------------------------------------------------------------
;;; Tool-call failure rate
;;; ---------------------------------------------------------------------------

(defn- event
  ([function]     {:function function :iteration-index 0})
  ([function err] {:function function :iteration-index 0 :error err}))

(deftest failure-rate-zero-with-no-tool-events-test
  (testing "no tool calls → failure rate 0.0"
    (is (= 0.0 (:tool-call-failure-rate (metrics/compute (normalized) {}))))))

(deftest failure-rate-zero-when-no-errors-test
  (testing "every tool call succeeded → failure rate 0.0"
    (is (= 0.0 (:tool-call-failure-rate
                (metrics/compute (normalized :tool-events [(event "a") (event "b")]) {}))))))

(deftest failure-rate-is-errored-over-total-test
  (testing "failure rate = errored / total tool calls"
    ;; 1 of 2 errored → 0.5
    (is (= 0.5 (:tool-call-failure-rate
                (metrics/compute (normalized :tool-events [(event "a" {:msg "x"}) (event "b")])
                                 {}))))))

(deftest failure-rate-one-when-every-call-errored-test
  (testing "every tool call errored → failure rate 1.0"
    (is (= 1.0 (:tool-call-failure-rate
                (metrics/compute (normalized :tool-events [(event "a" {:msg "x"})
                                                           (event "b" {:msg "y"})])
                                 {}))))))

;;; ---------------------------------------------------------------------------
;;; Termination signal — categorical from the terminal state
;;; ---------------------------------------------------------------------------

(deftest termination-signal-zero-on-clean-exit-test
  (testing "the agent stopping on its own — signaling done or a final response — is 0.0"
    (is (= 0.0 (:termination-signal (metrics/compute (normalized :terminal-state :model_signaled_done) {}))))
    (is (= 0.0 (:termination-signal (metrics/compute (normalized :terminal-state :final_response) {}))))))

(deftest termination-signal-one-on-forced-exit-test
  (testing "hitting the iteration cap, erroring, or being aborted is 1.0"
    (is (= 1.0 (:termination-signal (metrics/compute (normalized :terminal-state :iter_cap) {}))))
    (is (= 1.0 (:termination-signal (metrics/compute (normalized :terminal-state :error) {}))))
    (is (= 1.0 (:termination-signal (metrics/compute (normalized :terminal-state :aborted) {}))))))

(deftest termination-signal-one-on-unrecognized-state-test
  (testing "an unrecognized terminal state defaults to 1.0"
    (is (= 1.0 (:termination-signal (metrics/compute (normalized :terminal-state :something-else) {}))))))
