(ns metabase-enterprise.semantic-layer-import.dbt.dimensions-test
  "The curated dimension set of a converted metric: dbt dimensions on the metric's own semantic model become
  dimensions of its table, dimensions on the semantic models its foreign entities join to become dimensions reached by
  an implicit join through the entity's column, and the measure's `agg_time_dimension` is the default. Dimensions
  that cannot be a Metabase dimension (a dimension mapping targets a column, never SQL; a dimension set has no validity
  window) are reported per metric, not dropped.

  Everything is checked in the portable form [[emit/files]] writes, see [[tu/dimension-set]]. The written files being
  byte-identical across runs is covered by [[metabase-enterprise.semantic-layer-import.dbt.emit-test/determinism-test]],
  whose fixture carries dimensions."
  (:require
   [clojure.set :as set]
   [clojure.test :refer [are deftest is testing]]
   [medley.core :as m]
   [metabase-enterprise.semantic-layer-import.dbt.test-util :as tu :refer [fld]]
   [metabase-enterprise.semantic-layer-import.emit :as emit]
   [metabase-enterprise.serialization.v2.ingest :as serdes.ingest]
   [metabase.lib-metric.core :as lib-metric]
   [metabase.lib-metric.schema :as lib-metric.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.metrics.core :as metrics]
   [metabase.models.serialization :as serdes]
   [metabase.test :as mt]
   [metabase.util.malli.registry :as mr]))

(def ^:private main-group
  "The group of the metric's own columns, named after its semantic model, which has no label, so after its table."
  {:id (lib-metric/group-id "main" "fact_sales"), :type "main", :display-name "fact_sales"})

(def ^:private product-group
  "The group of the columns joined from `dim_product`, named after the semantic model's label."
  {:id (lib-metric/group-id "connection" "Product"), :type "connection", :display-name "Product"})

(def ^:private order-group
  "The group of the columns joined from `dim_order`, which has no label, so named after its table."
  {:id (lib-metric/group-id "connection" "dim_order"), :type "connection", :display-name "dim_order"})

(defn- local-dimension
  "What [[tu/dimension-set]] shows for a dimension over `column` of `fact_sales`, before its name and display name."
  [column base-type]
  {:effective-type base-type
   :status         :status/active
   :sources        [{:type :field, :field-id (tu/portable-field "fact_sales" column)}]
   :group          main-group
   :table-id       (tu/portable-table "fact_sales")
   :target         (fld column base-type)})

(defn- joined-dimension
  "What [[tu/dimension-set]] shows for a dimension over `column` of dimension table `table`, reached from `fact_sales`
  through `fk-column`, before its name and display name."
  [fk-column table column base-type group]
  {:effective-type base-type
   :status         :status/active
   :sources        [{:type :field, :field-id (tu/portable-field table column)}]
   :group          group
   :table-id       (tu/portable-table table)
   :target         (tu/joined-fld fk-column table column base-type)})

