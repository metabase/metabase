(ns dev.dbt-import.emit-test
  (:require
   [clj-yaml.core :as yaml]
   [clojure.java.io :as io]
   [clojure.test :refer [deftest is testing]]
   [dev.dbt-import.emit :as emit]
   [dev.dbt-import.parse :as parse]
   [dev.dbt-import.resolve :as resolve]
   [metabase.queries.models.card :as card])
  (:import
   (java.nio.file Files)
   (java.nio.file.attribute FileAttribute)))

(set! *warn-on-reflection* true)

(def ^:private config
  {:databases     {"dbt_bi" "Sales DB"}
   :driver        :postgres
   :creator-email "admin@example.com"})

(defn- flexanalytics-resolved []
  (->> (.getPath ^java.net.URL (io/resource "dbt_import/flexanalytics_manifest.json"))
       parse/parse-manifest-file
       (resolve/resolve-manifest config)))

(def ^:private field
  {:ref ["Sales DB" "public" "fact_sales" "sales"], :base-type :type/Float})

(defn- resolved-metric
  "A hand-built resolved metric with aggregation `agg`; `overrides` land on the IR metric."
  [agg field & {:as overrides}]
  {:metric       (merge {:name                   "m"
                         :unique-id              "metric.p.m"
                         :label                  "M"
                         :description            nil
                         :semantic-model         "fact_sales"
                         :measure                "m"
                         :agg                    agg
                         :expr                   (if field "sales" "1")
                         :agg-params             nil
                         :non-additive-dimension nil
                         :agg-time-dimension     nil
                         :filters                []
                         :fill-nulls-with        nil
                         :join-to-timespine      false
                         :meta                   nil}
                        overrides)
   :entity-id    "AAAAAAAAAAAAAAAAAAAAA"
   :database     "Sales DB"
   :source-table ["Sales DB" "public" "fact_sales"]
   :field        field})

(deftest ^:parallel aggregation-clause-test
  (let [f [:field {:base-type :type/Float} ["Sales DB" "public" "fact_sales" "sales"]]]
    (is (= [:sum {} f] (emit/aggregation-clause (resolved-metric :sum field))))
    (is (= [:avg {} f] (emit/aggregation-clause (resolved-metric :average field))))
    (is (= [:min {} f] (emit/aggregation-clause (resolved-metric :min field))))
    (is (= [:max {} f] (emit/aggregation-clause (resolved-metric :max field))))
    (is (= [:median {} f] (emit/aggregation-clause (resolved-metric :median field))))
    (is (= [:distinct {} f] (emit/aggregation-clause (resolved-metric :count_distinct field))))
    (testing "counts"
      (is (= [:count {}] (emit/aggregation-clause (resolved-metric :count nil))))
      (is (= [:count {}] (emit/aggregation-clause (resolved-metric :sum nil)))
          "sum of the literal 1 is a row count")
      (is (= [:count-where {} [:not-null {} f]] (emit/aggregation-clause (resolved-metric :count field)))
          "COUNT(col) skips nulls"))
    (is (= [:count-where {} [:= {} [:field {:base-type :type/Boolean} ["Sales DB" "public" "fact_sales" "sales"]] true]]
           (emit/aggregation-clause (resolved-metric :sum_boolean (assoc field :base-type :type/Boolean)))))
    (testing "percentile accepts a fraction or a percentage"
      (is (= [:percentile {} f 0.95]
             (emit/aggregation-clause (resolved-metric :percentile field :agg-params {:percentile 0.95}))
             (emit/aggregation-clause (resolved-metric :percentile field :agg-params {:percentile 95})))))
    (testing "fill_nulls_with wraps the aggregation in coalesce"
      (is (= [:coalesce {} [:sum {} f] 0]
             (emit/aggregation-clause (resolved-metric :sum field :fill-nulls-with 0)))))))

(deftest ^:parallel files-test
  (let [files (emit/files config (flexanalytics-resolved))]
    (is (= ["collections/main/dbt_metrics.yaml"
            "collections/main/dbt_metrics/customer_count.yaml"
            "collections/main/dbt_metrics/order_count.yaml"
            "collections/main/dbt_metrics/price.yaml"
            "collections/main/dbt_metrics/product_count.yaml"
            "collections/main/dbt_metrics/quantity.yaml"
            "collections/main/dbt_metrics/rowcount.yaml"
            "collections/main/dbt_metrics/sales.yaml"
            "collections/main/dbt_metrics/target.yaml"]
           (map :path files)))
    (is (= [{:model "Collection"}]
           (map #(select-keys % [:model]) (-> files first :entity :serdes/meta))))
    (is (every? #(= "Card" (-> % :entity :serdes/meta last :model)) (rest files)))))

(defn- temp-dir []
  (str (Files/createTempDirectory "dbt-import-test" (make-array FileAttribute 0))))

(deftest write-test
  (let [resolved  (flexanalytics-resolved)
        out-dir   (temp-dir)
        paths     (emit/write! out-dir (emit/files config resolved))
        read-yaml (fn [path] (yaml/parse-string (slurp (io/file out-dir path))))
        sales     (first (filter (comp #{"sales"} :name :metric) (:metrics resolved)))]
    (is (= 9 (count paths)))
    (testing "the collection file"
      (is (= {:name        "dbt metrics"
              :entity_id   (-> resolved :collection :entity-id)
              :slug        "dbt_metrics"
              :serdes/meta [{:model "Collection"}]}
             (select-keys (read-yaml "collections/main/dbt_metrics.yaml") [:name :entity_id :slug :serdes/meta]))))
    (testing "a metric card matches the serdes export shape"
      (is (= {:name          "Sales"
              :description   "The total revenue for each order."
              :entity_id     (:entity-id sales)
              :type          "metric"
              :display       "scalar"
              :collection_id (-> resolved :collection :entity-id)
              :creator_id    "admin@example.com"
              :card_schema   card/current-card-schema-version
              :dataset_query {:lib/type "mbql/query"
                              :database "Sales DB"
                              :stages   [{:lib/type     "mbql.stage/mbql"
                                          :source-table ["Sales DB" "public" "fact_sales"]
                                          :aggregation  [["sum" {} ["field"
                                                                    {:base-type "type/Float"}
                                                                    ["Sales DB" "public" "fact_sales" "sales"]]]]}]}
              :serdes/meta   [{:model "Card"}]}
             (-> (read-yaml "collections/main/dbt_metrics/sales.yaml")
                 (select-keys [:name :description :entity_id :type :display :collection_id :creator_id :card_schema
                               :dataset_query :serdes/meta])))))
    (testing "no result_metadata: the instance infers it on import"
      (is (not (contains? (read-yaml "collections/main/dbt_metrics/sales.yaml") :result_metadata))))))
