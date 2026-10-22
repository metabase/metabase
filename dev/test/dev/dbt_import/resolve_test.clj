(ns dev.dbt-import.resolve-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer [deftest is testing]]
   [dev.dbt-import.parse :as parse]
   [dev.dbt-import.resolve :as resolve]
   [dev.dbt-import.schemas.resolved :as resolved]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(def ^:private config
  {:databases     {"dbt_bi" "Sales DB"}
   :driver        :postgres
   :creator-email "admin@example.com"})

(defn- flexanalytics-ir []
  (parse/parse-manifest-file (.getPath ^java.net.URL (io/resource "dbt_import/flexanalytics_manifest.json"))))

(defn- ir-metric-named [ir metric-name]
  (first (filter (comp #{metric-name} :name) (:metrics ir))))

(defn- resolved-metric-named [resolved metric-name]
  (first (filter (comp #{metric-name} :name :metric) (:metrics resolved))))

(deftest ^:parallel entity-id-test
  (is (mr/validate ::resolved/entity-id (resolve/entity-id "x")))
  (testing "deterministic"
    (is (= (resolve/entity-id "dbt-import/metric/a")
           (resolve/entity-id "dbt-import/metric/a"))))
  (is (not= (resolve/entity-id "a") (resolve/entity-id "b"))))

(deftest ^:parallel base-type-test
  (testing "types come from the driver's sync mapping"
    (is (= :type/Float (resolve/base-type :postgres nil "float")))
    (is (= :type/Integer (resolve/base-type :postgres nil "integer")))
    (is (= :type/DateTimeWithLocalTZ (resolve/base-type :postgres nil "timestamp with time zone"))))
  (testing "length suffixes and case are stripped first"
    (is (= :type/Text (resolve/base-type :postgres nil "VARCHAR(255)")))
    (is (= :type/Decimal (resolve/base-type :postgres nil "numeric(10, 2)"))))
  (is (nil? (resolve/base-type :postgres nil "geography")))
  (is (nil? (resolve/base-type :postgres nil nil)))
  (testing "config overrides win"
    (is (= :type/Text (resolve/base-type :postgres {"geography" :type/Text} "geography")))))

(deftest ^:parallel resolve-manifest-test
  (let [resolved (resolve/resolve-manifest config (flexanalytics-ir))]
    (is (mr/validate ::resolved/manifest resolved))
    (is (= "dbt metrics" (-> resolved :collection :name)))
    (testing "the 8 bare-column metrics resolve"
      (is (= ["customer_count" "order_count" "price" "product_count" "quantity" "row_count" "sales" "target"]
             (map (comp :name :metric) (:metrics resolved)))))
    (testing "sales resolves to a portable field ref with a base type"
      (is (= {:database     "Sales DB"
              :source-table ["Sales DB" "public" "fact_sales"]
              :field        {:ref ["Sales DB" "public" "fact_sales" "sales"], :base-type :type/Float}}
             (select-keys (resolved-metric-named resolved "sales") [:database :source-table :field]))))
    (testing "customer_count resolves its key column as text"
      (is (= {:ref ["Sales DB" "public" "fact_sales" "customer_key"], :base-type :type/Text}
             (:field (resolved-metric-named resolved "customer_count")))))
    (testing "row_count, a sum of the literal 1, resolves with no field"
      (is (nil? (:field (resolved-metric-named resolved "row_count")))))
    (testing "sales_to_target is reported, not dropped"
      (is (= [{:name      "sales_to_target"
               :unique-id "metric.dbt_business_intelligence.sales_to_target"
               :reason    "expr \"sales / target\" is a SQL expression, not supported yet (QRES-3)"}]
             (:unsupported resolved))))
    (testing "entity ids are stable across runs"
      (is (= (map :entity-id (:metrics resolved))
             (map :entity-id (:metrics (resolve/resolve-manifest config (flexanalytics-ir)))))))))

(deftest ^:parallel resolve-metric-unsupported-test
  (let [ir              (flexanalytics-ir)
        semantic-models (:semantic-models ir)
        sales           (ir-metric-named ir "sales")
        reason          (fn [config semantic-models metric]
                          (:reason (resolve/resolve-metric config semantic-models metric)))]
    (is (re-find #"no Metabase database configured for warehouse database \"dbt_bi\""
                 (reason (assoc config :databases {}) semantic-models sales)))
    (is (re-find #"column \"nope\" not found on \"fact_sales\""
                 (reason config semantic-models (assoc sales :expr "nope"))))
    (is (re-find #"filters are not supported yet \(QRES-3\)"
                 (reason config semantic-models (assoc sales :filters ["{{ Dimension('x') }} = 1"]))))
    (is (re-find #"no base type known for column \"sales\" of type \"geography\""
                 (reason config (assoc-in semantic-models ["fact_sales" :columns "sales" :data-type] "geography") sales)))
    (is (re-find #"average over the literal 1"
                 (reason config semantic-models (assoc sales :agg :average :expr "1"))))
    (is (re-find #"sum_boolean over the non-boolean column"
                 (reason config semantic-models (assoc sales :agg :sum_boolean))))
    (is (re-find #"percentile aggregation without a percentile value"
                 (reason config semantic-models (assoc sales :agg :percentile))))))
