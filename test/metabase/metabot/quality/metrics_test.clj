(ns metabase.metabot.quality.metrics-test
  "Pure unit tests. Each test hand-builds a minimal normalized struct
  (entity sets + tool-events) and feeds it through
  [[metabase.metabot.quality.metrics/compute]]. No DB hits — the canonical
  metrics read a hand-built governance map whose facts exercise
  [[metabase.metabot.quality.governance/canonical?]] directly."
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
  "Minimal normalized struct. `metrics/compute` reads the discovered
  (`:D`), authored (`:Q`), inspected (`:I`), and hallucinated (`:H`) sets,
  `:tool-events`, and the temporal terminal-state. Defaults to a clean
  exit so grounding / failure-rate tests don't have to set it."
  [& {:keys [D Q I H tool-events terminal-state]
      :or   {D [] Q [] I [] H [] tool-events [] terminal-state :model_signaled_done}}]
  {:sets        {:P {} :D (set-of D) :Q (set-of Q) :I (set-of I) :H (set-of H)}
   :tool-events tool-events
   :temporal    {:terminal-state terminal-state}})

;; Minimal facts maps that resolve canonical / non-canonical through
;; governance/canonical? — a verified card and a name-only entity clear /
;; fail the predicate respectively.
(def ^:private canonical-facts   {:kind :card :moderation-status "verified"})
(def ^:private uncanonical-facts {:kind :card})

(defn- gov
  "Build a governance map keying the given `[type id]` pairs to facts."
  [pairs->facts]
  (into {} (map (fn [[[type id] facts]] [(entity-key type id) facts])) pairs->facts))

(defn- search-event
  "A search tool-event surfacing `outputs` (each a `[type id]` pair)."
  [& outputs]
  {:function        "search"
   :iteration-index 0
   :output          (mapv (fn [[type id]] {:type type :id id}) outputs)})

;;; ---------------------------------------------------------------------------
;;; Grounding — bare fraction
;;; ---------------------------------------------------------------------------

(deftest grounding-na-on-empty-authored-set-test
  (testing "no authored entities → grounding is N/A"
    (is (= :na (:grounded-source-share (metrics/compute (normalized) {}))))))

(deftest grounding-zero-when-sole-authored-entity-ungrounded-test
  (testing "a single authored entity that was never surfaced → grounding 0.0"
    (let [a (atom-rec "card" 1)]
      (is (= 0.0 (:grounded-source-share (metrics/compute (normalized :Q [a] :H [a]) {})))))))

(deftest grounding-is-one-minus-ungrounded-fraction-test
  (testing "grounding = 1 - |never-surfaced| / |authored|"
    ;; 1 of 20 authored entities ungrounded → 1 - 1/20 = 0.95
    (let [qs (for [i (range 20)] (atom-rec "card" i))
          h  [(atom-rec "card" 0)]]
      (is (= 0.95 (:grounded-source-share (metrics/compute (normalized :Q qs :H h) {})))))))

(deftest grounding-one-when-everything-surfaced-test
  (testing "every authored entity was surfaced → grounding 1.0"
    (let [qs (for [i (range 5)] (atom-rec "card" i))]
      (is (= 1.0 (:grounded-source-share (metrics/compute (normalized :Q qs :H []) {})))))))

(deftest grounding-keeps-fields-in-denominator-test
  (testing "field-type authored entities count in the grounding denominator —
            an ungrounded authored field is a real signal"
    ;; authored {field 1, card 2}; ungrounded {field 1} → 1 - 1/2 = 0.5
    (let [f (atom-rec "field" 1)
          c (atom-rec "card" 2)]
      (is (= 0.5 (:grounded-source-share (metrics/compute (normalized :Q [f c] :H [f]) {})))))))

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
;;; Termination health — categorical from the terminal state
;;; ---------------------------------------------------------------------------

(deftest termination-health-one-on-clean-exit-test
  (testing "the agent stopping on its own — signaling done or a final response — is 1.0"
    (is (= 1.0 (:termination-health (metrics/compute (normalized :terminal-state :model_signaled_done) {}))))
    (is (= 1.0 (:termination-health (metrics/compute (normalized :terminal-state :final_response) {}))))))

(deftest termination-health-zero-on-forced-exit-test
  (testing "hitting the iteration cap, erroring, or being aborted is 0.0"
    (is (= 0.0 (:termination-health (metrics/compute (normalized :terminal-state :iter_cap) {}))))
    (is (= 0.0 (:termination-health (metrics/compute (normalized :terminal-state :error) {}))))
    (is (= 0.0 (:termination-health (metrics/compute (normalized :terminal-state :aborted) {}))))))

