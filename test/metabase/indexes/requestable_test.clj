(ns metabase.indexes.requestable-test
  "Checks that the form descriptors `driver/supported-index-methods` returns stay in sync with `::index-structured`, the
  schema `POST /api/indexes/request` validates request bodies against."
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.postgres]
   [metabase.indexes.schema :as schema]
   [metabase.util.malli.registry :as mr]))

(comment metabase.driver.postgres/keep-me)

(defn- sample-value
  "A representative value for a descriptor field, the way the FE would fill the form."
  [{:keys [type options]}]
  (case type
    :string  "idx_sample"
    :boolean true
    :integer 1
    :columns [{:name "a"} {:name "b"}]
    :select  (-> options first :value)))

(defn- body-from-fields
  "Assemble a structured index body from ONLY the kind + its descriptor fields, then re-keywordize enum values the way
  the POST path does."
  [kind fields]
  (-> (into {:kind kind} (map (fn [{nm :name :as f}] [(keyword nm) (sample-value f)])) fields)
      schema/keywordize-structured))

(deftest return-conforms-to-schema-test
  (testing "the supported-index-methods return validates against ::driver/supported-index-methods"
    (is (mr/validate ::driver/supported-index-methods (driver/supported-index-methods :postgres nil)))
    (testing "including the empty default for a driver with no index support"
      (is (mr/validate ::driver/supported-index-methods (driver/supported-index-methods :h2 nil))))))

(deftest postgres-descriptors-match-schema-test
  (testing "a body built from each advertised kind's descriptors validates against ::index-structured"
    (doseq [[kind {:keys [fields]}] (driver/supported-index-methods :postgres nil)]
      (let [body (body-from-fields kind fields)]
        (is (mr/validate ::schema/index-structured body)
            (str "descriptor body for " kind " should validate: " (pr-str body)))))))

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
