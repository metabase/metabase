(ns dev.dbt-import.emit-test
  (:require
   [clj-yaml.core :as yaml]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer [are deftest is testing]]
   [dev.dbt-import.emit :as emit]
   [dev.dbt-import.test-util :as tu :refer [fld]]
   [metabase.queries.models.card :as card]
   [metabase.test :as mt]
   [metabase.util :as u])
  (:import
   (java.nio.file Path Paths)))

(set! *warn-on-reflection* true)

(deftest ^:parallel dataset-query-test
  (let [resolved (tu/resolve-manifest-map (tu/build-manifest {}))
        stage    (-> (emit/dataset-query (first (:metrics resolved))) :stages first)]
    (testing "the stage serdes writes: portable table and field refs, no clause ids, no :filters key without filters"
      (is (= {:lib/type     :mbql.stage/mbql
              :source-table [tu/db "public" "fact_sales"]
              :aggregation  [[:sum {} (fld "sales" :type/Float)]]}
             stage))))
  (testing "filters go on the stage, in order"
    (is (= [[:= {} (fld "status" :type/Text) "Shipped"] [:> {} (fld "amount" :type/Decimal) 0]]
           (tu/filters {:metric {:filter (tu/where-filters "{{ Dimension('fact_sales_key__status') }} = 'Shipped'"
                                                           "{{ Dimension('fact_sales_key__amount') }} > 0")}})))))

(deftest ^:parallel files-test
  (let [resolved (tu/flexanalytics-resolved)
        files    (emit/files tu/default-config resolved)]
    (testing "the collection, then the metrics by name, a ratio or derived metric after the metrics it refers to"
      (is (= ["collections/main/dbt_metrics.yaml"
              "collections/main/dbt_metrics/cumulative_sales.yaml"
              "collections/main/dbt_metrics/customer_count.yaml"
              "collections/main/dbt_metrics/order_count.yaml"
              "collections/main/dbt_metrics/price.yaml"
              "collections/main/dbt_metrics/product_count.yaml"
              "collections/main/dbt_metrics/quantity.yaml"
              "collections/main/dbt_metrics/rowcount.yaml"
              "collections/main/dbt_metrics/sales.yaml"
              "collections/main/dbt_metrics/sales_to_target_ratio.yaml"
              "collections/main/dbt_metrics/target.yaml"
              "collections/main/dbt_metrics/cancelled_order_share.yaml"
              "collections/main/dbt_metrics/sales_minus_target.yaml"
              "collections/main/dbt_metrics/sales_pct_of_target.yaml"
              "collections/main/dbt_metrics/sales_to_target_ratio_2.yaml"]
             (map :path files))))
    (is (= [{:model "Collection"}]
           (map #(select-keys % [:model]) (-> files first :entity :serdes/meta))))
    (is (every? #(= "Card" (-> % :entity :serdes/meta last :model)) (rest files)))))

(deftest write-test
  (mt/with-temp-dir [out-dir nil]
    (let [resolved  (tu/flexanalytics-resolved)
          paths     (emit/write! out-dir (emit/files tu/default-config resolved))
          read-yaml (fn [path] (yaml/parse-string (slurp (io/file out-dir path))))
          sales     (tu/resolved-metric-named resolved "sales")]
      (is (= 15 (count paths)))
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
                                                                      {:base-type "type/Float", :effective-type "type/Float"}
                                                                      ["Sales DB" "public" "fact_sales" "sales"]]]]}]}
                :serdes/meta   [{:model "Card"}]}
               (-> (read-yaml "collections/main/dbt_metrics/sales.yaml")
                   (select-keys [:name :description :entity_id :type :display :collection_id :creator_id :card_schema
                                 :dataset_query :serdes/meta])))))
      (testing "a metric over a SQL expression aggregates the expression"
        (is (= [["avg" {} ["/" {}
                           ["field" {:base-type "type/Float", :effective-type "type/Float"} ["Sales DB" "public" "fact_sales" "sales"]]
                           ["field" {:base-type "type/Float", :effective-type "type/Float"} ["Sales DB" "public" "fact_sales" "target"]]]]]
               (-> (read-yaml "collections/main/dbt_metrics/sales_to_target_ratio.yaml") :dataset_query :stages first :aggregation))))
      (testing "no result_metadata: the instance infers it on import"
        (is (not (contains? (read-yaml "collections/main/dbt_metrics/sales.yaml") :result_metadata)))))))

