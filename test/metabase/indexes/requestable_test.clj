(ns metabase.indexes.requestable-test
  "Checks that the form descriptors `driver/supported-index-methods` returns stay in sync with `::index-structured`, the
  schema `POST /api/index/request` validates request bodies against."
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.postgres]
   [metabase.indexes.schema :as schema]
   [metabase.util.malli.registry :as mr]))

(comment metabase.driver.postgres/keep-me)

(defn- sample-value
  "A representative value for a non-select descriptor field, the way the FE would fill the form. One column suits every
  kind: kinds that take many allow a single one, and a `:distkey` allows only one."
  [{:keys [type]}]
  (case type
    :string  "idx_sample"
    :boolean true
    :integer 1
    :columns [{:name "a"}]))

(defn advertised-bodies
  "Every request body the form can build for `kind` from its descriptor `fields`: the cartesian product over each
  field's candidate values (a `:select` contributes one body per option, so every advertised option is covered),
  re-keywordized the way the POST path does."
  [kind fields]
  (let [field-values (fn [{:keys [type options] :as f}]
                       (if (= type :select) (map :value options) [(sample-value f)]))
        combos       (reduce (fn [acc vs] (for [row acc, v vs] (conj row v)))
                             [[]] (map field-values fields))]
    (for [combo combos]
      (schema/keywordize-structured
       (into {:kind kind} (map vector (map (comp keyword :name) fields) combo))))))

(deftest return-conforms-to-schema-test
  (testing "the supported-index-methods return validates against ::driver/supported-index-methods"
    (is (mr/validate ::driver/supported-index-methods (driver/supported-index-methods :postgres nil)))
    (testing "including the empty default for a driver with no index support"
      (is (mr/validate ::driver/supported-index-methods (driver/supported-index-methods :h2 nil))))))

(deftest postgres-descriptors-match-schema-test
  (testing "every value Postgres advertises in supported-index-methods builds a body that validates against ::index-structured"
    (doseq [[kind {:keys [fields]}] (driver/supported-index-methods :postgres nil)
            body                    (advertised-bodies kind fields)]
      (is (mr/validate ::schema/index-structured body)
          (str "descriptor body for " kind " should validate: " (pr-str body))))))

(deftest postgres-lifecycle-matches-feature-flag-test
  (testing ":standalone <=> :index/standalone-create, :inline <=> :index/inline-create"
    (doseq [[kind {:keys [lifecycle]}] (driver/supported-index-methods :postgres nil)]
      (is (true? (case lifecycle
                   :standalone (driver/database-supports? :postgres :index/standalone-create nil)
                   :inline     (driver/database-supports? :postgres :index/inline-create nil)))
          (str kind " lifecycle " lifecycle " should match its feature flag")))))

(deftest schema-accepts-inline-kinds-test
  (testing "::index-structured accepts the body shape the FE builds for the inline/ClickHouse kinds"
    (are [body] (mr/validate ::schema/index-structured (schema/keywordize-structured body))
      {:kind :order-by   :columns [{:name "a"}]}
      {:kind :sortkey    :style "compound"    :columns [{:name "a"}]}
      {:kind :sortkey    :style "interleaved" :columns [{:name "a"}]}
      {:kind :skip-index :name "s" :columns [{:name "a"}] :type "minmax"}
      {:kind :skip-index :name "s" :columns [{:name "a"}] :type "bloom_filter" :granularity 4}
      {:kind :distkey    :style "key" :columns [{:name "a"}]}
      {:kind :distkey    :style "all"}
      {:kind :distkey    :style "even"}
      {:kind :distkey    :style "auto"})))

(deftest distkey-key-requires-a-column-test
  (testing "a :key distkey without a column is rejected; the column-less styles are fine"
    (is (not (mr/validate ::schema/index-structured (schema/keywordize-structured {:kind :distkey :style "key"}))))
    (is (mr/validate ::schema/index-structured (schema/keywordize-structured {:kind :distkey :style "all"})))))