(deftest ^:parallel local-dimensions-test
  (let [dimensions (tu/dimension-set {})]
    (testing "a categorical dimension over a column of the metric's own table, its display name the humanized name"
      (is (= (assoc (local-dimension "status" :type/Text) :name "status", :display-name "Status")
             (get dimensions "status")))
      (is (= (assoc (local-dimension "amount" :type/Decimal) :name "amount", :display-name "Amount")
             (get dimensions "amount")))
      (is (= (assoc (local-dimension "is_returned" :type/Boolean) :name "is_returned", :display-name "Is Returned")
             (get dimensions "is_returned"))))
    (testing "a time dimension's granularity is its default temporal unit"
      (is (= (assoc (local-dimension "created_at" :type/DateTime)
                    :name "created_at", :display-name "Created At", :default-temporal-unit :day)
             (get dimensions "created_at"))))
    (testing "the measure's agg_time_dimension is the default dimension"
      (is (= (assoc (local-dimension "date_day" :type/Date)
                    :name "date_day", :display-name "Date Day", :default-temporal-unit :day, :default true)
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
                    :name "msrp", :display-name "Msrp")
             (get dimensions "msrp"))))
    (testing "a joined time dimension buckets like a local one"
      (is (= (assoc (joined-dimension "order_key" "dim_order" "order_date" :type/Date order-group)
                    :name "order_date", :display-name "Ordered on", :default-temporal-unit :day)
             (get dimensions "order_date")))
      (is (= (assoc (joined-dimension "product_key" "dim_product" "first_order_date" :type/Date product-group)
                    :name "first_order_date", :display-name "First Order Date", :default-temporal-unit :day)
             (get dimensions "first_order_date"))))
    (testing "the group is named after the semantic model's label, or its table when it has none"
      (is (= (assoc (joined-dimension "order_key" "dim_order" "status" :type/Text order-group)
                    :name "order_status_dim", :display-name "Order Status Dim")
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
      (is (not (contains? dimension :effective-type)))))
  (testing (str "a time dimension over such a column keeps its granularity as its default temporal unit: dbt says it"
                " is a time dimension, and the instance checks the column when the import binds it")
    (let [dimensions (tu/dimension-set {:columns {"date_day" ::tu/remove, "created_at" nil}})]
      (is (= {:name "date_day", :default true, :default-temporal-unit :day, :target (fld "date_day" nil)}
             (select-keys (get dimensions "date_day")
                          [:name :default :default-temporal-unit :target :effective-type])))
      (is (= {:name "created_at", :default-temporal-unit :day, :target (fld "created_at" nil)}
             (select-keys (get dimensions "created_at")
                          [:name :default :default-temporal-unit :target :effective-type]))))
    (testing "and a metric time_granularity applies to it"
      (is (= :month (:default-temporal-unit (get (tu/dimension-set {:columns {"date_day" ::tu/remove}
                                                                    :metric  {:time_granularity "month"}})
                                                 "date_day")))))
    (testing "on a joined model too"
      (let [untyped #(update-in % [:nodes tu/order-model-id :columns] dissoc "order_date")]
        (is (= :day (:default-temporal-unit (get (tu/dimension-set {:edit untyped}) "order_date"))))))
    (testing "a grain Metabase has no unit for is still reported"
      (is (re-find #"the metric's time grain \"retail_month\" has no Metabase temporal unit for \"date_day\""
                   (tu/unsupported {:columns {"date_day" ::tu/remove}, :metric {:time_granularity "retail_month"}}))))))

(deftest ^:parallel duplicate-dimension-name-test
  (let [same-name (tu/edit-semantic-model tu/order-sm-id
                                          #(update % :dimensions conj (tu/dimension "status" "categorical")))]
    (testing (str "a joined dimension named like one of the metric's own takes its dbt reference as its name, so no"
                  " two dimensions share one")
      (let [dimensions (tu/dimension-set {:edit same-name})
            names      (tu/dimension-names {:edit same-name})]
        (is (= ["date_day" "created_at" "status" "amount" "is_returned"
                "order_status_dim" "order_date" "order__status"
                "product_category_dim" "msrp" "first_order_date"]
               names))
        (is (apply distinct? names))
        (testing "the metric's own keeps its name and column"
          (is (= (assoc (local-dimension "status" :type/Text) :name "status", :display-name "Status")
                 (get dimensions "status"))))
        (testing "the joined one keeps its display name, column and group"
          (is (= (assoc (joined-dimension "order_key" "dim_order" "status" :type/Text order-group)
                        :name "order__status", :display-name "Status")
                 (get dimensions "order__status"))))))
    (testing "the other dimensions' ids do not change: they were derived from the reference all along"
      (let [ids-of (fn [tweaks] (into {} (map (juxt :name :id)) (:dimensions (tu/convert tweaks))))]
        (is (= (ids-of {}) (dissoc (ids-of {:edit same-name}) "order__status")))))
    (testing "two joined models sharing a dimension name are both renamed"
      (let [both (comp (tu/edit-semantic-model tu/order-sm-id
                                               #(update % :dimensions conj (tu/dimension "msrp" "categorical")))
                       #(assoc-in % [:nodes tu/order-model-id :columns "msrp"]
                                  {:name "msrp", :description "", :data_type "integer"}))]
        (is (= ["date_day" "created_at" "status" "amount" "is_returned"
                "order_status_dim" "order_date" "order__msrp"
                "product_category_dim" "product__msrp" "first_order_date"]
               (tu/dimension-names {:edit both})))))
    (testing "a filter still refers to the dimension by its dbt reference, as before"
      (is (= [[:= {} (tu/joined-fld "order_key" "dim_order" "status" :type/Text) "Shipped"]]
             (tu/filters {:edit   same-name
                          :metric {:filter (tu/where-filters "{{ Dimension('order__status') }} = 'Shipped'")}}))))))

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
      (is (re-find #"the metric's time dimension \"nope\" is not a dimension of table \"fact_sales\""
                   (reason-for (tu/unsupported-dimensions tweaks) "nope")))))
  (testing "an agg_time_dimension that cannot be a dimension leaves nothing as the default"
    (is (= [] (defaults-of {:measure {:agg_time_dimension "next_day"}})))))

(def ^:private sql-dimensions
  "The fixture's dimensions whose expr is SQL, on the fact table and on the joined ones."
  #{"is_big_sale" "next_day" "is_aviation_order" "is_cancelled_order"})

(def ^:private planes-filter
  (tu/where-filters "{{ Dimension('product__product_category_dim') }} = 'Planes'"))

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
    (let [sql-entity  (fn [entity]
                        (cond-> entity
                          (= "product" (:name entity)) (assoc :expr "upper(product_key)")))
          sql-product (tu/edit-semantic-model #(update % :entities (partial mapv sql-entity)))
          reasons     (tu/unsupported-dimensions {:edit sql-product})]
      (are [dimension-name] (re-find #"entity \"product\".*SQL" (reason-for reasons dimension-name))
        "product_category_dim"
        "msrp"
        "first_order_date")
      (is (not-any? #{"product_category_dim" "msrp" "first_order_date"}
                    (tu/dimension-names {:edit sql-product})))))
  (testing "so must the primary entity on the semantic model joined to"
    (let [reasons (tu/unsupported-dimensions
                   {:edit (tu/edit-semantic-model tu/product-sm-id
                                                  #(assoc-in % [:entities 0 :expr] "upper(product_key)"))})]
      (are [dimension-name] (re-find #"entity \"product\".*SQL" (reason-for reasons dimension-name))
        "product_category_dim"
        "msrp"
        "first_order_date")))
  (testing "two semantic models claiming the same primary entity is ambiguous"
    (let [twin      (-> (tu/product-semantic-model)
                        (assoc :unique_id "semantic_model.p.dim_product_2", :name "dim_product_2")
                        (update :dimensions conj (tu/dimension "twin_only" "categorical")))
          with-twin (fn [tweaks]
                      (assoc tweaks :edit #(assoc-in % [:semantic_models "semantic_model.p.dim_product_2"] twin)))
          reasons   (tu/unsupported-dimensions (with-twin {}))]
      (are [dimension-name] (re-find #"more than one semantic model has entity \"product\" as its primary or a unique"
                                     (reason-for reasons dimension-name))
        "product_category_dim"
        "msrp"
        "first_order_date"
        "twin_only")
      (testing "unless the :entity-models option says which one the entity joins to"
        (let [chosen     (with-twin {:entity-models {"product" "dim_product_2"}})
              dimensions (tu/dimension-set chosen)]
          (is (contains? dimensions "twin_only"))
          (is (= {:table-id (tu/portable-table "dim_product")
                  :target   (tu/joined-fld "product_key" "dim_product" "product_category" :type/Text)}
                 (select-keys (get dimensions "product_category_dim") [:table-id :target])))
          (is (not-any? #{"product_category_dim" "msrp" "first_order_date" "twin_only"}
                        (keys (tu/unsupported-dimensions chosen))))
          (testing "and a filter through the entity joins to the same model"
            (is (= [[:= {} (tu/joined-fld "product_key" "dim_product" "product_category" :type/Text) "Planes"]]
                   (tu/filters (with-twin {:entity-models {"product" "dim_product"}
                                           :metric        {:filter planes-filter}})))))))
      (testing "an :entity-models entry naming a model that is not primary for the entity is reported"
        (let [reasons (tu/unsupported-dimensions (with-twin {:entity-models {"product" "dim_order"}}))]
          (is (re-find (re-pattern (str ":entity-models names semantic model \"dim_order\" for entity \"product\", but"
                                        " the models with it as their primary or a unique entity are \"dim_product\","
                                        " \"dim_product_2\""))
                       (reason-for reasons "msrp")))))
      (testing "an entry for an entity exactly one model is primary for changes nothing"
        (is (= (tu/dimension-set {})
               (tu/dimension-set {:entity-models {"order" "dim_order"}})))))))

(defn- retype-entity
  "A `:edit` fn for [[tu/build-manifest]] that gives the entity `entity-name` of semantic model `sm-id` the type
  `entity-type`."
  [sm-id entity-name entity-type]
  (tu/edit-semantic-model sm-id (fn [model]
                                  (update model :entities
                                          (partial mapv #(cond-> %
                                                           (= entity-name (:name %)) (assoc :type entity-type)))))))

(deftest ^:parallel unique-entity-test
  (testing "a unique entity on the model joined to is a key into it, like its primary entity"
    ;; dim_product keyed by a new surrogate primary entity, with `product` a unique entity on it
    (let [product-sk    (tu/entity "product_sk" "primary" :expr "product_key")
          unique-target (comp (retype-entity tu/product-sm-id "product" "unique")
                              (tu/edit-semantic-model tu/product-sm-id #(update % :entities conj product-sk)))]
      (is (= (get (tu/dimension-set {}) "product_category_dim")
             (get (tu/dimension-set {:edit unique-target}) "product_category_dim")))
      (is (= (tu/dimension-names {}) (tu/dimension-names {:edit unique-target})))
      (testing "and a filter through the entity joins to it"
        (is (= [[:= {} (tu/joined-fld "product_key" "dim_product" "product_category" :type/Text) "Planes"]]
               (tu/filters {:edit   unique-target
                            :metric {:filter planes-filter}}))))))
  (testing "a unique entity on the metric's own model reaches the model keyed by it, like a foreign entity"
    (let [unique-source (retype-entity tu/sm-id "order" "unique")]
      (is (= (get (tu/dimension-set {}) "order_status_dim")
             (get (tu/dimension-set {:edit unique-source}) "order_status_dim")))
      (is (= (tu/dimension-names {}) (tu/dimension-names {:edit unique-source})))
      (is (= [[:= {} (tu/joined-fld "order_key" "dim_order" "status" :type/Text) "Shipped"]]
             (tu/filters {:edit   unique-source
                          :metric {:filter tu/shipped-order-filter}})))))
  (testing (str "a unique entity no other model is keyed by is just a key: nothing joined, nothing reported, no join"
                " to the model itself")
    (let [sale-alt    (tu/entity "sale_alt" "unique" :expr "fact_sales_key")
          lone-unique (tu/edit-semantic-model #(update % :entities conj sale-alt))]
      (is (= (tu/dimension-names {}) (tu/dimension-names {:edit lone-unique})))
      (is (= (tu/unsupported-dimensions {}) (tu/unsupported-dimensions {:edit lone-unique})))))
  (testing "a foreign entity on the model joined to is not a key into it"
    (let [foreign-target (retype-entity tu/product-sm-id "product" "foreign")
          reasons        (tu/unsupported-dimensions {:edit foreign-target})]
      (is (not-any? #{"product_category_dim" "msrp" "first_order_date"} (tu/dimension-names {:edit foreign-target})))
      (is (= {} (select-keys reasons ["product_category_dim" "msrp" "first_order_date"]))
          "no model is keyed by the entity, so there is nothing behind it to report")
      (is (re-find #"no semantic model has entity \"product\" as its primary or a unique entity"
                   (tu/unsupported {:edit   foreign-target
                                    :metric {:filter planes-filter}}))))))

(def ^:private order-dimensions
  "The dimensions of `dim_order`, column and SQL alike."
  ["order_status_dim" "is_cancelled_order" "order_date"])

(deftest ^:parallel cross-database-join-test
  (let [other-db (fn [m]
                   (-> m
                       (assoc-in [:semantic_models tu/order-sm-id :node_relation :database] "other_db")
                       (assoc-in [:nodes tu/order-model-id :database] "other_db")))
        config   {:databases {"dbt_bi" tu/db, "other_db" "Other DB"}}
        reason   (str "table \"dim_order\" is in Metabase database \"Other DB\", not \"Sales DB\"; a join across"
                      " databases is not supported")]
    (testing (str "a join to a semantic model in another Metabase database cannot be made, so every dimension behind"
                  " it is reported with that reason")
      (let [reasons (tu/unsupported-dimensions {:config config, :edit other-db})]
        (doseq [dimension-name order-dimensions]
          (testing dimension-name
            (is (= reason (reason-for reasons dimension-name)))))
        (is (not-any? (set order-dimensions) (tu/dimension-names {:config config, :edit other-db})))))
    (testing "and a filter through the entity is reported the same way"
      (is (= (str "filter " (pr-str tu/shipped-order-template) ": " reason)
             (tu/unsupported {:config config, :edit other-db, :metric {:filter tu/shipped-order-filter}}))))))

(deftest ^:parallel primary-entity-without-entity-test
  (testing "a semantic model whose primary_entity names no entity of its own has no column to join on"
    (let [virtual-order (tu/edit-semantic-model tu/order-sm-id #(assoc % :primary_entity "order", :entities []))
          reason        (str "semantic model \"dim_order\" names \"order\" as its primary_entity but has no entity of"
                             " that name to join on")
          reasons       (tu/unsupported-dimensions {:edit virtual-order})]
      (doseq [dimension-name order-dimensions]
        (testing dimension-name
          (is (= reason (reason-for reasons dimension-name)))))
      (is (= (str "filter " (pr-str tu/shipped-order-template) ": " reason)
             (tu/unsupported {:edit virtual-order, :metric {:filter tu/shipped-order-filter}}))))))

(deftest ^:parallel literal-expr-test
  (testing "a dimension whose expr is a literal is neither a column nor SQL, and is reported as such"
    (let [literal-dimensions (tu/edit-semantic-model #(update % :dimensions conj
                                                              (tu/dimension "one" "categorical" :expr "1")
                                                              (tu/dimension "star" "categorical" :expr "*")
                                                              (tu/dimension "yes" "categorical" :expr "true")))
          reasons            (tu/unsupported-dimensions {:edit literal-dimensions})]
      (are [dimension-name reason] (= reason (reason-for reasons dimension-name))
        "one"  "dimension \"one\" is \"1\", not a column"
        "star" "dimension \"star\" is \"*\", not a column"
        "yes"  "dimension \"yes\" is \"true\", not a column")
      (testing "in a filter too"
        (is (re-find #"\"1\" is neither a column nor a SQL expression"
                     (tu/unsupported {:edit   literal-dimensions
                                      :metric {:filter (tu/where-filters
                                                        "{{ Dimension('fact_sales_key__one') }} = 1")}}))))))
  (testing "so is an entity whose expr is a literal, when a filter refers to it"
    (is (re-find #"\"1\" is neither a column nor a SQL expression"
                 (tu/unsupported {:edit   (tu/edit-semantic-model
                                           #(update % :entities conj (tu/entity "one" "foreign" :expr "1")))
                                  :metric {:filter (tu/where-filters "{{ Entity('one') }} = 1")}})))))

(deftest ^:parallel metric-time-granularity-test
  (testing "a metric's time_granularity is the default temporal unit of its default dimension"
    (are [grain unit] (= (assoc (local-dimension "date_day" :type/Date)
                                :name "date_day", :display-name "Date Day", :default true, :default-temporal-unit unit)
                         (get (tu/dimension-set {:metric {:time_granularity grain}}) "date_day"))
      "month"          :month
      "year"           :year
      ;; a fiscal quarter is read as a calendar quarter until custom calendars are supported
      "fiscal_quarter" :quarter))
  (testing "the other time dimensions keep their own granularity"
    (is (= :day (:default-temporal-unit (get (tu/dimension-set {:metric {:time_granularity "month"}}) "created_at")))))
  (testing "without one, the dimension's own granularity is the default unit"
    (is (= :day (:default-temporal-unit (get (tu/dimension-set {}) "date_day")))))
  (testing (str "a grain Metabase cannot bucket the dimension by is reported, as a custom calendar grain in a"
                " TimeDimension is")
    (are [grain re] (re-find re (tu/unsupported {:metric {:time_granularity grain}}))
      "retail_month" #"the metric's time grain \"retail_month\" has no Metabase temporal unit for \"date_day\""
      ;; date_day is a date, which has no hours
      "hour"         #"the metric's time grain \"hour\" has no Metabase temporal unit for \"date_day\""))
  (testing "a metric with no default dimension has nothing to apply it to"
    (is (= [] (defaults-of {:metric {:time_granularity "retail_month"}
                            :edit   (tu/edit-semantic-model #(assoc % :defaults nil))})))))

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

(deftest ^:parallel flexanalytics-dimensions-test
  (let [resolved   (tu/flexanalytics-resolved)
        entity-for (fn [metric-name] (tu/card-entity tu/default-config resolved metric-name))
        names-of   (fn [entity] (mapv :name (:dimensions entity)))
        sales      (entity-for "sales")
        target-of  (fn [entity dimension-name]
                     (let [dimension-id (:id (m/find-first #(= dimension-name (:name %)) (:dimensions entity)))]
                       (:target (m/find-first #(= dimension-id (:dimension-id %)) (:dimension_mappings entity)))))]
    (testing (str "sales can be broken out by product_category_dim and order_status_dim, and date_day is its"
                  " default")
      (is (= ["date_day" "order_status_dim" "product_category_dim"] (names-of sales)))
      (is (= ["date_day"] (into [] (comp (filter :default) (map :name)) (:dimensions sales)))))
    (testing "the joined dimensions reach their tables through the fact table's keys"
      (is (= (tu/joined-fld "product_key" "dim_product" "product_category" :type/Text)
             (target-of sales "product_category_dim")))
      (is (= (tu/joined-fld "order_key" "dim_order" "status" :type/Text)
             (target-of sales "order_status_dim"))))
    (testing "groups are named after the semantic models' labels"
      (is (= [["date_day" "main" "Sales Fact"]
              ["order_status_dim" "connection" "Order"]
              ["product_category_dim" "connection" "Product"]]
             (mapv (juxt :name (comp :type :group) (comp :display-name :group)) (:dimensions sales)))))
    (testing "every metric of the fact table gets the same dimensions"
      (doseq [metric-name ["price" "quantity" "target" "row_count" "customer_count" "product_count" "order_count"
                           "sales_to_target"]]
        (testing metric-name
          (is (= (names-of sales) (names-of (entity-for metric-name)))))))
    (testing "the SQL dimensions are reported, not dropped"
      (is (= #{"is_aviation_order" "is_cancelled_order"}
             (into #{} (map :name) (:unsupported-dimensions (tu/resolved-metric-named resolved "sales"))))))))

(deftest yaml-round-trip-test
  (testing "the dimensions and mappings read back from YAML the way a serdes import reads them, and are valid"
    (mt/with-temp-dir [dir nil]
      (let [files            (emit/files tu/default-config (tu/resolve-manifest-map (tu/build-manifest {})))
            _                (emit/write! dir files)
            {:keys [path entity]} (m/find-first :resolved files)
            card             (tu/read-yaml dir path :key-fn serdes.ingest/parse-key)
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
                (is (= (id-for (tu/portable-field "fact_sales" "product_key"))
                       (get-in target [1 :source-field])))))))))))

(deftest ^:parallel status-test
  (let [resolved (tu/resolve-manifest-map (tu/build-manifest {}))
        {:keys [dimensions dimension-mappings]} (tu/resolved-metric-named resolved "m")]
    (testing "every dimension is written active, the status the instance gives a dimension whose column it finds"
      (is (seq dimensions))
      (is (every? #(= :status/active (:status %)) dimensions)))
    (testing (str "so the instance's first refresh of the set, which finds every column the mappings target, changes"
                  " nothing and does not rewrite the card")
      (let [computed (mapv (fn [mapping]
                             {:dimension {:id nil, :name (:dimension-id mapping)}
                              :mapping   (dissoc mapping :dimension-id)})
                           dimension-mappings)
            {refreshed :dimensions} (lib-metric/reconcile-existing-dimensions computed dimensions dimension-mappings)]
        (is (= (count dimensions) (count refreshed)))
        (is (not (lib-metric/dimensions-changed? dimensions refreshed)))
        (testing "where a set written without a status would be rewritten"
          (is (lib-metric/dimensions-changed? (mapv #(dissoc % :status) dimensions) refreshed)))))))

(deftest ^:parallel display-name-test
  (let [relabel (fn [dimension-name label]
                  (tu/edit-semantic-model
                   #(update % :dimensions (partial mapv (fn [{:keys [name] :as dimension}]
                                                          (cond-> dimension
                                                            (= dimension-name name) (assoc :label label)))))))
        name-of (fn [tweaks dimension-name] (:display-name (get (tu/dimension-set tweaks) dimension-name)))]
    (testing "a dimension's label is its display name"
      (is (= "Day of sale" (name-of {:edit (relabel "date_day" "Day of sale")} "date_day"))))
    (testing "without one, the humanized name, as the instance names a Field"
      (is (= "Date Day" (name-of {} "date_day")))
      (is (= "Is Returned" (name-of {} "is_returned"))))
    (testing "a blank label is no label"
      (is (= "Date Day" (name-of {:edit (relabel "date_day" "")} "date_day")))
      (is (= "Status" (name-of {:edit (relabel "status" "  ")} "status"))))
    (testing "the name itself is untouched"
      (is (= "date_day" (:name (get (tu/dimension-set {}) "date_day")))))))

(deftest ^:parallel validity-params-test
  (let [scd     (tu/edit-semantic-model
                 #(update % :dimensions conj
                          (assoc-in (tu/dimension "valid_from" "time") [:type_params :validity_params]
                                    {:is_start true, :is_end false})
                          (assoc-in (tu/dimension "valid_to" "time") [:type_params :validity_params]
                                    {:is_start false, :is_end true})))
        reasons (tu/unsupported-dimensions {:edit scd})]
    (testing "a time dimension that bounds a slowly changing dimension's validity window is reported, not written"
      (is (= (str "dimension \"valid_from\" bounds a validity window, the start of a slowly changing dimension's"
                  " versions; a dimension set has no notion of one")
             (reason-for reasons "valid_from")))
      (is (= (str "dimension \"valid_to\" bounds a validity window, the end of a slowly changing dimension's"
                  " versions; a dimension set has no notion of one")
             (reason-for reasons "valid_to")))
      (is (not-any? #{"valid_from" "valid_to"} (tu/dimension-names {:edit scd}))))
    (testing "the other dimensions are unaffected"
      (is (= (tu/dimension-set {}) (tu/dimension-set {:edit scd}))))))

(deftest ^:parallel natural-entity-test
  (testing "a foreign entity that joins to a model's natural entity, a slowly changing dimension, is reported once"
    (let [scd-product (retype-entity tu/product-sm-id "product" "natural")
          reason      (str "entity \"product\" is the natural entity of semantic model \"dim_product\", a slowly"
                           " changing dimension; a join to it needs the validity window of its time dimensions,"
                           " which an implicit join cannot express")
          reasons     (tu/unsupported-dimensions {:edit scd-product})]
      (is (= reason (reason-for reasons "product")))
      (testing "naming the entity, not its dimensions"
        (is (= {} (select-keys reasons ["product_category_dim" "msrp" "first_order_date" "is_aviation_order"])))
        (is (not-any? #{"product_category_dim" "msrp" "first_order_date"} (tu/dimension-names {:edit scd-product}))))
      (testing "and a filter through the entity is reported the same way"
        (is (= (str "filter " (pr-str "{{ Dimension('product__product_category_dim') }} = 'Planes'") ": " reason)
               (tu/unsupported {:edit scd-product, :metric {:filter planes-filter}}))))))
  (testing "a natural entity on the metric's own model is reported once when another model is keyed by it"
    (let [natural-order (retype-entity tu/sm-id "order" "natural")
          reasons       (tu/unsupported-dimensions {:edit natural-order})]
      (is (= (str "entity \"order\" is a natural entity, the key of a slowly changing dimension; a join from it to"
                  " \"dim_order\" needs the validity window of this model's time dimensions, which an implicit join"
                  " cannot express")
             (reason-for reasons "order")))
      (is (= {} (select-keys reasons order-dimensions)))
      (is (not-any? (set order-dimensions) (tu/dimension-names {:edit natural-order})))))
  (testing "a natural entity no other model is keyed by is just a key: nothing joined, nothing reported"
    (let [natural-customer (retype-entity tu/sm-id "customer" "natural")]
      (is (= (tu/dimension-names {}) (tu/dimension-names {:edit natural-customer})))
      (is (= (tu/unsupported-dimensions {}) (tu/unsupported-dimensions {:edit natural-customer}))))))

(defn- derived-over
  "[[tu/build-manifest]] tweaks for a derived metric `m`, `sales - target`, over simple metrics `sales` and `target`
  whose measures have the `agg_time_dimension`s `sales-time` and `target-time`, with `metric` merged into `m`."
  [sales-time target-time metric]
  (let [simple (fn [base measure-name]
                 (-> base
                     (assoc :name measure-name, :unique_id (str "metric.p." measure-name), :label measure-name
                            :type "simple", :time_granularity nil, :depends_on {:macros [], :nodes [tu/sm-id]})
                     (assoc-in [:type_params :expr] nil)
                     (assoc-in [:type_params :metrics] [])
                     (tu/over-measure measure-name)))]
    {:measures    [(assoc (tu/base-measure) :name "sales", :agg_time_dimension sales-time)
                   (assoc (tu/base-measure) :name "target", :expr "target", :agg_time_dimension target-time)]
     :columns     {"target" "float"}
     :metric      (merge {:type "derived", :depends_on {:macros [], :nodes ["metric.p.sales" "metric.p.target"]}}
                         metric)
     :type-params {:measure        nil
                   :expr           "sales - target"
                   :metrics        [(tu/metric-input "sales") (tu/metric-input "target")]
                   :input_measures [(tu/input-measure {:name "sales"}) (tu/input-measure {:name "target"})]}
     :edit        (comp (tu/add-metric "sales" #(simple % "sales"))
                        (tu/add-metric "target" #(simple % "target")))}))

(deftest ^:parallel composed-time-granularity-test
  (testing "a derived metric whose inputs agree on an agg_time_dimension buckets it by its time_granularity"
    (let [dimensions (tu/dimension-set (derived-over "created_at" "created_at" {:time_granularity "month"}))]
      (is (= {:default true, :default-temporal-unit :month} (select-keys (get dimensions "created_at")
                                                                         [:default :default-temporal-unit])))
      (is (not (contains? (tu/unsupported-dimensions (derived-over "created_at" "created_at"
                                                                   {:time_granularity "month"}))
                          "time dimension")))))
  (testing "inputs that disagree leave the metric no default dimension, and its time_granularity is reported"
    (let [tweaks (derived-over "date_day" "created_at" {:time_granularity "month"})]
      (is (= [] (defaults-of tweaks)))
      (is (= (str "the metric's time grain \"month\" applies to its time dimension, and the metric has none: its"
                  " inputs do not agree on one, or it declares none")
             (reason-for (tu/unsupported-dimensions tweaks) "time dimension")))
      (testing "the dimensions themselves are the inputs' table's, at their own grain"
        (is (= (tu/dimension-names {}) (tu/dimension-names tweaks)))
        (is (= :day (:default-temporal-unit (get (tu/dimension-set tweaks) "date_day")))))))
  (testing "without a time_granularity there is nothing to report"
    (is (not (contains? (tu/unsupported-dimensions (derived-over "date_day" "created_at" {})) "time dimension")))))
