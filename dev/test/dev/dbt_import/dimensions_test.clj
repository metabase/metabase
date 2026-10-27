(ns dev.dbt-import.dimensions-test
  "The curated dimension set of a converted metric (QRES-4): dbt dimensions on the metric's own semantic model become
  dimensions of its table, dimensions on the semantic models its foreign entities join to become dimensions reached by
  an implicit join through the entity's column, and the measure's `agg_time_dimension` is the default. Dimensions
  that cannot be a Metabase dimension (a dimension mapping targets a column, never SQL) are reported per metric, not
  dropped.

  Everything is checked in the portable form [[emit/files]] writes, see [[tu/dimension-set]]. The written files being
  byte-identical across runs is covered by `dev.dbt-import.emit-test/determinism-test`, whose fixture now carries
  dimensions."
  (:require
   [clojure.java.io :as io]
   [clojure.set :as set]
   [clojure.test :refer [are deftest is testing]]
   [dev.dbt-import.emit :as emit]
   [dev.dbt-import.parse :as parse]
   [dev.dbt-import.resolve :as resolve]
   [dev.dbt-import.test-util :as tu :refer [fld]]
   [medley.core :as m]
   [metabase-enterprise.serialization.v2.ingest :as serdes.ingest]
   [metabase.lib-metric.schema :as lib-metric.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.metrics.core :as metrics]
   [metabase.models.serialization :as serdes]
   [metabase.util.malli.registry :as mr]
   [metabase.util.yaml :as yaml]))

(set! *warn-on-reflection* true)

(def ^:private main-group
  "The group of the metric's own columns, named after its semantic model, which has no label, so after its table."
  {:id (tu/group-id "main" "fact_sales"), :type "main", :display-name "fact_sales"})

(def ^:private product-group
  "The group of the columns joined from `dim_product`, named after the semantic model's label."
  {:id (tu/group-id "connection" "Product"), :type "connection", :display-name "Product"})

(def ^:private order-group
  "The group of the columns joined from `dim_order`, which has no label, so named after its table."
  {:id (tu/group-id "connection" "dim_order"), :type "connection", :display-name "dim_order"})

(defn- local-dimension
  "What [[tu/dimension-set]] shows for a dimension over `column` of `fact_sales`, before its name and display name."
  [column base-type]
  {:effective-type base-type
   :sources        [{:type :field, :field-id (tu/portable-field "fact_sales" column)}]
   :group          main-group
   :table-id       (tu/portable-table "fact_sales")
   :target         (fld column base-type)})

(defn- joined-dimension
  "What [[tu/dimension-set]] shows for a dimension over `column` of dimension table `table`, reached from `fact_sales`
  through `fk-column`, before its name and display name."
  [fk-column table column base-type group]
  {:effective-type base-type
   :sources        [{:type :field, :field-id (tu/portable-field table column)}]
   :group          group
   :table-id       (tu/portable-table table)
   :target         (tu/joined-fld fk-column table column base-type)})

(deftest ^:parallel local-dimensions-test
  (let [dimensions (tu/dimension-set {})]
    (testing "a categorical dimension over a column of the metric's own table"
      (is (= (assoc (local-dimension "status" :type/Text) :name "status", :display-name "status")
             (get dimensions "status")))
      (is (= (assoc (local-dimension "amount" :type/Decimal) :name "amount", :display-name "amount")
             (get dimensions "amount")))
      (is (= (assoc (local-dimension "is_returned" :type/Boolean) :name "is_returned", :display-name "is_returned")
             (get dimensions "is_returned"))))
    (testing "a time dimension's granularity is its default temporal unit"
      (is (= (assoc (local-dimension "created_at" :type/DateTime)
                    :name "created_at", :display-name "created_at", :default-temporal-unit :day)
             (get dimensions "created_at"))))
    (testing "the measure's agg_time_dimension is the default dimension"
      (is (= (assoc (local-dimension "date_day" :type/Date)
                    :name "date_day", :display-name "date_day", :default-temporal-unit :day, :default true)
             (get dimensions "date_day"))))
    (testing "and the only one"
      (is (= ["date_day"] (keys (m/filter-vals :default dimensions)))))))