(deftest write-clears-previous-run-test
  (mt/with-temp-dir [out-dir nil]
    (let [write!    (fn [labels]
                      (emit/write! out-dir (emit/files tu/default-config (tu/resolve-manifest-map (tu/metrics-manifest labels)))))
          card-file (fn [file-name] (io/file out-dir "collections/main/dbt_metrics" file-name))
          other     (io/file out-dir "collections/main/other_collection/card.yaml")]
      (write! ["Sales" "Quantity"])
      (io/make-parents other)
      (spit other "name: Other")
      (write! ["Sales"])
      (testing "a metric removed from the project does not survive as a file"
        (is (not (.exists ^java.io.File (card-file "quantity.yaml")))))
      (testing "the metrics still in the project, and the collection, are written"
        (is (.exists ^java.io.File (card-file "sales.yaml")))
        (is (.exists (io/file out-dir "collections/main/dbt_metrics.yaml"))))
      (testing "files outside the collection are left alone"
        (is (.exists other))))))

(deftest ^:parallel fill-nulls-with-test
  (testing "fill_nulls_with wraps the aggregation in coalesce, whether it sits on the metric or its input measure"
    (is (= [:coalesce {} tu/sum-sales 0] (tu/aggregation {:type-params {:fill_nulls_with 0}})))
    (is (= [:coalesce {} tu/sum-sales 0] (tu/aggregation {:input-measure {:fill_nulls_with 0}})))
    (is (= [:coalesce {} tu/sum-sales -1] (tu/aggregation {:type-params {:fill_nulls_with -1}})))
    (testing "the metric's wins over the input measure's"
      (is (= [:coalesce {} tu/sum-sales 1] (tu/aggregation {:type-params {:fill_nulls_with 1}, :input-measure {:fill_nulls_with 0}})))))
  (testing "around a count"
    (is (= [:coalesce {} [:count-where {} [:not-null {} (fld "sales" :type/Float)]] 0]
           (tu/aggregation {:measure {:agg "count", :expr "sales"}, :type-params {:fill_nulls_with 0}}))))
  (testing "around a row count"
    (is (= [:coalesce {} [:count {}] 0] (tu/aggregation {:measure {:expr "1"}, :type-params {:fill_nulls_with 0}}))))
  (testing "around a max of an integer, which has a numeric result"
    (is (= [:coalesce {} [:max {} (fld "quantity" :type/Integer)] 0]
           (tu/aggregation {:measure {:agg "max", :expr "quantity"}, :type-params {:fill_nulls_with 0}}))))
  (testing "a numeric fill of a non-numeric aggregation would fail in the warehouse"
    (are [column] (re-find #"fill_nulls_with 0 on a non-numeric aggregation"
                           (tu/unsupported {:measure {:agg "max", :expr column}, :type-params {:fill_nulls_with 0}}))
      "customer_key" "date_day"))
  (testing "a column of unknown type is trusted"
    (is (= [:coalesce {} [:max {} (fld "x" nil)] 0]
           (tu/aggregation {:measure {:agg "max", :expr "x"}, :columns {"x" nil}, :type-params {:fill_nulls_with 0}})))))

(deftest ^:parallel join-to-timespine-test
  (testing "join_to_timespine has no Metabase equivalent (nothing to join a scalar metric to) and is ignored, as the QRES-1 mapping table says"
    (is (= tu/sum-sales (tu/aggregation {:type-params {:join_to_timespine true}})))
    (is (= tu/sum-sales (tu/aggregation {:input-measure {:join_to_timespine true}})))
    (is (= [:coalesce {} tu/sum-sales 0] (tu/aggregation {:type-params {:join_to_timespine true, :fill_nulls_with 0}})))))

(def ^:private card-dir "collections/main/dbt_metrics/")

