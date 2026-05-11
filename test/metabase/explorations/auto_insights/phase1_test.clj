(ns metabase.explorations.auto-insights.phase1-test
  "Unit tests for the phase-1 (curation) extractor and validator.

  Pure — no DB, no LLM."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.explorations.auto-insights.phase1 :as phase1]))

;;; ---------------------------------------------- extract-curation ----------------------------------------------

(deftest extract-curation-tolerates-key-shapes-test
  (testing "Keyword keys"
    (is (= {:top_tier [1 2] :awareness_tier [3] :rationale "reason"}
           (#'phase1/extract-curation {:top_tier [1 2] :awareness_tier [3] :rationale "reason"}))))
  (testing "String keys (Anthropic returns these post-JSON-decode in some paths)"
    (is (= {:top_tier [1 2] :awareness_tier [3] :rationale "reason"}
           (#'phase1/extract-curation {"top_tier" [1 2] "awareness_tier" [3] "rationale" "reason"})))))

(deftest extract-curation-handles-missing-fields-test
  (testing "Missing fields surface as nil (validator catches them downstream)"
    (is (= {:top_tier nil :awareness_tier nil :rationale nil}
           (#'phase1/extract-curation {}))))
  (testing "Non-map input returns nil"
    (is (nil? (#'phase1/extract-curation "not a map")))
    (is (nil? (#'phase1/extract-curation nil)))))

(deftest extract-curation-coerces-to-vectors-test
  (testing "Lists/sets coerce to vectors so downstream code can rely on indexing"
    (is (= [1 2 3] (:top_tier (#'phase1/extract-curation
                               {:top_tier '(1 2 3) :awareness_tier [] :rationale "r"}))))))

;;; ---------------------------------------------- validate-curation ----------------------------------------------

(def ^:private pool (vec (range 1 31)))   ; pool of 30 ids 1..30

(defn- valid
  "Build a minimal valid curation map: one chart in top, no awareness, brief rationale."
  []
  {:top_tier [1] :awareness_tier [] :rationale "reasons go here"})

(deftest validate-curation-happy-path-test
  (testing "A minimal valid curation passes"
    (is (= [] (#'phase1/validate-curation pool (valid))))))

(deftest validate-curation-shape-errors-test
  (testing "Non-map input is rejected with a single shape-level error"
    (is (= 1 (count (#'phase1/validate-curation pool "not a map"))))
    (is (= 1 (count (#'phase1/validate-curation pool nil)))))
  (testing "Non-sequential tier values are flagged"
    (let [errs (#'phase1/validate-curation pool (assoc (valid) :top_tier "nope"))]
      (is (some #(str/includes? % "top_tier must be an array") errs))))
  (testing "Blank rationale is rejected"
    (is (some #(str/includes? % "rationale must be a non-empty string")
              (#'phase1/validate-curation pool (assoc (valid) :rationale "   "))))
    (is (some #(str/includes? % "rationale must be a non-empty string")
              (#'phase1/validate-curation pool (assoc (valid) :rationale ""))))))

(deftest validate-curation-id-errors-test
  (testing "Non-integer ids are caught"
    (let [errs (#'phase1/validate-curation pool (assoc (valid) :top_tier [1 "two"]))]
      (is (some #(str/includes? % "every chart id must be an integer") errs))))
  (testing "Ids outside the pool are caught"
    (let [errs (#'phase1/validate-curation pool (assoc (valid) :top_tier [1 999]))]
      (is (some #(str/includes? % "not in the supplied chart pool") errs))
      (is (some #(str/includes? % "999") errs))))
  (testing "An id appearing in both tiers is caught"
    (let [errs (#'phase1/validate-curation pool {:top_tier       [1 2]
                                                 :awareness_tier [2 3]
                                                 :rationale      "r"})]
      (is (some #(str/includes? % "appears in both top_tier and awareness_tier") errs)))))

(deftest validate-curation-size-bounds-test
  (testing "Empty top_tier is rejected (min 1)"
    (is (some #(str/includes? % "top_tier has 0 entries; need at least 1")
              (#'phase1/validate-curation pool (assoc (valid) :top_tier [])))))
  (testing "Top tier over its max is rejected"
    (let [too-many (vec (range 1 32))         ; 31 entries, max is 30
          errs (#'phase1/validate-curation too-many
                                           {:top_tier too-many :awareness_tier [] :rationale "r"})]
      (is (some #(re-find #"top_tier has 31 entries; max allowed is 30" %) errs))))
  (testing "Awareness over its max is rejected"
    ;; Build a 60-id pool so awareness can carry 51 without tripping not-in-pool errors.
    (let [pool60 (vec (range 1 61))
          aware  (vec (range 2 53))            ; 51 entries
          errs   (#'phase1/validate-curation pool60
                                             {:top_tier [1] :awareness_tier aware :rationale "r"})]
      (is (some #(re-find #"awareness_tier has 51 entries; max allowed is 50" %) errs))))
  (testing "Combined over the combined-max is rejected"
    (let [pool70 (vec (range 1 71))
          top    (vec (range 1 21))            ; 20
          aware  (vec (range 21 62))           ; 41
          errs   (#'phase1/validate-curation pool70
                                             {:top_tier top :awareness_tier aware :rationale "r"})]
      ;; 20 + 41 = 61 > combined-max 60
      (is (some #(re-find #"combined max is 60" %) errs)))))

(deftest validate-curation-accumulates-errors-test
  (testing "Multiple problems are reported in one pass, not short-circuited"
    (let [errs (#'phase1/validate-curation pool
                                           {:top_tier       []           ; under min
                                            :awareness_tier [999]        ; outside pool
                                            :rationale      ""})]        ; blank
      (is (>= (count errs) 3)
          (str "Expected at least 3 errors, got: " (vec errs))))))
