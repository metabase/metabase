(ns metabase.metabot.quality.concern-signals-test
  "Phase 5 unit tests — pure. Each test hand-builds a minimal normalized
  struct (sets + temporal block + tool-events) and feeds it through
  [[metabase.metabot.quality.concern-signals/compute]], or exercises
  one signal in isolation.

  No DB hits — governance is a literal `{[type id-str] facts}` map and
  `ancestry-of` is `(constantly [])` or a stub closure."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.quality.concern-signals :as cs]
   [metabase.metabot.quality.constants :as constants]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------
;;; Builders
;;; ---------------------------------------------------------------------------

(defn- atom-rec
  "Compact atom-record matching the shape extract.clj emits — minus
  `:t-first-seen`/`:t-first-used`/`:governance`, which the concern
  signals don't read directly."
  ([type id]
   (atom-rec type id []))
  ([type id provenance]
   {:type       type
    :id         id
    :id-str     (str id)
    :provenance provenance}))

(defn- entity-key [type id] [type (str id)])

(defn- set-of
  "Coerce a seq of atom records into a `{[type id-str] atom}` map (the
  shape extract.clj's sets use)."
  [atoms]
  (into {} (map (fn [a] [(entity-key (:type a) (:id a)) a])) atoms))

(defn- normalized
  "Compose a minimal normalized struct. Empty defaults for everything
  not passed; lets each test set only the fields it cares about."
  [& {:keys [P D Q I H tool-events temporal]
      :or   {P [] D [] Q [] I [] H []
             tool-events []
             temporal {}}}]
  {:sets        {:P (set-of P) :D (set-of D) :Q (set-of Q)
                 :I (set-of I) :H (set-of H)}
   :tool-events tool-events
   :temporal    (merge {:iterations           0
                        :thrash-events        0
                        :rediscovery-r        0
                        :errors-resolved-rate nil
                        :terminal-state       :final_response}
                       temporal)})

;;; ---------------------------------------------------------------------------
;;; Healthy and worst-case end-to-end
;;; ---------------------------------------------------------------------------

(deftest compute-all-signals-zero-on-healthy-fixture-test
  (testing "a healthy conversation — empty sets, clean termination — produces zero for every signal"
    (let [signals (cs/compute (normalized) {} (constantly []))]
      (is (= 0.0 (:selection-quality      signals)))
      (is (= 0.0 (:grounding               signals)))
      (is (= 0.0 (:discovery-efficiency    signals)))
      (is (= 0.0 (:execution-health        signals)))
      (is (= 0.0 (:conversational-economy  signals)))
      (is (= 0.0 (:termination             signals))))))

(deftest compute-all-signals-non-zero-on-pathological-fixture-test
  (testing "a saturated worst-case fixture produces a meaningful signal on every component"
    (let [signals
          (cs/compute
           (normalized
            :H          (for [i (range 20)] (atom-rec "card" i))
            :tool-events (for [i (range 10)]
                           {:function "edit_sql_query" :arguments {:x i} :error {:msg "x"}})
            :temporal   {:iterations           30
                         :thrash-events        10
                         :rediscovery-r        10
                         :errors-resolved-rate 0.0
                         :terminal-state       :iter_cap})
           {}
           (constantly []))]
      (is (> (:grounding              signals) 0.8))
      (is (> (:discovery-efficiency   signals) 0.0)
          "rediscovery alone saturates this; the other two components stay 0 because CONV_D is empty")
      (is (> (:execution-health       signals) 0.0))
      (is (> (:conversational-economy signals) 0.5))
      (is (= 1.0 (:termination             signals))))))

;;; ---------------------------------------------------------------------------
;;; Selection-quality — substitution detection
;;; ---------------------------------------------------------------------------

(defn- card-gov [{:keys [verified? db-id name lives-in-personal? source-card-id]}]
  (cond-> {}
    (some? verified?)          (assoc :verified? verified?)
    (some? db-id)              (assoc :db-id db-id)
    (some? name)               (assoc :name name)
    (some? lives-in-personal?) (assoc :lives-in-personal? lives-in-personal?)
    (some? source-card-id)     (assoc :source-card-id source-card-id)))

(defn- table-gov [{:keys [db-id schema name]}]
  (cond-> {}
    (some? db-id)  (assoc :db-id db-id)
    (some? schema) (assoc :schema schema)
    (some? name)   (assoc :name name)))

(deftest selection-quality-substitution-card-positive-test
  (testing "unverified card Y in Q, verified card X in D with similar name + same db → substitution counted"
    (let [y (atom-rec "card" 100)
          x (atom-rec "card" 200)
          gov {(entity-key "card" 100) (card-gov {:verified? false :db-id 1 :name "orders monthly"})
               (entity-key "card" 200) (card-gov {:verified? true  :db-id 1 :name "orders monthly v2"})}
          signals (cs/compute (normalized :Q [y] :D [x]) gov (constantly []))]
      (is (pos? (:selection-quality signals))
          "saturated substitution count contributes to the signal"))))

(deftest selection-quality-substitution-card-negative-different-db-test
  (testing "name matches but db-id differs → not a substitute (cross-database spurious match)"
    (let [y (atom-rec "card" 100)
          x (atom-rec "card" 200)
          gov {(entity-key "card" 100) (card-gov {:verified? false :db-id 1 :name "orders"})
               (entity-key "card" 200) (card-gov {:verified? true  :db-id 2 :name "orders"})}]
      (is (zero? (:selection-quality (cs/compute (normalized :Q [y] :D [x]) gov (constantly []))))))))

(deftest selection-quality-substitution-card-negative-x-not-verified-test
  (testing "X is similar but not verified → not a substitute"
    (let [y (atom-rec "card" 100)
          x (atom-rec "card" 200)
          gov {(entity-key "card" 100) (card-gov {:verified? false :db-id 1 :name "orders"})
               (entity-key "card" 200) (card-gov {:verified? false :db-id 1 :name "orders"})}]
      (is (zero? (:selection-quality (cs/compute (normalized :Q [y] :D [x]) gov (constantly []))))))))

(deftest selection-quality-substitution-card-negative-y-verified-test
  (testing "Y is already verified → not a substitution candidate"
    (let [y (atom-rec "card" 100)
          x (atom-rec "card" 200)
          gov {(entity-key "card" 100) (card-gov {:verified? true :db-id 1 :name "orders"})
               (entity-key "card" 200) (card-gov {:verified? true :db-id 1 :name "orders v2"})}]
      (is (zero? (:selection-quality (cs/compute (normalized :Q [y] :D [x]) gov (constantly []))))))))

(deftest selection-quality-substitution-table-positive-test
  (testing "table Y in Q with similar table X in D + same db + same schema → substitution counted"
    (let [y (atom-rec "table" 10)
          x (atom-rec "table" 11)
          gov {(entity-key "table" 10) (table-gov {:db-id 1 :schema "PUBLIC" :name "orders_old"})
               (entity-key "table" 11) (table-gov {:db-id 1 :schema "PUBLIC" :name "orders_new"})}]
      (is (pos? (:selection-quality (cs/compute (normalized :Q [y] :D [x]) gov (constantly []))))))))

(deftest selection-quality-substitution-table-negative-different-schema-test
  (testing "similar table names but different schemas → not a substitute"
    (let [y (atom-rec "table" 10)
          x (atom-rec "table" 11)
          gov {(entity-key "table" 10) (table-gov {:db-id 1 :schema "PUBLIC"     :name "orders"})
               (entity-key "table" 11) (table-gov {:db-id 1 :schema "ANALYTICS"  :name "orders"})}]
      (is (zero? (:selection-quality (cs/compute (normalized :Q [y] :D [x]) gov (constantly []))))))))

(deftest selection-quality-ancestral-substitute-model-on-card-test
  (testing "verified model X in D layered on top of unverified card Y in Q → substitution via ancestry"
    (let [y (atom-rec "card"  100)
          x (atom-rec "model" 200)
          gov {(entity-key "card"  100) (card-gov {:verified? false :db-id 1 :name "raw"})
               (entity-key "model" 200) (card-gov {:verified? true  :db-id 1 :name "curated"})}
          ancestry {200 [100]}
          signals (cs/compute (normalized :Q [y] :D [x]) gov (fn [id] (get ancestry id [])))]
      (is (pos? (:selection-quality signals))
          "ancestral lineage triggers substitution even though names are dissimilar"))))

(deftest selection-quality-ancestral-substitute-deep-chain-test
  (testing "deep model lineage (X → Z → Y) still triggers — Y appears anywhere in X's ancestor chain"
    (let [y (atom-rec "card"  100)
          x (atom-rec "model" 200)
          gov {(entity-key "card"  100) (card-gov {:verified? false :db-id 1 :name "raw"})
               (entity-key "model" 200) (card-gov {:verified? true  :db-id 1 :name "curated"})}
          ancestry {200 [150 100]}]
      (is (pos? (:selection-quality
                 (cs/compute (normalized :Q [y] :D [x]) gov (fn [id] (get ancestry id [])))))))))

;;; ---------------------------------------------------------------------------
;;; Selection-quality — personal-collection component
;;; ---------------------------------------------------------------------------

(deftest selection-quality-personal-collection-fraction-test
  (testing "all CONV_Q card-type atoms in personal collections → fraction = 1.0; selection-quality dominated by it"
    (let [a (atom-rec "card" 1)
          b (atom-rec "card" 2)
          gov {(entity-key "card" 1) (card-gov {:verified? false :lives-in-personal? true  :db-id 1 :name "a"})
               (entity-key "card" 2) (card-gov {:verified? false :lives-in-personal? true  :db-id 1 :name "b"})}
          signals (cs/compute (normalized :Q [a b]) gov (constantly []))]
      ;; substitution = 0 (no D), personal-fraction = 1.0 → selection-quality = 0.5
      (is (= 0.5 (:selection-quality signals))))))

(deftest selection-quality-personal-collection-tables-excluded-test
  (testing "tables in CONV_Q do not contribute to personal-collection fraction (no collection concept)"
    (let [t (atom-rec "table" 10)
          c (atom-rec "card"  20)
          gov {(entity-key "table" 10) (table-gov {:db-id 1 :schema "PUBLIC" :name "t"})
               (entity-key "card"  20) (card-gov  {:verified? false :lives-in-personal? true
                                                   :db-id 1 :name "c"})}
          signals (cs/compute (normalized :Q [t c]) gov (constantly []))]
      ;; Only the card counts toward personal-fraction → fraction = 1.0 (1/1)
      (is (= 0.5 (:selection-quality signals))))))

;;; ---------------------------------------------------------------------------
;;; Grounding — three buckets
;;; ---------------------------------------------------------------------------

(deftest grounding-zero-on-empty-H-test
  (testing "CONV_H empty → grounding = 0"
    (is (= 0.0 (:grounding (cs/compute (normalized) {} (constantly [])))))))

(deftest grounding-saturates-with-H-count-test
  (testing "grounding magnitude is monotonically increasing in |H| under the saturation formula"
    (let [signal (fn [n]
                   (let [hs (for [i (range n)] (atom-rec "card" i))]
                     (:grounding (cs/compute (normalized :H hs) {} (constantly [])))))
          s1 (signal 1)
          s5 (signal 5)
          s20 (signal 20)]
      (is (< 0.0 s1 s5 s20))
      (is (< s20 1.0)
          "saturation never reaches 1.0 in finite |H|"))))

(deftest grounding-half-saturation-at-c-grounding-test
  (testing "at |H| = C-grounding, grounding magnitude = 0.5 (half-saturation property)"
    (let [hs (for [i (range (int constants/C-grounding))] (atom-rec "card" i))]
      (is (= 0.5 (:grounding (cs/compute (normalized :H hs) {} (constantly []))))))))

;;; ---------------------------------------------------------------------------
;;; Discovery-efficiency — three components
;;; ---------------------------------------------------------------------------

(deftest discovery-efficiency-zero-on-empty-D-test
  (testing "no discovery happened → discovery-efficiency = 0"
    (is (= 0.0 (:discovery-efficiency (cs/compute (normalized) {} (constantly [])))))))

(deftest discovery-efficiency-unused-surfacings-test
  (testing "all surfaced atoms used → unused-fraction = 0; mid signal driven only by avg-rank or rediscovery"
    ;; Two surfacings (ranks 0 and 1), both used in Q → unused-fraction = 0,
    ;; avg-rank = 0.5 / 10 = 0.05, rediscovery = 0 → signal ≈ 0.0167
    (let [a (atom-rec "card" 1 [{:set :D :iteration 0 :metadata {:rank 0}}])
          b (atom-rec "card" 2 [{:set :D :iteration 0 :metadata {:rank 1}}])
          signal (:discovery-efficiency
                  (cs/compute (normalized :D [a b] :Q [a b]) {} (constantly [])))]
      (is (< 0.0 signal 0.05)))))

(deftest discovery-efficiency-fully-unused-test
  (testing "surfaced but never used → unused-fraction = 1.0 contributes 1/3 to the signal"
    (let [a (atom-rec "card" 1 [{:set :D :iteration 0 :metadata {:rank 0}}])
          b (atom-rec "card" 2 [{:set :D :iteration 0 :metadata {:rank 1}}])
          signal (:discovery-efficiency
                  (cs/compute (normalized :D [a b]) {} (constantly [])))]
      ;; unused-fraction = 1, avg-rank = 0 (no used), rediscovery = 0 → 1/3
      (is (< 0.3 signal 0.4)))))

(deftest discovery-efficiency-fields-filtered-from-denominator-test
  (testing "field-type D atoms don't count toward unused-fraction's denominator (Phase 2 follow-up #2)"
    ;; All four D atoms are fields → after filter, |D_non_field| = 0
    ;; unused-fraction = 0, avg-rank = 0, rediscovery = 0 → signal = 0
    (let [fields (for [i (range 4)]
                   (atom-rec "field" i [{:set :D :iteration 0 :metadata {:rank i}}]))
          signal (:discovery-efficiency
                  (cs/compute (normalized :D fields) {} (constantly [])))]
      (is (zero? signal)))))

(deftest discovery-efficiency-rediscovery-component-test
  (testing "rediscovery-r contributes via saturation; r = C-rediscovery → 1/3 × 0.5 ≈ 0.167"
    (let [signal (:discovery-efficiency
                  (cs/compute (normalized :temporal {:rediscovery-r (int constants/C-rediscovery)})
                              {} (constantly [])))]
      ;; rediscovery = 0.5, others = 0 → 0.5/3
      (is (< 0.16 signal 0.17)))))

;;; ---------------------------------------------------------------------------
;;; Execution-health — floor-bounded boost
;;; ---------------------------------------------------------------------------

(defn- event
  ([function]
   {:function function :arguments {} :iteration-index 0})
  ([function err]
   {:function function :arguments {} :iteration-index 0 :error err}))

(deftest execution-health-zero-with-no-errors-test
  (testing "errors-resolved-rate = nil (no errors) → signal = 0"
    (is (zero? (:execution-health
                (cs/compute (normalized :tool-events [(event "a") (event "b")]
                                        :temporal {:errors-resolved-rate nil})
                            {} (constantly [])))))))

(deftest execution-health-floor-when-fully-resolved-test
  (testing "errored & resolved-rate = 1.0 → signal = p × α (the floor)"
    ;; 1 of 2 errored, all resolved → p = 0.5, u = 0, signal = 0.5 × 0.5 = 0.25
    (let [signal (:execution-health
                  (cs/compute (normalized :tool-events [(event "a" {:msg "x"}) (event "b")]
                                          :temporal {:errors-resolved-rate 1.0})
                              {} (constantly [])))]
      (is (= 0.25 signal)))))

(deftest execution-health-full-penalty-when-unresolved-test
  (testing "errored & resolved-rate = 0.0 → signal = p × 1 = p (full penalty)"
    ;; 1 of 2 errored, none resolved → p = 0.5, u = 1, signal = 0.5 × 1 = 0.5
    (let [signal (:execution-health
                  (cs/compute (normalized :tool-events [(event "a" {:msg "x"}) (event "b")]
                                          :temporal {:errors-resolved-rate 0.0})
                              {} (constantly [])))]
      (is (= 0.5 signal)))))

(deftest execution-health-zero-events-zero-signal-test
  (testing "no tool events at all → signal = 0 (degenerate; pre-foundation-ish)"
    (is (zero? (:execution-health (cs/compute (normalized) {} (constantly [])))))))

;;; ---------------------------------------------------------------------------
;;; Conversational-economy — three components
;;; ---------------------------------------------------------------------------

(deftest conversational-economy-zero-at-target-test
  (testing "iterations exactly at target ratio + no thrash + no excess reuse → 0"
    (let [signal (:conversational-economy
                  (cs/compute (normalized :Q [(atom-rec "card" 1)]
                                          :temporal {:iterations (int constants/target-iterations-per-artifact)})
                              {} (constantly [])))]
      (is (zero? signal)))))

(deftest conversational-economy-iterations-excess-test
  (testing "iterations 2× target → only iterations-component contributes"
    (let [iters (* 2 (int constants/target-iterations-per-artifact))
          signal (:conversational-economy
                  (cs/compute (normalized :Q [(atom-rec "card" 1)]
                                          :temporal {:iterations iters})
                              {} (constantly [])))]
      ;; excess = target, saturate(target, C-economy-iterations) = target/(target+C) ≈ 0.5
      ;; → signal ≈ 0.5 / 3 ≈ 0.167
      (is (< 0.15 signal 0.18)))))

(deftest conversational-economy-thrash-component-test
  (testing "thrash events alone drive the signal"
    (let [t (int constants/C-thrash)
          signal (:conversational-economy
                  (cs/compute (normalized :temporal {:thrash-events t}) {} (constantly [])))]
      ;; thrash = C → 0.5; iters/artifact = 0/1 → 0; reuse = 0 → 0; signal = 0.5/3
      (is (< 0.16 signal 0.17)))))

(deftest conversational-economy-max-reuse-component-test
  (testing "max per-entity reuse above baseline contributes via saturation"
    ;; entity touched 2 + C-reuse times → excess = C-reuse → saturate = 0.5 → /3 ≈ 0.167
    (let [touches (+ (int constants/target-max-entity-reuse) (int constants/C-reuse))
          provenance (for [i (range touches)]
                       {:set :Q :iteration i :metadata {}})
          a (atom-rec "card" 1 provenance)
          signal (:conversational-economy
                  (cs/compute (normalized :Q [a]) {} (constantly [])))]
      (is (< 0.15 signal 0.20)))))

;;; ---------------------------------------------------------------------------
;;; Termination — categorical
;;; ---------------------------------------------------------------------------

(deftest termination-categorical-mapping-test
  (testing "each known terminal-state projects to the expected signal"
    (doseq [[reason expected] {:model_signaled_done 0.0
                               :final_response      0.0
                               :iter_cap            1.0
                               :error               1.0
                               :aborted             1.0}]
      (is (= expected
             (:termination (cs/compute (normalized :temporal {:terminal-state reason})
                                       {} (constantly []))))
          (str "terminal-state " reason " → " expected)))))

(deftest termination-unknown-state-defensive-test
  (testing "unknown / unexpected terminal-state values fall through to 1.0 (defensive)"
    (is (= 1.0
           (:termination (cs/compute (normalized :temporal {:terminal-state :wat})
                                     {} (constantly [])))))))