(deftest ^:parallel joined-dimensions-test
  (let [dimensions (tu/dimension-set {})]
    (testing "a dimension on the semantic model a foreign entity is primary for, reached through the entity's column"
      (is (= (assoc (joined-dimension "product_key" "dim_product" "product_category" :type/Text product-group)
                    :name "product_category_dim", :display-name "Product category")
             (get dimensions "product_category_dim"))))
    (testing "a dimension with no expr is the column of its name"
      (is (= (assoc (joined-dimension "product_key" "dim_product" "msrp" :type/Integer product-group)
                    :name "msrp", :display-name "msrp")
             (get dimensions "msrp"))))
    (testing "a joined time dimension buckets like a local one"
      (is (= (assoc (joined-dimension "order_key" "dim_order" "order_date" :type/Date order-group)
                    :name "order_date", :display-name "Ordered on", :default-temporal-unit :day)
             (get dimensions "order_date")))
      (is (= (assoc (joined-dimension "product_key" "dim_product" "first_order_date" :type/Date product-group)
                    :name "first_order_date", :display-name "first_order_date", :default-temporal-unit :day)
             (get dimensions "first_order_date"))))
    (testing "the group is named after the semantic model's label, or its table when it has none"
      (is (= (assoc (joined-dimension "order_key" "dim_order" "status" :type/Text order-group)
                    :name "order_status_dim", :display-name "order_status_dim")
             (get dimensions "order_status_dim"))))))