(def ^:private adversarial-labels
  ["Sales" "sales" "SALES" "Sales!" "Sales?" "Sales 2" "sales_2" "sales_2" "../../etc/passwd" "..\\..\\windows\\system32"
   "a/b" "a/b/c" "." ".." "..." "📈" "📉" "📈📉" "Umsatz pro Größe" "日本語の売上" "Ventes €" (apply str (repeat 300 "x"))
   (apply str (repeat 120 "é")) (apply str (repeat 80 "日")) "con" "nul" "CON" "aux.yaml" "x.yaml" "  leading space"
   "trailing space  " "tab\tname" "new\nline" "#hash" "-dash" ":colon" "*star" "\"quoted\"" "'single'" "null" "true"])

(deftest ^:parallel adversarial-label-paths-test
  (let [files (tu/card-files (tu/metrics-manifest adversarial-labels))
        paths (map :path files)
        root  (Paths/get "/out" (make-array String 0))]
    (is (= (count adversarial-labels) (count files)) "every metric gets a file")
    (testing "file paths are unique, even on a case-insensitive file system"
      (is (= (count paths) (count (distinct (map u/lower-case-en paths))))))
    (doseq [path paths
            :let [file-name (subs path (count card-dir))]]
      (testing (pr-str path)
        (is (str/starts-with? path card-dir))
        (is (not (str/includes? file-name "/")) "a label cannot add a directory level")
        (is (str/ends-with? file-name ".yaml"))
        (is (<= (count (.getBytes ^String file-name "UTF-8")) 255) "fits a file name on ext4 and APFS")
        (is (.startsWith (.normalize ^Path (.resolve ^Path root ^String path)) root) "stays inside the export directory")))))

(deftest ^:parallel label-fallback-test
  (testing "a nil or blank label falls back to the metric name"
    (is (= ["m0" "m1" "m2"]
           (map #(-> % :entity :name) (tu/card-files (tu/metrics-manifest [nil "" "  "])))))))

(def ^:private yaml-hostile-strings
  ["key: value" "- not a list" "# not a comment" "'single'" "\"double\"" "multi\nline\n\nparagraphs" "trailing newline\n"
   "tab\there" "unicode ✓ ünï 日本" "---" "..." "null" "true" "false" "123" "1e3" "0x1F" "~" "{curly}" "[square]"
   "&anchor" "*alias" "!tag" "%percent" "@at" "`backtick`" "| pipe" "> greater" "| Metric | Definition |\n|---|---|"
   "   leading spaces" "trailing spaces   " "\\backslash" "emoji 📈" "a: b: c" "? question" ", comma" "=equals"])

(deftest yaml-round-trip-test
  (mt/with-temp-dir [out-dir nil]
    (let [manifest (tu/metrics-manifest yaml-hostile-strings yaml-hostile-strings)
          files    (emit/files tu/default-config (tu/resolve-manifest-map manifest))]
      (emit/write! out-dir files)
      (doseq [{:keys [path metric]} (rest files)
              :let [{card-name :name, :keys [description]} (yaml/parse-string (slurp (io/file out-dir path)))]]
        (testing (pr-str (-> metric :ir :label))
          (is (= (-> metric :ir :label) card-name) "the label survives YAML as the card name")
          (is (= (-> metric :ir :description) description) "the description survives YAML"))))))

(deftest determinism-test
  (let [labels    ["Sales" "Quantity" "Price" "Target" "Sales"]
        forward   (tu/metrics-manifest labels)
        backward  (update forward :metrics #(into (array-map) (reverse %)))
        run       (fn [manifest]
                    (mt/with-temp-dir [dir nil]
                      (let [files (emit/files tu/default-config (tu/resolve-manifest-map manifest))]
                        (emit/write! dir files)
                        (into (sorted-map) (for [{:keys [path]} files] [path (slurp (io/file dir path))])))))
        first-run (run forward)]
    (testing "re-running produces byte-identical files"
      (is (= first-run (run forward))))
    (testing "the order metrics appear in the manifest does not change the output"
      (is (= first-run (run backward))))))

(deftest ^:parallel empty-manifest-test
  (let [resolved (tu/resolve-manifest-map (assoc (tu/build-manifest {}) :metrics {}))]
    (is (= [] (:metrics resolved)))
    (is (= [] (:unsupported resolved)))
    (is (= 1 (count (emit/files tu/default-config resolved))) "only the collection")))
