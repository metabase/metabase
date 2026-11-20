(ns metabase-enterprise.semantic-layer-import.core-test
  "The import of a semantic layer written straight in the IR, with no parser behind it: what any source's
  [[interface/raw->ir]] makes goes through [[semantic-layer-import/convert!]] the way dbt's does. The source here is a
  made-up tool, `acme`, so nothing dbt-specific can creep in unnoticed: its table names its own key as an alias, joins
  through a key column, and its filters are SQL with placeholders for references to the tables' dimensions."
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer [deftest is testing]]
   [mb.hawk.assert-exprs]
   [metabase-enterprise.semantic-layer-import.core :as semantic-layer-import]
   [metabase-enterprise.semantic-layer-import.ids :as ids]
   [metabase-enterprise.semantic-layer-import.interface :as interface]
   [metabase-enterprise.semantic-layer-import.schemas.ir :as ir]
   [metabase.test :as mt]
   [metabase.util.malli.registry :as mr]
   [metabase.util.yaml :as yaml]))

(set! *warn-on-reflection* true)

(defn- column [column-name data-type]
  [column-name {:name column-name, :data-type data-type, :description nil, :quoted? false}])

(defn- dimension [dimension-name dimension-type & {:keys [grain]}]
  {:name dimension-name, :type dimension-type, :expr dimension-name, :grain grain, :validity nil, :label nil
   :description nil})

