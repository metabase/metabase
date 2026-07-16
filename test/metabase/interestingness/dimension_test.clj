(ns metabase.interestingness.dimension-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.interestingness.dimension :as dim]
   [metabase.interestingness.impl :as impl]))

;;; -------------------------------------------------- cardinality --------------------------------------------------

(deftest ^:parallel cardinality-test
  (testing "constant field (1 distinct) scores 0.0"
    (is (= 0.0 (dim/cardinality {:fingerprint {:global {:distinct-count 1}}}))))
  (testing "low cardinality (10 = top of ramp to sweet spot) scores high"
    (is (>= (dim/cardinality {:fingerprint {:global {:distinct-count 10}}}) 0.8)))
  (testing "moderate cardinality (50 = past sweet spot, declining) scores moderately"
    (is (>= (dim/cardinality {:fingerprint {:global {:distinct-count 50}}}) 0.7)))
  (testing "high cardinality scores lower"
    (is (< (dim/cardinality {:fingerprint {:global {:distinct-count 5000}}}) 0.5)))
  (testing "near-unique text field (tiny top-3-fraction) is a hard-zero gate"
    (is (= 0.0 (dim/cardinality {:fingerprint {:global {:distinct-count 5000}
                                               :type   {:type/Text {:top-3-fraction 3.0E-4}}}}))))
  (testing "repeating text categorical (healthy top-3-fraction) is not gated"
    (is (> (dim/cardinality {:fingerprint {:global {:distinct-count 12}
                                           :type   {:type/Text {:top-3-fraction 0.5}}}}) 0.1)))
  (testing "missing top-3-fraction falls through to the bucket-count score (no gate on absence)"
    (is (> (dim/cardinality {:fingerprint {:global {:distinct-count 12}
                                           :type   {:type/Text {:average-length 8}}}}) 0.1)))
  (testing "high-cardinality binnable numeric hits the auto-binnable branch"
    (is (= 0.9 (dim/cardinality {:fingerprint {:global {:distinct-count 1000}
                                               :type   {:type/Number {:min 1 :max 1000}}}}))))
  (testing "keys (PK/FK) are excluded from the auto-binnable branch — the QP refuses to bin
            :Relation/* columns, so they score by raw distinct count instead"
    (doseq [sem-type [:type/FK :type/PK]]
      (is (< (dim/cardinality {:semantic-type sem-type
                               :fingerprint   {:global {:distinct-count 1000}
                                               :type   {:type/Number {:min 1 :max 1000}}}})
             0.3)
          (str sem-type " should fall through to bucket-count-score"))))
  (testing "missing fingerprint returns nil (no signal)"
    (is (nil? (dim/cardinality {})))
    (is (nil? (dim/cardinality {:fingerprint {}})))))

;;; -------------------------------------------------- type-bonus --------------------------------------------------

(deftest ^:parallel type-bonus-test
  (testing "listed bonus types score 1.0"
    (doseq [sem-type [:type/CreationTimestamp
                      :type/Country     ; via :type/Address
                      :type/ZipCode     ; via :type/Address
                      :type/Income      ; via :type/Currency
                      :type/Price       ; via :type/Currency
                      :type/Birthdate
                      :type/Title
                      :type/Quantity
                      :type/Share
                      :type/Score
                      :type/JoinDate    ; via :type/JoinTemporal
                      :type/CancelationTimestamp ; via :type/CancelationTemporal
                      :type/Company
                      :type/Subscription
                      :type/Owner]]
      (is (= 1.0 (dim/type-bonus {:semantic-type sem-type}))
          (str sem-type " should score 1.0"))))
  (testing "non-listed types score nil (no signal)"
    (doseq [sem-type [:type/Category :type/Name :type/Number :type/Text nil]]
      (is (nil? (dim/type-bonus {:semantic-type sem-type}))
          (str sem-type " should score nil"))))
  (testing "base-type alone (no semantic-type) does not earn a bonus"
    (is (nil? (dim/type-bonus {:base-type :type/DateTime})))
    (is (nil? (dim/type-bonus {:base-type :type/Boolean}))))
  (testing "no semantic type returns nil"
    (is (nil? (dim/type-bonus {})))))

;;; -------------------------------------------------- temporal-range --------------------------------------------------

(deftest ^:parallel temporal-range-test
  (testing "multi-year range scores high"
    (is (>= (dim/temporal-range
             {:fingerprint {:type {:type/DateTime {:earliest "2020-01-01" :latest "2024-01-01"}}}}) 0.9)))
  (testing "same-day range scores low"
    (is (<= (dim/temporal-range
             {:fingerprint {:type {:type/DateTime {:earliest "2024-01-01" :latest "2024-01-01"}}}}) 0.2)))
  (testing "short range (few days) scores moderate"
    (let [score (dim/temporal-range
                 {:fingerprint {:type {:type/DateTime {:earliest "2024-01-01" :latest "2024-01-10"}}}})]
      (is (> score 0.3))
      (is (< score 0.7))))
  (testing "non-temporal field returns nil (no signal)"
    (is (nil? (dim/temporal-range {}))))
  (testing "missing bounds returns nil (no signal)"
    (is (nil? (dim/temporal-range
               {:fingerprint {:type {:type/DateTime {:earliest nil :latest nil}}}})))))

;;; -------------------------------------------------- temporal-day-span --------------------------------------------------

(deftest ^:parallel temporal-day-span-test
  (testing "date-only bounds"
    (is (= 1461 (dim/temporal-day-span
                 {:fingerprint {:type {:type/DateTime {:earliest "2020-01-01" :latest "2024-01-01"}}}}))))
  (testing "ISO offset (Z) bounds"
    (is (= 10 (dim/temporal-day-span
               {:fingerprint {:type {:type/DateTime {:earliest "2020-01-01T00:00:00Z" :latest "2020-01-11T00:00:00Z"}}}}))))
  (testing "ISO offset bounds with fractional seconds"
    (is (= 1084 (dim/temporal-day-span
                 {:fingerprint {:type {:type/DateTime {:earliest "2025-04-26T19:29:55.147Z" :latest "2028-04-15T13:34:19.931Z"}}}}))))
  (testing "same-day range is 0"
    (is (= 0 (dim/temporal-day-span
              {:fingerprint {:type {:type/DateTime {:earliest "2024-01-01" :latest "2024-01-01"}}}}))))
  (testing "non-temporal field returns nil"
    (is (nil? (dim/temporal-day-span {})))
    (is (nil? (dim/temporal-day-span {:fingerprint {:global {:distinct-count 5}}}))))
  (testing "missing bounds return nil"
    (is (nil? (dim/temporal-day-span
               {:fingerprint {:type {:type/DateTime {:earliest nil :latest nil}}}})))
    (is (nil? (dim/temporal-day-span
               {:fingerprint {:type {:type/DateTime {:earliest "2024-01-01" :latest nil}}}}))))
  (testing "fast path and general coercer agree (unparseable-by-fast-path formats fall back)"
    ;; datetime without a zone offset isn't handled by the fast java.time path; the fallback coercer must still parse it
    (is (= 9 (dim/temporal-day-span
              {:fingerprint {:type {:type/DateTime {:earliest "2024-01-01T00:00:00" :latest "2024-01-10T00:00:00"}}}})))))

;;; -------------------------------------------------- precomputed day-span sharing --------------------------------------------------

(deftest ^:parallel precomputed-day-span-test
  (testing "supplying ::dim/day-span yields the same scores as computing it inline"
    (let [field {:fingerprint {:type {:type/DateTime {:earliest "2020-01-01" :latest "2024-01-01"}}}}
          span  (dim/temporal-day-span field)
          with  (assoc field ::dim/day-span span)]
      (is (= (dim/cardinality field)     (dim/cardinality with)))
      (is (= (dim/temporal-range field)  (dim/temporal-range with)))))
  (testing "precomputed nil span (temporal bounds present but unparseable) is honored, not recomputed"
    (let [field {:fingerprint {:type {:type/DateTime {:earliest "garbage" :latest "garbage"}}}}
          with  (assoc field ::dim/day-span nil)]
      (is (nil? (dim/cardinality with)))
      (is (nil? (dim/temporal-range with))))))

;;; -------------------------------------------------- text-structure --------------------------------------------------

(deftest ^:parallel text-structure-test
  (testing "high JSON percentage scores low"
    (is (<= (dim/text-structure {:fingerprint {:type {:type/Text {:percent-json 0.95}}}}) 0.15)))
  (testing "high URL percentage scores low"
    (is (<= (dim/text-structure {:fingerprint {:type {:type/Text {:percent-url 0.95}}}}) 0.2)))
  (testing "long average length (> 100 chars) is a hard-zero gate (free-form text)"
    (is (= 0.0 (dim/text-structure {:fingerprint {:type {:type/Text {:average-length 150}}}})))
    (is (= 0.0 (dim/text-structure {:fingerprint {:type {:type/Text {:average-length 200}}}}))))
  (testing "moderate length scores low (soft penalty)"
    (let [score (dim/text-structure {:fingerprint {:type {:type/Text {:average-length 60}}}})]
      (is (> score 0.1))
      (is (< score 0.3))))
  (testing "short text scores high"
    (is (>= (dim/text-structure {:fingerprint {:type {:type/Text {:average-length 10}}}}) 0.7)))
  (testing "high email percentage scores low (PII safety net for missed classifier)"
    (is (<= (dim/text-structure {:fingerprint {:type {:type/Text {:percent-email 0.95}}}}) 0.2)))
  (testing "high state percentage is flagged (suggests map viz, not breakout)"
    (is (<= (dim/text-structure {:fingerprint {:type {:type/Text {:percent-state 0.95}}}}) 0.4)))
  (testing "non-text field returns nil (no signal)"
    (is (nil? (dim/text-structure {})))))

;;; -------------------------------------------------- text-structure percent-blank --------------------------------------------------

(deftest ^:parallel text-structure-blank-test
  (testing "mostly-blank text scores very low"
    (is (<= (dim/text-structure {:fingerprint {:type {:type/Text {:percent-blank 0.9}}}}) 0.15)))
  (testing "low percent-blank doesn't trigger the penalty"
    (is (>= (dim/text-structure {:fingerprint {:type {:type/Text {:percent-blank 0.1 :average-length 10}}}}) 0.7))))

;;; -------------------------------------------------- dimension-interestingness --------------------------------------------------

(deftest ^:parallel dimension-interestingness-test
  (testing "PK with no fingerprint still scores 0.0 (hard-zero gate fires regardless of fingerprint)"
    (is (= 0.0 (dim/dimension-interestingness {:semantic-type :type/PK}))))
  (testing "PK with snake_case keys and no fingerprint scores 0.0"
    (is (= 0.0 (dim/dimension-interestingness {:semantic_type :type/PK}))))
  (testing "PK with a fingerprint also scores 0.0"
    (is (= 0.0 (dim/dimension-interestingness
                {:semantic-type :type/PK
                 :fingerprint   {:global {:distinct-count 1000 :nil% 0.0}}}))))
  (testing "numeric FK scores 0.0 regardless of how good its fingerprint looks (UXW-4757)"
    (is (= 0.0 (dim/dimension-interestingness
                {:semantic-type  :type/FK
                 :effective-type :type/Integer
                 :fingerprint    {:global {:distinct-count 1000 :nil% 0.0}
                                  :type   {:type/Number {:min 1 :max 1000}}}})))
    (is (= 0.0 (dim/dimension-interestingness
                {:semantic_type  :type/FK
                 :effective_type :type/BigInteger})))
    (testing "but a non-numeric FK stays scoreable"
      (is (pos? (dim/dimension-interestingness
                 {:semantic-type  :type/FK
                  :effective-type :type/Text
                  :fingerprint    {:global {:distinct-count 15 :nil% 0.0}}})))))
  (testing "structured-blob fields score 0.0 even with no fingerprint"
    (is (= 0.0 (dim/dimension-interestingness {:semantic-type :type/Collection})))
    (is (= 0.0 (dim/dimension-interestingness {:semantic-type :type/Structured}))))
  (testing "audit temporal subtypes score 0.0 (Updated/Deletion Date/Time, not just Timestamp)"
    (is (= 0.0 (dim/dimension-interestingness {:semantic-type :type/UpdatedTimestamp})))
    (is (= 0.0 (dim/dimension-interestingness {:semantic-type :type/UpdatedDate})))
    (is (= 0.0 (dim/dimension-interestingness {:semantic-type :type/UpdatedTime})))
    (is (= 0.0 (dim/dimension-interestingness {:semantic-type :type/DeletionTimestamp})))
    (is (= 0.0 (dim/dimension-interestingness {:semantic-type :type/DeletionDate})))
    (is (= 0.0 (dim/dimension-interestingness {:semantic-type :type/DeletionTime}))))
  (testing "non-hard-zero field with no fingerprint scores from the fingerprint-independent components only"
    (testing "plain category gets the type-penalty + type-bonus weighted average"
      (let [score (dim/dimension-interestingness {:semantic-type :type/Category})]
        (is (number? score))
        (is (pos? score))))
    (testing "field with no semantic type at all is treated as 'no penalty, no bonus'"
      (is (number? (dim/dimension-interestingness {})))
      (is (number? (dim/dimension-interestingness {:fingerprint nil}))))
    (testing "dimension-bonus semantic type scores higher than a plain field, both without fingerprint"
      (is (> (dim/dimension-interestingness {:semantic-type :type/Currency})
             (dim/dimension-interestingness {:semantic-type :type/Category})))))
  (testing "ordinary field with fingerprint returns a numeric score"
    (let [score (dim/dimension-interestingness
                 {:semantic-type :type/Category
                  :fingerprint   {:global {:distinct-count 15 :nil% 0.0}}})]
      (is (number? score))
      (is (pos? score))))
  (testing "near-unique free-text field scores 0.0 (regression: explorations research 416 'by Narrative')"
    ;; long free-form text + near-unique values + no semantic type + 0% null — used to score ~0.53
    ;; because 'structurally clean' signals outweighed cardinality/text-structure.
    (is (= 0.0 (dim/dimension-interestingness
                {:semantic-type nil
                 :fingerprint   {:global {:distinct-count 9801 :nil% 0.0}
                                 :type   {:type/Text {:average-length 732.0 :top-3-fraction 3.0E-4
                                                      :percent-blank 0.0}}}})))))

;;; -------------------------------------------------- score-only fast path --------------------------------------------------

(def ^:private representative-fields
  "A spread of fields hitting every scorer branch: hard-zero gate, no-fingerprint,
   temporal, numeric, text, and all-nil-signal."
  [{:semantic-type :type/PK}
   {:semantic-type :type/Category}
   {}
   {:fingerprint nil}
   {:semantic-type :type/Category :fingerprint {:global {:distinct-count 15 :nil% 0.0}}}
   {:fingerprint {:global {:distinct-count 1000 :nil% 0.12}
                  :type   {:type/DateTime {:earliest "2020-01-01" :latest "2024-06-15"}}}}
   {:fingerprint {:global {:distinct-count 80 :nil% 0.03}
                  :type   {:type/Number {:sd 2.0 :avg 5.0 :min 0 :max 10 :q1 2.0 :q3 8.0
                                         :skewness 0.3 :excess-kurtosis 1.2 :zero-fraction 0.1
                                         :mode-fraction 0.2 :top-3-fraction 0.4}}}}
   {:fingerprint {:global {:distinct-count 12 :nil% 0.0}
                  :type   {:type/Text {:average-length 8 :top-3-fraction 0.5 :percent-blank 0.0
                                       :mode-fraction 0.3}}}}])

(defn- reference-score
  "Independent weighted-average reference (shares no code with [[impl/score-only]]):
   nil-scoring scorers drop out of numerator and denominator; any zero-weighted-in
   hard-zero forces 0.0; all-nil falls back to 0.5."
  [field]
  (let [norm   (assoc (impl/normalize-field field)
                      ::dim/day-span (dim/temporal-day-span (impl/normalize-field field)))
        scored (for [[scorer w] dim/canonical-dimension-weights] [(scorer norm) w])
        live   (filter (comp number? first) scored)
        total  (reduce + 0.0 (map second live))]
    (cond
      (some (fn [[s w]] (and (pos? w) (zero? s))) live) 0.0
      (pos? total) (/ (reduce + 0.0 (map (fn [[s w]] (* s w)) live)) total)
      :else        0.5)))

(deftest ^:parallel dimension-interestingness-equivalence-test
  (testing "dimension-interestingness matches an independent weighted-average reference"
    (doseq [f representative-fields]
      (is (= (reference-score f) (dim/dimension-interestingness f))
          (pr-str f)))))