(deftest ^:parallel dimension-order-test
  (testing "the metric's own dimensions first, in model order, then each foreign entity's in entity order"
    (is (= ["date_day" "created_at" "status" "amount" "is_returned"
            "order_status_dim" "order_date"
            "product_category_dim" "msrp" "first_order_date"]
           (tu/dimension-names {}))))
  (testing "entities are join keys, not dimensions"
    (is (not-any? #{"fact_sales_key" "customer" "order" "product" "customer_key" "order_key" "product_key"}
                  (tu/dimension-names {}))))
  (testing "a metric whose model joins to nothing has only its own dimensions"
    (is (= ["date_day" "created_at" "status" "amount" "is_returned"]
           (tu/dimension-names {:edit #(update % :semantic_models dissoc tu/product-sm-id tu/order-sm-id)})))))

(deftest ^:parallel untyped-column-test
  (testing "a column the project does not type is a dimension of no known type, which the instance supplies"
    (let [dimension (get (tu/dimension-set {:columns {"status" ::tu/remove}}) "status")]
      (is (= (fld "status" nil) (:target dimension)))
      (is (not (contains? dimension :effective-type))))))

(defn- defaults-of
  "The names of the default dimensions of the metric [[tu/convert]] builds from `tweaks`."
  [tweaks]
  (vec (keys (m/filter-vals :default (tu/dimension-set tweaks)))))

(defn- reason-for
  "The reason `dimension-name` was reported in `reasons` (see [[tu/unsupported-dimensions]]); a string saying it was
  not, when it was not, so a failing `re-find` says so instead of throwing."
  [reasons dimension-name]
  (get reasons dimension-name (str dimension-name " was not reported")))

(deftest ^:parallel default-dimension-test
  (testing "a measure's own agg_time_dimension overrides the model default"
    (is (= ["created_at"] (defaults-of {:measure {:agg_time_dimension "created_at"}}))))
  (testing "no agg_time_dimension, no default"
    (is (= [] (defaults-of {:edit (tu/edit-semantic-model #(assoc % :defaults nil))}))))
  (testing "an agg_time_dimension that is not a dimension of the model is reported, and nothing is the default"
    (let [tweaks {:measure {:agg_time_dimension "nope"}}]
      (is (= [] (defaults-of tweaks)))
      (is (re-find #"agg_time_dimension \"nope\" is not a dimension of semantic model \"fact_sales\""
                   (reason-for (tu/unsupported-dimensions tweaks) "nope")))))
  (testing "an agg_time_dimension that cannot be a dimension leaves nothing as the default"
    (is (= [] (defaults-of {:measure {:agg_time_dimension "next_day"}})))))

(def ^:private sql-dimensions
  "The fixture's dimensions whose expr is SQL, on the fact table and on the joined ones."
  #{"is_big_sale" "next_day" "is_aviation_order" "is_cancelled_order"})

(deftest ^:parallel unsupported-dimensions-test
  (let [reasons (tu/unsupported-dimensions {})]
    (testing "a dimension whose expr is SQL has no column for a dimension mapping to target"
      (doseq [dimension-name sql-dimensions]
        (testing dimension-name
          (is (re-find #"SQL expression" (reason-for reasons dimension-name))))))
    (testing "nothing else is reported: a foreign entity no semantic model is primary for is just a key"
      (is (= sql-dimensions (set (keys reasons)))))
    (testing "a reported dimension is not also a curated dimension"
      (is (empty? (set/intersection sql-dimensions (set (tu/dimension-names {})))))))
  (testing "a foreign entity whose expr is SQL cannot be an implicit join, so every dimension behind it is reported"
    (let [sql-entity (fn [entity]
                       (cond-> entity
                         (= "product" (:name entity)) (assoc :expr "upper(product_key)")))
          reasons    (tu/unsupported-dimensions
                      {:edit (tu/edit-semantic-model #(update % :entities (partial mapv sql-entity)))})]
      (are [dimension-name] (re-find #"entity \"product\".*SQL" (reason-for reasons dimension-name))
        "product_category_dim"
        "msrp"
        "first_order_date")
      (is (not-any? #{"product_category_dim" "msrp" "first_order_date"}
                    (tu/dimension-names {:edit (tu/edit-semantic-model #(update % :entities (partial mapv sql-entity)))})))))
  (testing "so must the primary entity on the semantic model joined to"
    (let [reasons (tu/unsupported-dimensions
                   {:edit (tu/edit-semantic-model tu/product-sm-id #(assoc-in % [:entities 0 :expr] "upper(product_key)"))})]
      (are [dimension-name] (re-find #"entity \"product\".*SQL" (reason-for reasons dimension-name))
        "product_category_dim"
        "msrp"
        "first_order_date")))
  (testing "two semantic models claiming the same primary entity is ambiguous"
    (let [twin    (assoc (tu/product-semantic-model) :unique_id "semantic_model.p.dim_product_2", :name "dim_product_2")
          reasons (tu/unsupported-dimensions
                   {:edit #(assoc-in % [:semantic_models "semantic_model.p.dim_product_2"] twin)})]
      (are [dimension-name] (re-find #"more than one semantic model has entity \"product\" as its primary entity"
                                     (reason-for reasons dimension-name))
        "product_category_dim"
        "msrp"
        "first_order_date"))))

(deftest ^:parallel dimension-id-test
  (let [{:keys [dimensions dimension-mappings]} (tu/convert {})
        ids                                    (mapv :id dimensions)
        ids-of                                 (fn [tweaks] (mapv :id (:dimensions (tu/convert tweaks))))]
    (testing "dimension ids are UUID strings"
      (is (every? #(mr/validate ::lib.schema.common/uuid %) ids)))
    (testing "every dimension has one mapping, in the same order"
      (is (= ids (mapv :dimension-id dimension-mappings)))
      (is (every? #(= :table (:type %)) dimension-mappings)))
    (testing "distinct within a metric"
      (is (and (seq ids) (apply distinct? ids))))
    (testing "the same on every run, so a re-import updates the dimensions instead of replacing them"
      (is (= ids (ids-of {}))))
    (testing "and the same when the metric is relabelled"
      (is (= ids (ids-of {:metric {:label "Renamed", :description "Something else"}}))))
    (testing "scoped to the metric: another metric over the same dimensions gets its own ids"
      (is (empty? (set/intersection (set ids) (set (ids-of {:metric {:name "m2", :unique_id "metric.p.m2"}}))))))
    (testing "group ids are the ones Metabase derives for the same groups"
      (is (= #{(:id main-group) (:id product-group) (:id order-group)}
             (into #{} (map (comp :id :group)) dimensions))))))

(defn- flexanalytics-resolved []
  (->> (.getPath ^java.net.URL (io/resource "dbt_import/flexanalytics_manifest.json"))
       parse/parse-manifest-file
       (resolve/resolve-manifest tu/default-config)))

(deftest ^:parallel flexanalytics-test
  (let [resolved   (flexanalytics-resolved)
        entity-for (fn [metric-name] (tu/card-entity tu/default-config resolved metric-name))
        names-of   (fn [entity] (mapv :name (:dimensions entity)))
        sales      (entity-for "sales")
        target-of  (fn [entity dimension-name]
                     (let [dimension-id (:id (m/find-first #(= dimension-name (:name %)) (:dimensions entity)))]
                       (:target (m/find-first #(= dimension-id (:dimension-id %)) (:dimension_mappings entity)))))]
    (testing "QRES-4 is done when: sales can be broken out by product_category_dim and order_status_dim, and date_day is its default"
      (is (= ["date_day" "order_status_dim" "product_category_dim"] (names-of sales)))
      (is (= ["date_day"] (into [] (comp (filter :default) (map :name)) (:dimensions sales)))))
    (testing "the joined dimensions reach their tables through the fact table's keys"
      (is (= (tu/joined-fld "product_key" "dim_product" "product_category" :type/Text)
             (target-of sales "product_category_dim")))
      (is (= (tu/joined-fld "order_key" "dim_order" "status" :type/Text)
             (target-of sales "order_status_dim"))))
    (testing "groups are named after the semantic models' labels"
      (is (= [["date_day" "main" "Sales Fact"] ["order_status_dim" "connection" "Order"] ["product_category_dim" "connection" "Product"]]
             (mapv (juxt :name (comp :type :group) (comp :display-name :group)) (:dimensions sales)))))
    (testing "every metric of the fact table gets the same dimensions"
      (doseq [metric-name ["price" "quantity" "target" "row_count" "customer_count" "product_count" "order_count" "sales_to_target"]]
        (testing metric-name
          (is (= (names-of sales) (names-of (entity-for metric-name)))))))
    (testing "the SQL dimensions are reported, not dropped"
      (is (= #{"is_aviation_order" "is_cancelled_order"}
             (into #{} (map :name) (:unsupported-dimensions (m/find-first #(= "sales" (-> % :metric :name)) (:metrics resolved)))))))))

(deftest yaml-round-trip-test
  (testing "the dimensions and mappings read back from YAML the way a serdes import reads them, and are valid"
    (let [config           tu/default-config
          files            (emit/files config (tu/resolve-manifest-map (tu/build-manifest {})))
          dir              (tu/temp-dir)
          _                (emit/write! dir files)
          {:keys [path entity]} (m/find-first :metric files)
          card             (yaml/parse-string (slurp (io/file dir path)) :key-fn serdes.ingest/parse-key)
          ;; stand in for the instance: a made-up id for every table and field the YAML names, the same every time
          ids              (atom {})
          id-for           (fn [portable-ref]
                             (or (get @ids portable-ref)
                                 (get (swap! ids #(assoc % portable-ref (inc (count %)))) portable-ref)))]
      (is (= (count (:dimensions entity)) (count (:dimensions card)) (count (:dimension_mappings card)))
          "every dimension and mapping is written")
      (binding [serdes/*import-table-fk* id-for
                serdes/*import-field-fk* id-for]
        (let [dimensions  (metrics/import-dimensions (:dimensions card))
              mappings    (metrics/import-dimension-mappings (:dimension_mappings card))
              mapping-for (m/index-by :dimension-id mappings)
              named       (fn [dimension-name] (m/find-first #(= dimension-name (:name %)) dimensions))]
          (testing "valid against the persisted schemas"
            (is (mr/validate ::lib-metric.schema/persisted-dimensions dimensions))
            (doseq [mapping mappings]
              (is (mr/validate ::lib-metric.schema/dimension-mapping mapping))))
          (testing "ids survive"
            (is (= (map :id (:dimensions entity)) (map :id dimensions)))
            (is (= (set (map :id dimensions)) (set (keys mapping-for)))))
          (testing "keyword values come back as keywords and the default survives"
            (is (= {:name "date_day", :default true, :default-temporal-unit :day, :effective-type :type/Date}
                   (select-keys (named "date_day") [:name :default :default-temporal-unit :effective-type])))
            (is (= [{:type :field, :field-id (id-for (tu/portable-field "fact_sales" "date_day"))}]
                   (:sources (named "date_day")))))
          (testing "a joined mapping's table and foreign key are bound to the instance's ids"
            (let [{:keys [table-id target]} (mapping-for (:id (named "product_category_dim")))]
              (is (= (id-for (tu/portable-table "dim_product")) table-id))
              (is (= (id-for (tu/portable-field "dim_product" "product_category")) (nth target 2)))
              (is (= (id-for (tu/portable-field "fact_sales" "product_key")) (get-in target [1 :source-field]))))))))))
