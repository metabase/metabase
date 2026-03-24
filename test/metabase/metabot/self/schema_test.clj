(ns metabase.metabot.self.schema-test
  (:require
   [clojure.test :refer :all]
   [malli.core :as mc]
   [metabase.metabot.self.features :as features]
   [metabase.metabot.self.schema :as schema]))

(set! *warn-on-reflection* true)

;;; ──────────────────────────────────────────────────────────────────
;;; filter-schema-by-features tests
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:synchronized filter-schema-by-features-available-feature-test
  (testing "entry with available feature is kept, :feature prop stripped"
    (with-redefs [features/feature-available? (constantly true)]
      (let [input    [:map [:field {:feature :some-feature} :string]]
            result   (schema/filter-schema-by-features input)
            children (mc/children result)]
        (is (= 1 (count children)))
        (is (= :field (first (first children))))
        (is (not (contains? (second (first children)) :feature)))))))

(deftest ^:synchronized filter-schema-by-features-unavailable-feature-test
  (testing "entry with unavailable feature is removed"
    (with-redefs [features/feature-available? (constantly false)]
      (let [input    [:map [:field {:feature :some-feature} :string]]
            result   (schema/filter-schema-by-features input)
            children (mc/children result)]
        (is (= 0 (count children)))))))

(deftest ^:synchronized filter-schema-by-features-no-feature-annotation-test
  (testing "entry without :feature annotation passes through unchanged"
    (with-redefs [features/feature-available? (fn [_] (throw (ex-info "should not be called" {})))]
      (let [input    [:map [:field :string]]
            result   (schema/filter-schema-by-features input)
            children (mc/children result)]
        (is (= 1 (count children)))
        (is (= :field (first (first children))))
        (is (= :string (mc/type (last (first children)))))))))

(deftest ^:synchronized filter-schema-by-features-mixed-entries-test
  (testing "map with mixed entries: only unavailable feature-gated entries removed"
    (with-redefs [features/feature-available? #(= :available-feature %)]
      (let [input    [:map
                      [:always-present :string]
                      [:gated-available {:feature :available-feature} :int]
                      [:gated-unavailable {:feature :unavailable-feature} :boolean]]
            result   (schema/filter-schema-by-features input)
            children (mc/children result)
            keys     (set (map first children))]
        (is (= 2 (count children)))
        (is (contains? keys :always-present))
        (is (contains? keys :gated-available))
        (is (not (contains? keys :gated-unavailable)))))))

(deftest ^:synchronized filter-schema-by-features-nested-maps-test
  (testing "nested map schemas are also filtered"
    (with-redefs [features/feature-available? (constantly false)]
      (let [input    [:map
                      [:outer :string]
                      [:nested [:map
                                [:inner-ungated :string]
                                [:inner-gated {:feature :some-feature} :int]]]]
            result   (schema/filter-schema-by-features input)
            outer-children (mc/children result)
            nested-entry   (second outer-children)
            nested-schema  (nth nested-entry 2)
            inner-children (mc/children nested-schema)]
        (is (= 2 (count outer-children)))
        (is (= 1 (count inner-children)))
        (is (= :inner-ungated (first (first inner-children))))))))

(deftest ^:synchronized filter-schema-by-features-non-map-schema-test
  (testing "non-map schemas pass through unchanged"
    (with-redefs [features/feature-available? (constantly false)]
      (let [sequential-schema [:sequential :string]
            string-schema     :string
            enum-schema       [:enum "a" "b"]]
        (is (= :sequential (mc/type (schema/filter-schema-by-features sequential-schema))))
        (is (= :string (mc/type (schema/filter-schema-by-features string-schema))))
        (is (= :enum (mc/type (schema/filter-schema-by-features enum-schema))))))))

(deftest ^:synchronized filter-schema-by-features-optional-and-feature-test
  (testing "entry with both :optional and :feature removes both props when feature is available"
    (with-redefs [features/feature-available? (constantly true)]
      (let [input    [:map [:field {:optional true :feature :some-feature} :string]]
            result   (schema/filter-schema-by-features input)
            children (mc/children result)
            entry    (first children)
            props    (second entry)]
        (is (= 1 (count children)))
        ;; :optional is removed to make the field required when the feature is available
        ;; This allows the original schema to mark feature-gated fields as optional (so mu/defn
        ;; validation passes when the field is absent), while the filtered schema enforces
        ;; the field as required when the feature is available.
        (is (not (contains? props :optional)))
        (is (not (contains? props :feature)))))))

(deftest ^:synchronized filter-schema-by-features-all-entries-filtered-test
  (testing "all feature-gated entries unavailable results in empty map"
    (with-redefs [features/feature-available? (constantly false)]
      (let [input    [:map {:closed true}
                      [:field1 {:feature :f1} :string]
                      [:field2 {:feature :f2} :int]]
            result   (schema/filter-schema-by-features input)
            children (mc/children result)
            props    (mc/properties result)]
        (is (= 0 (count children)))
        (is (= {:closed true} props))))))

(deftest ^:synchronized filter-schema-by-features-preserves-map-properties-test
  (testing "map-level properties like :closed are preserved"
    (with-redefs [features/feature-available? (constantly true)]
      (let [input  [:map {:closed true} [:field :string]]
            result (schema/filter-schema-by-features input)
            props  (mc/properties result)]
        (is (= {:closed true} props))))))

(deftest ^:synchronized filter-schema-by-features-complex-nested-structure-test
  (testing "complex nesting with sequential containing map"
    (with-redefs [features/feature-available? #(= :enabled %)]
      (let [input    [:map
                      [:items [:sequential
                               [:map
                                [:name :string]
                                [:secret {:feature :disabled} :string]
                                [:visible {:feature :enabled} :int]]]]]
            result   (schema/filter-schema-by-features input)
            items-entry    (first (mc/children result))
            sequential-schema (nth items-entry 2)
            inner-map      (first (mc/children sequential-schema))
            inner-children (mc/children inner-map)
            inner-keys     (set (map first inner-children))]
        (is (= 2 (count inner-children)))
        (is (contains? inner-keys :name))
        (is (contains? inner-keys :visible))
        (is (not (contains? inner-keys :secret)))))))

(deftest ^:synchronized filter-schema-feature-gated-field-validation-test
  (testing "feature-gated optional field becomes required when feature is available"
    ;; This tests the key use case: schemas can define feature-gated fields as optional
    ;; (so mu/defn validation passes when the field is absent), while the filtered schema
    ;; makes the field required when the feature is available.
    (let [schema [:map {:closed true}
                  [:always_required :string]
                  [:feature_gated {:optional true :feature :semantic-search} [:sequential :string]]]]
      (testing "when feature is available, field is required in filtered schema"
        (with-redefs [features/feature-available? (constantly true)]
          (let [filtered (schema/filter-schema-by-features schema)]
            ;; field should be present and required (no :optional)
            (is (mc/validate filtered {:always_required "x" :feature_gated ["y"]}))
            (is (not (mc/validate filtered {:always_required "x"})))))) ; missing required field
      (testing "when feature is unavailable, field is removed from filtered schema"
        (with-redefs [features/feature-available? (constantly false)]
          (let [filtered (schema/filter-schema-by-features schema)]
            ;; field should not be in schema at all
            (is (mc/validate filtered {:always_required "x"}))
            ;; extra keys fail on closed map
            (is (not (mc/validate filtered {:always_required "x" :feature_gated ["y"]})))))))))