(deftest termination-health-zero-on-unrecognized-state-test
  (testing "an unrecognized terminal state defaults to 0.0"
    (is (= 0.0 (:termination-health (metrics/compute (normalized :terminal-state :something-else) {}))))))

;;; ---------------------------------------------------------------------------
;;; Canonical Source Share
;;; ---------------------------------------------------------------------------

(deftest canonical-source-share-one-when-all-canonical-test
  (testing "every authored data source is canonical → share 1.0"
    (let [g (gov {["card" 1] canonical-facts ["card" 2] canonical-facts})]
      (is (= 1.0 (:canonical-source-share
                  (metrics/compute (normalized :Q [(atom-rec "card" 1) (atom-rec "card" 2)]) g)))))))

(deftest canonical-source-share-zero-when-none-canonical-test
  (testing "no authored data source is canonical → share 0.0"
    (let [g (gov {["card" 1] uncanonical-facts})]
      (is (= 0.0 (:canonical-source-share
                  (metrics/compute (normalized :Q [(atom-rec "card" 1)]) g)))))))

(deftest canonical-source-share-absent-from-governance-counts-non-canonical-test
  (testing "an authored card the appdb can't resolve counts as non-canonical"
    ;; one canonical, one absent from governance → 1 of 2 → 0.5
    (let [g (gov {["card" 1] canonical-facts})]
      (is (= 0.5 (:canonical-source-share
                  (metrics/compute (normalized :Q [(atom-rec "card" 1) (atom-rec "card" 2)]) g)))))))

(deftest canonical-source-share-na-on-empty-authored-set-test
  (testing "nothing authored → share is N/A"
    (is (= :na (:canonical-source-share (metrics/compute (normalized) {}))))))

(deftest canonical-source-share-na-when-authored-set-has-no-data-sources-test
  (testing "an authored set with only non-data-source entities (here a lone
            field) has an empty data-source denominator → N/A, never a
            divide-by-zero"
    (is (= :na (:canonical-source-share
                (metrics/compute (normalized :Q [(atom-rec "field" 1)]) {}))))))

(deftest canonical-source-share-excludes-fields-from-denominator-test
  (testing "field-type authored entities are excluded from both sides — a
            field never resolves canonical and would otherwise drag the share
            down"
    ;; authored {field 1, card 2 (canonical)}; field excluded → 1 of 1 → 1.0
    (let [g (gov {["card" 2] canonical-facts})]
      (is (= 1.0 (:canonical-source-share
                  (metrics/compute (normalized :Q [(atom-rec "field" 1) (atom-rec "card" 2)]) g)))))))

;;; ---------------------------------------------------------------------------
;;; Search Efficiency
;;; ---------------------------------------------------------------------------

(deftest search-efficiency-flags-repeated-results-test
  (testing "a second search that rediscovers the first's results → 1 of 2
            unproductive → health 0.5"
    (is (= 0.5 (:search-efficiency
                (metrics/compute
                 (normalized :tool-events [(search-event ["card" 1] ["card" 2])
                                           (search-event ["card" 1] ["card" 2])])
                 {}))))))

(deftest search-efficiency-one-when-results-disjoint-test
  (testing "searches with disjoint result sets are all productive → health 1.0"
    (is (= 1.0 (:search-efficiency
                (metrics/compute
                 (normalized :tool-events [(search-event ["card" 1] ["card" 2])
                                           (search-event ["card" 3] ["card" 4])])
                 {}))))))

(deftest search-efficiency-na-on-single-call-test
  (testing "a single search can't rediscover anything → N/A"
    (is (= :na (:search-efficiency
                (metrics/compute (normalized :tool-events [(search-event ["card" 1])]) {}))))))

(deftest search-efficiency-na-on-no-calls-test
  (testing "no search calls → N/A"
    (is (= :na (:search-efficiency (metrics/compute (normalized) {}))))))

(deftest search-efficiency-catches-non-adjacent-overlap-test
  (testing "rediscovery is compared against all prior calls, not just the
            previous one — A, B, A flags the third call"
    ;; calls 1 and 3 identical, call 2 disjoint → 1 of 3 unproductive → 1 - 1/3
    (let [health (:search-efficiency
                  (metrics/compute
                   (normalized :tool-events [(search-event ["card" 1] ["card" 2])
                                             (search-event ["card" 9] ["card" 10])
                                             (search-event ["card" 1] ["card" 2])])
                   {}))]
      (is (< 0.666 health 0.667)))))

(deftest search-efficiency-ignores-non-search-tool-events-test
  (testing "only search-tool events count — a non-search call with overlapping
            output doesn't make a lone search rediscover anything"
    (is (= :na (:search-efficiency
                (metrics/compute
                 (normalized :tool-events [(search-event ["card" 1])
                                           {:function "construct_notebook_query"
                                            :output [{:type "card" :id 1}]}])
                 {}))))))
