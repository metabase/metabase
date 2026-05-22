(ns metabase.metabot.quality.subscores-test
  "Phase 6 unit tests — pure. Each test hand-builds a minimal normalized
  struct + concern-signals map and feeds them through
  [[metabase.metabot.quality.subscores/compose]].

  No DB hits — concern-signals is a literal map, normalized is the
  smallest shape compose reads from (sets cardinalities + tool-events
  for N/A predicates + temporal for terminal-state). The full pipeline
  composition is exercised end-to-end in `quality.core-test`."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.quality.subscores :as subscores]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------
;;; Builders
;;; ---------------------------------------------------------------------------

(defn- atom-rec
  ([type id]
   {:type type :id id :id-str (str id) :provenance []}))

(defn- set-of
  [atoms]
  (into {} (map (fn [a] [[(:type a) (:id-str a)] a])) atoms))

(defn- normalized
  "Compose a minimal normalized struct. Empty defaults for everything
  not passed."
  [& {:keys [Q D tool-events]
      :or   {Q [] D [] tool-events []}}]
  {:sets        {:P {} :D (set-of D) :Q (set-of Q) :I {} :H {}}
   :tool-events tool-events
   :temporal    {:terminal-state :final_response}})

(defn- signals
  "Compact builder for the concern-signals map; defaults every component
  to 0.0 so each test only sets the ones it cares about."
  [& {:keys [selection-quality grounding discovery-efficiency
             execution-health conversational-economy termination]
      :or   {selection-quality      0.0
             grounding              0.0
             discovery-efficiency   0.0
             execution-health       0.0
             conversational-economy 0.0
             termination            0.0}}]
  {:selection-quality      selection-quality
   :grounding              grounding
   :discovery-efficiency   discovery-efficiency
   :execution-health       execution-health
   :conversational-economy conversational-economy
   :termination            termination})

;;; ---------------------------------------------------------------------------
;;; Healthy + worst-case end-to-end
;;; ---------------------------------------------------------------------------

(deftest compose-healthy-fixture-all-subscores-1-test
  (testing "every signal at zero → every applicable subscore = 1.0 → composite = 1.0"
    (let [out (subscores/compose
               (normalized :Q [(atom-rec "card" 1)]
                           :D [(atom-rec "card" 2)]
                           :tool-events [{:tool-type :authoring}])
               (signals))]
      (is (= 1.0 (:A out)))
      (is (= 1.0 (:B out)))
      (is (= 1.0 (:C out)))
      (is (= 1.0 (:D out)))
      (is (= 1.0 (:composite out)))
      (is (= #{} (:na out))))))

(deftest compose-saturated-signals-craters-composite-test
  (testing "every signal at 1.0 → every subscore at 0 → composite at 0"
    (let [out (subscores/compose
               (normalized :Q [(atom-rec "card" 1)]
                           :D [(atom-rec "card" 2)]
                           :tool-events [{:tool-type :authoring}])
               (signals :selection-quality 1.0 :grounding 1.0
                        :discovery-efficiency 1.0 :execution-health 1.0
                        :conversational-economy 1.0 :termination 1.0))]
      (is (= 0.0 (:A out)))
      (is (= 0.0 (:B out)))
      (is (= 0.0 (:C out)))
      (is (= 0.0 (:D out)))
      (is (= 0.0 (:composite out))))))

;;; ---------------------------------------------------------------------------
;;; Subscore A — N/A semantics + composition
;;; ---------------------------------------------------------------------------

(deftest subscore-A-na-when-no-authoring-and-empty-Q-test
  (testing "no CONV_Q members AND no :authoring event → Subscore A is N/A"
    (let [out (subscores/compose
               (normalized :D [(atom-rec "card" 1)]
                           :tool-events [{:tool-type :discovery}])
               (signals))]
      (is (nil? (:A out)))
      (is (contains? (:na out) :A))
      (is (= ["A"] (mapv name (sort (:na out))))))))

(deftest subscore-A-applies-when-Q-populated-test
  (testing "any CONV_Q member → Subscore A applies even without explicit authoring event"
    (let [out (subscores/compose
               (normalized :Q [(atom-rec "card" 1)] :tool-events [])
               (signals))]
      (is (= 1.0 (:A out)))
      (is (not (contains? (:na out) :A))))))

(deftest subscore-A-applies-when-authoring-event-but-empty-Q-test
  (testing "an :authoring event fired but populated no CONV_Q (bad args / failed authoring)
            → Subscore A applies — user wanted an artifact and the signals should reflect the failure"
    (let [out (subscores/compose
               (normalized :Q [] :tool-events [{:tool-type :authoring}])
               (signals))]
      (is (= 1.0 (:A out)))
      (is (not (contains? (:na out) :A))))))

(deftest subscore-A-arithmetic-mean-of-healths-test
  (testing "Subscore A = mean(1 - selection-quality, 1 - grounding)"
    ;; selection-quality = 0.2, grounding = 0.4 → healths 0.8, 0.6 → mean 0.7
    (let [out (subscores/compose
               (normalized :Q [(atom-rec "card" 1)] :tool-events [{:tool-type :authoring}])
               (signals :selection-quality 0.2 :grounding 0.4))]
      (is (= 0.7 (:A out))))))

;;; ---------------------------------------------------------------------------
;;; Subscore B — N/A semantics
;;; ---------------------------------------------------------------------------

(deftest subscore-B-na-when-empty-D-test
  (testing "CONV_D empty → Subscore B is N/A"
    (let [out (subscores/compose (normalized) (signals))]
      (is (nil? (:B out)))
      (is (contains? (:na out) :B)))))

(deftest subscore-B-na-when-D-has-only-fields-test
  (testing "CONV_D contains only field-type atoms → Subscore B is N/A
            (field-only enumeration is not real discovery; mirrors Discovery-efficiency's filter)"
    (let [d (for [i (range 5)] (atom-rec "field" i))
          out (subscores/compose (normalized :D d) (signals))]
      (is (nil? (:B out)))
      (is (contains? (:na out) :B)))))

(deftest subscore-B-applies-with-non-field-D-test
  (testing "any non-field atom in CONV_D → Subscore B applies"
    (let [out (subscores/compose
               (normalized :D [(atom-rec "field" 1) (atom-rec "card" 2)])
               (signals))]
      (is (= 1.0 (:B out)))
      (is (not (contains? (:na out) :B))))))

(deftest subscore-B-composition-test
  (testing "Subscore B = 1 - discovery-efficiency (one-signal subscore)"
    (let [out (subscores/compose
               (normalized :D [(atom-rec "card" 1)])
               (signals :discovery-efficiency 0.3))]
      (is (= 0.7 (:B out))))))

;;; ---------------------------------------------------------------------------
;;; Subscores C and D — always applicable
;;; ---------------------------------------------------------------------------

(deftest subscore-C-always-applicable-test
  (testing "Subscore C reads execution-health and is never N/A"
    (let [out (subscores/compose (normalized) (signals :execution-health 0.25))]
      (is (= 0.75 (:C out)))
      (is (not (contains? (:na out) :C))))))

(deftest subscore-D-arithmetic-mean-of-econ-and-termination-test
  (testing "Subscore D = mean(1 - conversational-economy, 1 - termination)"
    ;; econ = 0.2, termination = 1.0 → healths 0.8, 0.0 → mean 0.4
    (let [out (subscores/compose
               (normalized)
               (signals :conversational-economy 0.2 :termination 1.0))]
      (is (= 0.4 (:D out))))))

;;; ---------------------------------------------------------------------------
;;; Composite — geometric mean over non-N/A
;;; ---------------------------------------------------------------------------

(deftest composite-geometric-mean-over-applicable-subscores-test
  (testing "composite = (∏ Sᵢ)^(1/n) over the n non-N/A subscores"
    ;; A = 0.5, B = 0.5, C = 1.0, D = 1.0 → product = 0.25; n = 4; root = 0.25^0.25 ≈ 0.707
    (let [out (subscores/compose
               (normalized :Q [(atom-rec "card" 1)]
                           :D [(atom-rec "card" 2)]
                           :tool-events [{:tool-type :authoring}])
               (signals :selection-quality 0.5 :grounding 0.5
                        :discovery-efficiency 0.5))]
      (is (= 0.5 (:A out)))
      (is (= 0.5 (:B out)))
      (is (= 1.0 (:C out)))
      (is (= 1.0 (:D out)))
      (is (< 0.707 (:composite out) 0.708)))))

(deftest composite-only-uses-applicable-subscores-test
  (testing "with A and B both N/A, composite is geometric mean over just C and D"
    ;; No Q, no authoring event → A N/A. No D → B N/A. C = 0.8, D = 0.6 → composite = sqrt(0.48) ≈ 0.6928
    (let [out (subscores/compose
               (normalized)
               (signals :execution-health 0.2 :conversational-economy 0.4
                        :termination 0.4))]
      (is (nil? (:A out)))
      (is (nil? (:B out)))
      (is (= 0.8 (:C out)))
      (is (= 0.6 (:D out)))
      (is (< 0.692 (:composite out) 0.693)))))

(deftest composite-weakest-link-domination-test
  (testing "one bad subscore craters the composite — geometric mean punishes
            outliers more harshly than arithmetic mean would"
    ;; A = 0.99, B = 0.99, C = 0.99, D = 0.01
    ;; arithmetic mean ≈ 0.745; geometric ≈ (0.99^3 × 0.01)^0.25 ≈ 0.314
    (let [out (subscores/compose
               (normalized :Q [(atom-rec "card" 1)]
                           :D [(atom-rec "card" 2)]
                           :tool-events [{:tool-type :authoring}])
               (signals :selection-quality 0.01 :grounding 0.01
                        :discovery-efficiency 0.01 :execution-health 0.01
                        :conversational-economy 0.99 :termination 0.99))]
      (is (< 0.313 (:composite out) 0.315)
          "geometric mean punishes the single weak subscore far harder than arithmetic mean would"))))

(deftest composite-zero-subscore-zeros-composite-test
  (testing "any subscore at 0.0 → composite = 0.0 (geometric-mean property)"
    (let [out (subscores/compose
               (normalized :Q [(atom-rec "card" 1)]
                           :D [(atom-rec "card" 2)]
                           :tool-events [{:tool-type :authoring}])
               (signals :selection-quality 1.0 :grounding 1.0))]
      ;; A = 0, B/C/D = 1.0 → composite = 0
      (is (= 0.0 (:A out)))
      (is (= 0.0 (:composite out))))))

(deftest composite-c-d-only-fallback-test
  (testing "degenerate conversation (A and B both N/A) — composite still computed
            from C and D, which are always applicable"
    ;; This is the natural shape for a conversation that started but produced nothing
    ;; observable. C = 1.0 (no errors), D = 1.0 (clean termination) → composite = 1.0
    (let [out (subscores/compose (normalized) (signals))]
      (is (= #{:A :B} (:na out)))
      (is (= 1.0 (:composite out))))))

;;; ---------------------------------------------------------------------------
;;; na-set ordering
;;; ---------------------------------------------------------------------------

(deftest na-set-sorts-deterministically-when-flattened-test
  (testing "(sort (:na out)) gives a stable ordering for the breakdown's subscore_na slot"
    (let [out (subscores/compose (normalized) (signals))]
      (is (= [:A :B] (sort (:na out)))
          "subscore_na in the JSON breakdown is built from this sorted seq"))))
