(ns dev.dbt-import.emit-test
  "The emit stage: the serdes files a resolved manifest becomes, their names, and how [[emit/write!]] puts them on disk
  and takes a previous run's away."
  (:require
   [clojure.java.io :as io]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer [are deftest is testing]]
   [dev.dbt-import.emit :as emit]
   [dev.dbt-import.test-util :as tu :refer [fld]]
   [medley.core :as m]
   [metabase.models.serialization :as serdes]
   [metabase.queries.models.card :as card]
   [metabase.test :as mt]
   [metabase.util :as u])
  (:import
   (java.nio.file Path Paths)))

(set! *warn-on-reflection* true)

(deftest ^:parallel dataset-query-test
  (let [resolved (tu/resolve-manifest-map (tu/build-manifest {}))
        stage    (tu/stage (first (:metrics resolved)))]
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
    ;; which metrics resolve, and in what order, is [[dev.dbt-import.resolve-test/resolve-manifest-test]]'s business
    (testing "the collection, then one card per resolved metric, in the order they were resolved"
      (is (= "collections/main/dbt_metrics.yaml" (-> files first :path)))
      (is (= (map (comp :name :ir) (:metrics resolved))
             (map (comp :name :ir :metric) (rest files)))))
    (testing "a card's file is its slugified label, under the collection's directory"
      (is (= "collections/main/dbt_metrics/sales_to_target_ratio.yaml"
             (:path (m/find-first #(= "Sales to Target Ratio" (-> % :metric :ir :label)) files))))
      (is (every? #(re-matches #"collections/main/dbt_metrics/[a-z0-9_]+\.yaml" (:path %)) (rest files)))
      (is (apply distinct? (map :path files))))
    (is (= [{:model "Collection"}]
           (map #(select-keys % [:model]) (-> files first :entity :serdes/meta))))
    (is (every? #(= "Card" (-> % :entity :serdes/meta last :model)) (rest files)))))

(deftest ^:parallel collection-name-test
  (let [resolved (tu/resolve-manifest-map (tu/build-manifest {}))
        paths    (fn [collection-name]
                   (map :path (emit/files tu/default-config (assoc-in resolved [:collection :name] collection-name))))]
    (testing "a name that slugifies to `..` or `.` would put the files, and the delete of the previous run, outside the
              collection's directory"
      (doseq [collection-name [".." "."]]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"is not a usable collection name"
                              (paths collection-name))
            (pr-str collection-name))))
    (testing "one that slugifies to nothing has no directory at all"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"collection name \"\" slugifies to nothing"
                            (paths ""))))
    (testing "dots inside a name are fine"
      (is (= ["collections/main/v1.2_metrics.yaml" "collections/main/v1.2_metrics/m.yaml"]
             (paths "v1.2 metrics"))))))

(deftest write-test
  (mt/with-temp-dir [out-dir nil]
    (let [resolved    (tu/flexanalytics-resolved)
          paths       (emit/write! out-dir (emit/files tu/default-config resolved))
          read-yaml   (partial tu/read-yaml out-dir)
          sales       (tu/resolved-metric-named resolved "sales")
          ;; a float column's field ref as it reads back from YAML, keywords as strings
          float-field (fn [column]
                        ["field" {}
                         ["Sales DB" "public" "fact_sales" column]])]
      (is (= (inc (count (:metrics resolved))) (count paths)) "the collection and one card per metric")
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
                :card_schema   emit/card-schema
                :dataset_query {:lib/type "mbql/query"
                                :database "Sales DB"
                                :stages   [{:lib/type     "mbql.stage/mbql"
                                            :source-table ["Sales DB" "public" "fact_sales"]
                                            :aggregation  [["sum" {} (float-field "sales")]]}]}
                :serdes/meta   [{:model "Card"}]}
               (-> (read-yaml "collections/main/dbt_metrics/sales.yaml")
                   (select-keys [:name :description :entity_id :type :display :collection_id :creator_id :card_schema
                                 :dataset_query :serdes/meta])))))
      (testing "a metric over a SQL expression aggregates the expression"
        (is (= [["avg" {} ["/" {} (float-field "sales") (float-field "target")]]]
               (-> (read-yaml "collections/main/dbt_metrics/sales_to_target_ratio.yaml")
                   :dataset_query :stages first :aggregation))))
      (testing "no result_metadata: the instance infers it on import"
        (is (not (contains? (read-yaml "collections/main/dbt_metrics/sales.yaml") :result_metadata)))))))

(deftest write-clears-previous-run-test
  (mt/with-temp-dir [out-dir nil]
    (let [write!    (fn [labels]
                      (->> (tu/metrics-manifest labels)
                           tu/resolve-manifest-map
                           (emit/files tu/default-config)
                           (emit/write! out-dir)))
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
      (is (= [:coalesce {} tu/sum-sales 1]
             (tu/aggregation {:type-params {:fill_nulls_with 1}, :input-measure {:fill_nulls_with 0}})))))
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
           (tu/aggregation {:measure     {:agg "max", :expr "x"}
                            :columns     {"x" nil}
                            :type-params {:fill_nulls_with 0}})))))

(deftest ^:parallel join-to-timespine-test
  (testing "join_to_timespine has no Metabase equivalent (nothing to join a scalar metric to) and is ignored"
    (is (= tu/sum-sales (tu/aggregation {:type-params {:join_to_timespine true}})))
    (is (= tu/sum-sales (tu/aggregation {:input-measure {:join_to_timespine true}})))
    (is (= [:coalesce {} tu/sum-sales 0]
           (tu/aggregation {:type-params {:join_to_timespine true, :fill_nulls_with 0}})))))

(def ^:private card-dir "collections/main/dbt_metrics/")

(def ^:private adversarial-labels
  ["Sales" "sales" "SALES" "Sales!" "Sales?" "Sales 2" "sales_2" "sales_2" "../../etc/passwd"
   "..\\..\\windows\\system32"
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
        (is (.startsWith (.normalize ^Path (.resolve ^Path root ^String path)) root)
            "stays inside the export directory")))))

(deftest ^:parallel label-fallback-test
  (testing "a nil or blank label falls back to the metric name"
    (is (= ["m0" "m1" "m2"]
           (map #(-> % :entity :name) (tu/card-files (tu/metrics-manifest [nil "" "  "])))))))

(def ^:private yaml-hostile-strings
  ["key: value" "- not a list" "# not a comment" "'single'" "\"double\"" "multi\nline\n\nparagraphs"
   "trailing newline\n"
   "tab\there" "unicode ✓ ünï 日本" "---" "..." "null" "true" "false" "123" "1e3" "0x1F" "~" "{curly}" "[square]"
   "&anchor" "*alias" "!tag" "%percent" "@at" "`backtick`" "| pipe" "> greater" "| Metric | Definition |\n|---|---|"
   "   leading spaces" "trailing spaces   " "\\backslash" "emoji 📈" "a: b: c" "? question" ", comma" "=equals"])

(deftest labels-survive-yaml-test
  (mt/with-temp-dir [out-dir nil]
    (let [manifest (tu/metrics-manifest yaml-hostile-strings yaml-hostile-strings)
          files    (emit/files tu/default-config (tu/resolve-manifest-map manifest))]
      (emit/write! out-dir files)
      (doseq [{:keys [path metric]} (rest files)
              :let [{card-name :name, :keys [description]} (tu/read-yaml out-dir path)]]
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

(deftest ^:parallel card-schema-test
  (is (= emit/card-schema card/current-card-schema-version)
      (str "card_schema moved past " emit/card-schema ": check the hand-built dimensions and dimension mappings the"
           " resolve stage puts on the card (see dev.dbt-import.emit/card-schema) against what changed in the new"
           " version, then bump dev.dbt-import.emit/card-schema")))

(deftest ^:parallel nfc-label-test
  (testing "a label with combining marks and the same label precomposed slugify the same, and are then told apart"
    (let [paths (map :path (tu/card-files (tu/metrics-manifest ["Café" "Café"])))]
      (is (= ["collections/main/dbt_metrics/café.yaml" "collections/main/dbt_metrics/café_2.yaml"]
             paths)))))

(deftest ^:parallel empty-label-slug-test
  (testing "a label that slugifies to nothing is refused rather than written as `.yaml`"
    (let [resolved (tu/resolve-manifest-map (tu/build-manifest {}))]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"label \"\" slugifies to nothing"
                            (emit/files tu/default-config (assoc-in resolved [:metrics 0 :ir :label] "")))))))

(defn- write-labels!
  "Convert a manifest whose metrics have `labels` and write it under `out-dir`; returns the paths written."
  [out-dir labels]
  (->> (tu/metrics-manifest labels)
       tu/resolve-manifest-map
       (emit/files tu/default-config)
       (emit/write! out-dir)))

(defn- listing
  "Every file under `dir`, relative to it, sorted."
  [dir]
  (let [root (io/file dir)]
    (sort (for [^java.io.File file (file-seq root)
                :when (.isFile file)]
            (subs (.getPath file) (inc (count (.getPath root))))))))

(deftest write-nothing-when-no-metric-test
  (mt/with-temp-dir [out-dir nil]
    (write-labels! out-dir ["Sales"])
    (let [before   (listing out-dir)
          resolved (tu/resolve-manifest-map (assoc (tu/build-manifest {}) :metrics {}))
          files    (emit/files tu/default-config resolved)]
      (is (= 1 (count files)) "only the collection, which is not worth writing on its own")
      (testing "nothing is written, the previous run stays, and the log says so"
        (is (=? [{:level :info, :message #"^No metric converted, so nothing was written and .* was left as it is$"}]
                (mt/with-log-messages-for-level [messages [dev.dbt-import.emit :info]]
                  (is (= [] (emit/write! out-dir files)))
                  (messages))))
        (is (= before (listing out-dir)))))))

(deftest write-replaces-regular-file-test
  (mt/with-temp-dir [out-dir nil]
    (let [card-dir (io/file out-dir "collections/main/dbt_metrics")]
      (io/make-parents card-dir)
      (spit card-dir "not a directory")
      (testing "a regular file where the card directory goes is replaced by the directory"
        (write-labels! out-dir ["Sales"])
        (is (.isDirectory ^java.io.File card-dir))
        (is (= ["collections/main/dbt_metrics.yaml" "collections/main/dbt_metrics/sales.yaml"]
               (listing out-dir)))))))

(deftest write-failure-leaves-previous-run-test
  (mt/with-temp-dir [out-dir nil]
    (write-labels! out-dir ["Sales" "Quantity"])
    (let [before     (listing out-dir)
          contents   (into {} (map (juxt identity #(slurp (io/file out-dir %)))) before)
          failing    (fn [file content]
                       (if (str/ends-with? (str file) "/price.yaml")
                         (throw (java.io.IOException. "disk full"))
                         ((mt/original-fn #'emit/write-file!) file content)))
          e          (mt/with-dynamic-fn-redefs [emit/write-file! failing]
                       (try
                         (write-labels! out-dir ["Sales" "Price" "Quantity"])
                         (catch clojure.lang.ExceptionInfo e e)))]
      (is (some? e) "the failure propagates")
      (testing "the failure says what was written before it and what failed"
        (is (= "could not write collections/main/dbt_metrics/price.yaml: disk full" (ex-message e)))
        (is (= {:written ["collections/main/dbt_metrics.yaml" "collections/main/dbt_metrics/sales.yaml"]
                :failed  "collections/main/dbt_metrics/price.yaml"}
               (ex-data e)))
        (is (instance? java.io.IOException (ex-cause e))))
      (testing "the previous run is exactly as it was, and no staging directory is left behind"
        (is (= before (listing out-dir)))
        (is (= contents (into {} (map (juxt identity #(slurp (io/file out-dir %)))) before)))
        (is (= #{"collections"} (set (.list (io/file out-dir)))))))))

(deftest ^:parallel metric-meta-test
  (testing "a metric's free-form meta is parsed into the IR and written nowhere: no key of the card carries it"
    (let [resolved (tu/resolve-manifest-map
                    (tu/build-manifest {:metric {:meta {:format   {"type" "percent", "decimalPlaces" 1}
                                                        :synonyms ["Sales Coverage Ratio"]}}}))
          card     (tu/card-entity tu/default-config resolved "m")]
      (is (= ["Sales Coverage Ratio"] (-> resolved :metrics first :ir :meta :synonyms)) "the IR carries it")
      (is (not (contains? card :meta)))
      (is (= {} (:visualization_settings card)))
      (is (not (str/includes? (pr-str card) "Sales Coverage Ratio"))))))

(deftest ^:parallel card-envelope-test
  (testing "a card is what the Card spec exports of a row, not a hand-written envelope"
    (let [resolved  (tu/resolve-manifest-map (tu/build-manifest {}))
          metric    (tu/resolved-metric-named resolved "m")
          card      (tu/card-entity tu/default-config resolved "m")
          spec      (serdes/make-spec "Card" nil)
          exported  (into (set (:copy spec)) (map (fn [[k transform]] (:as transform k))) (:transform spec))]
      (testing "every key written is one the spec exports"
        (is (empty? (set/difference (disj (set (keys card)) :serdes/meta) exported))))
      (testing "a column at its default value is left out, as a real export leaves it; the import puts it back"
        (is (seq (:defaults spec)))
        (is (not-any? #(contains? card %) (keys (:defaults spec)))))
      (testing "the references the metadata provider does not number are written in portable form"
        (is (= "admin@example.com" (:creator_id card)))
        (is (= (-> resolved :collection :entity-id) (:collection_id card))))
      (testing "the references the import derives again are not written"
        (is (not-any? #(contains? card %) [:database_id :result_metadata :table_id :source_card_id])))
      (is (= [{:model "Card", :id (:entity-id metric), :label "m"}] (:serdes/meta card))))))

(deftest ^:parallel collection-envelope-test
  (testing "the collection is what the Collection spec exports of a top-level row"
    (let [resolved   (tu/resolve-manifest-map (tu/build-manifest {}))
          collection (-> (emit/files tu/default-config resolved) first :entity)
          exported   (let [spec (serdes/make-spec "Collection" nil)]
                       (into (set (:copy spec)) (map (fn [[k transform]] (:as transform k))) (:transform spec)))]
      (is (empty? (set/difference (disj (set (keys collection)) :serdes/meta) exported)))
      (is (= {:name        "dbt metrics"
              :entity_id   (-> resolved :collection :entity-id)
              :slug        "dbt_metrics"
              :description "Metrics imported from dbt."
              :serdes/meta [{:model "Collection", :id (-> resolved :collection :entity-id), :label "dbt_metrics"}]}
             (dissoc collection :archived_directly)))
      (testing "no parent and no personal owner"
        (is (not-any? #(contains? collection %) [:parent_id :personal_owner_id]))))))