(def ^:private orders
  {:name        "orders"
   :label       "Orders"
   :description nil
   :relation    {:database "shop", :schema "public", :table "orders", :quoted #{}}
   :columns     (into {} [(column "id" "integer")
                          (column "customer_id" "integer")
                          (column "total" "numeric")
                          (column "status" "text")
                          (column "created_at" "timestamp")])
   :dimensions  [(dimension "status" :categorical)
                 (dimension "created_at" :time :grain "day")]
   :keys        [{:name "order", :expr "id"}
                 {:name "customer", :expr "customer_id"}]
   :joins       [{:name "customer", :table "customers", :source-column "customer_id"}]
   :aliases     #{"orders"}})

(def ^:private customers
  {:name        "customers"
   :label       nil
   :description nil
   :relation    {:database "shop", :schema "public", :table "customers", :quoted #{}}
   :columns     (into {} [(column "id" "integer")
                          (column "segment" "text")])
   :dimensions  [(dimension "segment" :categorical)]
   :keys        [{:name "customer", :expr "id"}]
   :joins       []
   :aliases     #{"customers"}})

(defn- metric [metric-name & {:as more}]
  (merge {:type            :simple
          :name            metric-name
          :unique-id       (str "acme.metric." metric-name)
          :label           metric-name
          :description     nil
          :filters         []
          :fill-nulls-with nil
          :time-grain      nil
          :meta            nil}
         more))

(def ^:private semantic-layer
  {:source      {:tool "acme", :version "1.0", :project "shop"}
   :warehouse   {:type "postgres", :driver :postgres}
   :tables      {"orders" orders, "customers" customers}
   :metrics     [(metric "revenue"
                         :table          "orders"
                         :aggregation    {:operator :sum, :expr "total"}
                         :time-dimension "created_at"
                         :time-grain     "month"
                         :filters        [{:text "{orders.status} <> 'cancelled'"
                                           :sql "ref_0 <> 'cancelled'"
                                           :references {"ref_0" {:kind :dimension, :path ["orders"], :name "status"
                                                                 :bucket nil}}}])
                 (metric "vip_orders"
                         :table          "orders"
                         :aggregation    {:operator :count, :expr "*"}
                         :time-dimension "created_at"
                         :filters        [{:text       "{customers.segment} = 'vip'"
                                           :sql        "ref_0 = 'vip'"
                                           :references {"ref_0" {:kind :dimension, :path ["customer"]
                                                                 :name "segment", :bucket nil}}}])
                 (metric "order_count"
                         :table          "orders"
                         :aggregation    {:operator :count, :expr "*"}
                         :time-dimension "created_at")
                 (metric "average_order_value"
                         :type        :ratio
                         :numerator   {:metric "revenue", :alias nil, :filters []}
                         :denominator {:metric "order_count", :alias nil, :filters []})
                 (metric "median_total"
                         :table          "orders"
                         :aggregation    {:operator :median, :expr "total"}
                         :time-dimension "created_at")]
   :unsupported [{:kind :metric, :name "funnel", :unique-id "acme.metric.funnel", :reason "funnels are acme's own"}]})

;; acme writes its semantic layer in the IR already, so its raw is the IR
(defmethod interface/raw->ir ::acme
  [_source-type semantic-layer _options]
  semantic-layer)

(def ^:private config
  {:databases     {"shop" "Shop DB"}
   :driver        :postgres
   :creator-email "admin@example.com"})

(defn- fld
  "A field ref as the YAML reads back, clause names as strings."
  ([table column-name]
   ["field" {} ["Shop DB" "public" table column-name]])
  ([table column-name source-column]
   ["field" {:source-field ["Shop DB" "public" "orders" source-column]} ["Shop DB" "public" table column-name]]))

(deftest hand-written-ir-test
  (is (mr/validate ::ir/semantic-layer semantic-layer))
  (mt/with-temp-dir [dir nil]
    (let [out-dir   (str (io/file dir "out"))
          report    (semantic-layer-import/convert! {:type ::acme, :raw semantic-layer, :out-dir out-dir
                                                     :config config})
          read-yaml #(yaml/parse-string (slurp (io/file out-dir %)))
          card      (fn [metric-name]
                      (read-yaml (:path (some #(when (= metric-name (:name %)) %) (:converted report)))))
          stage     (fn [metric-name]
                      (-> (card metric-name) :dataset_query :stages first))]
      (is (mr/validate ::semantic-layer-import/report report))
      (testing "every metric converts, and what the source reported is carried over"
        (is (= [[:metric "revenue"] [:metric "vip_orders"] [:metric "order_count"] [:metric "median_total"]
                [:metric "average_order_value"]]
               (map (juxt :kind :name) (:converted report))))
        (is (= [{:kind :metric, :name "funnel", :reason "funnels are acme's own"}] (:unsupported report)))
        (is (= [] (:errors report))))
      (testing "the collection is named after the tool, and every id is the tool's"
        (is (= {:name "acme metrics", :description "Metrics imported from acme."}
               (select-keys (read-yaml "collections/main/acme_metrics.yaml") [:name :description])))
        (is (= (ids/metric-entity-id (:source semantic-layer) "Shop DB" (second (:metrics semantic-layer)))
               (:entity_id (card "vip_orders")))))
      (testing "a filter through an alias of the table is on the table itself"
        (is (=? {:source-table ["Shop DB" "public" "orders"]
                 :aggregation  [["sum" {} (fld "orders" "total")]]
                 :filters      [["not" {} ["=" {} (fld "orders" "status") "cancelled"]]]}
                (stage "revenue"))))
      (testing "a filter through a join is on the joined table, reached through the join's source column"
        (is (=? {:aggregation [["count" {}]]
                 :filters     [["=" {} (fld "customers" "segment" "customer_id") "vip"]]}
                (stage "vip_orders"))))
      (testing "a ratio divides references to its inputs' cards"
        (is (= [["/" {}
                 ["metric" {} (:entity_id (card "revenue"))]
                 ["metric" {} (:entity_id (card "order_count"))]]]
               (:aggregation (stage "average_order_value")))))
      (testing (str "the dimension set: the table's own, the default bucketed by the metric's time grain, and the"
                    " joined ones")
        (is (= [["status" nil] ["created_at" "month"] ["segment" nil]]
               (map (juxt :name :default-temporal-unit) (:dimensions (card "revenue")))))
        (is (= ["main" "main" "connection"]
               (map (comp :type :group) (:dimensions (card "revenue")))))))))

(deftest unsupported-join-test
  (testing (str "a join the source could not make reports what it names in the dimension set, and a filter through it"
                " reports the metric")
    (let [broken  {:name "customer", :reason "acme cannot join here", :unreachable ["segment"]}
          layer   (-> semantic-layer
                      (assoc-in [:tables "orders" :joins] [broken])
                      (update :metrics #(filterv (comp #{"revenue" "vip_orders"} :name) %)))]
      (mt/with-temp-dir [dir nil]
        (let [report (semantic-layer-import/convert! {:type    ::acme
                                                      :raw     layer
                                                      :out-dir (str (io/file dir "out"))
                                                      :config  config})]
          (is (= [{:name "segment", :reason "acme cannot join here"}]
                 (:unsupported-dimensions (first (:converted report)))))
          (is (= [{:kind :metric, :name "funnel", :reason "funnels are acme's own"}
                  {:kind   :metric
                   :name   "vip_orders"
                   :reason "filter \"{customers.segment} = 'vip'\": acme cannot join here"}]
                 (:unsupported report))))))))

(deftest unknown-source-test
  (testing "a :type no source implements fails the run before anything is written"
    (mt/with-temp-dir [dir nil]
      (let [out-dir (io/file dir "out")]
        (is (thrown-with-msg? IllegalArgumentException
                              #"No method in multimethod 'raw->ir' for dispatch value: :no-such-source"
                              (semantic-layer-import/convert! {:type    :no-such-source
                                                               :raw     semantic-layer
                                                               :out-dir (str out-dir)
                                                               :config  config})))
        (is (not (.exists out-dir)))))))
