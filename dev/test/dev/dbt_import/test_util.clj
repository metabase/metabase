(ns dev.dbt-import.test-util
  "Shared fixture for the converter's tests.

  [[build-manifest]] makes a small manifest in the shape `dbt parse` writes (manifest v12, dbt 1.12): a fact table
  `fact_sales` with one metric `m` (sum of `sales`), and two dimension tables, `dim_product` and `dim_order`, that its
  `product` and `order` entities join to, the way the flexanalytics project is laid out; tweaked per test. [[convert]]
  runs it through the whole pipeline ([[dbt-manifest/decode-manifest]] → [[parse/parse-manifest]] →
  [[resolve/resolve-manifest]] → [[emit/files]]); [[aggregation]], [[filters]], [[dimension-set]] and [[unsupported]]
  pick out the clause the metric converted to, its filters, its curated dimensions, or the reason it did not, for an
  `is` to compare against."
  (:require
   [dev.dbt-import.emit :as emit]
   [dev.dbt-import.parse :as parse]
   [dev.dbt-import.resolve :as resolve]
   [dev.dbt-import.schemas.dbt-manifest :as dbt-manifest]
   [medley.core :as m]
   [metabase.util.json :as json])
  (:import
   (java.nio.file Files)
   (java.nio.file.attribute FileAttribute)
   (java.util UUID)))

(set! *warn-on-reflection* true)

(def db "The Metabase database the fixture's warehouse database `dbt_bi` maps to." "Sales DB")

(def default-config
  {:databases     {"dbt_bi" db}
   :driver        :postgres
   :creator-email "admin@example.com"})

(def model-id "model.p.fact_sales")
(def sm-id "semantic_model.p.fact_sales")
(def product-model-id "model.p.dim_product")
(def product-sm-id "semantic_model.p.dim_product")
(def order-model-id "model.p.dim_order")
(def order-sm-id "semantic_model.p.dim_order")

(defn fld
  "The `:field` clause serdes writes for `column` on `public.fact_sales`. A nil `base-type` means a column whose type the
  manifest does not declare, which the converter types as `:type/*` for the instance to fill in."
  ([column base-type]
   (fld "public" "fact_sales" column base-type))
  ([schema table column base-type]
   (let [base-type (or base-type :type/*)]
     [:field {:base-type base-type, :effective-type base-type} [db schema table column]])))

(defn joined-fld
  "The `:field` clause serdes writes for `column` on dimension table `public.<table>`, reached from `fact_sales` through
  the foreign key column `fk-column`: an implicit join, which Metabase spells as `:source-field`."
  [fk-column table column base-type]
  (assoc-in (fld "public" table column base-type) [1 :source-field] [db "public" "fact_sales" fk-column]))

(defn portable-table
  "The `[database schema table]` serdes writes for `public.<table>`."
  [table]
  [db "public" table])

(defn portable-field
  "The `[database schema table column]` serdes writes for `column` on `public.<table>`."
  [table column]
  [db "public" table column])

(defn group-id
  "The id Metabase gives a dimension group, derived from its type and display name the same way
  `metabase.lib-metric.dimension.jvm/group-id` does, so the converter's groups are the groups the instance computes."
  [group-type display-name]
  (str (UUID/nameUUIDFromBytes (.getBytes (str group-type "/" display-name) "UTF-8"))))

(def pg-columns
  "Columns of `fact_sales`: name, declared Postgres `data_type`, the base type Postgres sync gives it, and a coarse
  kind used to decide which aggregations make sense over it."
  [["sales"         "float"                    :type/Float               :numeric]
   ["quantity"      "integer"                  :type/Integer             :numeric]
   ["amount"        "numeric(10, 2)"           :type/Decimal             :numeric]
   ["big_amount"    "bigint"                   :type/BigInteger          :numeric]
   ["small_qty"     "smallint"                 :type/Integer             :numeric]
   ["ratio"         "double precision"         :type/Float               :numeric]
   ["real_col"      "real"                     :type/Float               :numeric]
   ["price_money"   "money"                    :type/Decimal             :numeric]
   ["serial_id"     "serial"                   :type/Integer             :numeric]
   ["is_returned"   "boolean"                  :type/Boolean             :boolean]
   ["flag_bool"     "bool"                     :type/Boolean             :boolean]
   ["customer_key"  "text"                     :type/Text                :text]
   ["status"        "character varying(20)"    :type/Text                :text]
   ["code"          "char(3)"                  :type/Text                :text]
   ["order_uuid"    "uuid"                     :type/UUID                :uuid]
   ["payload"       "jsonb"                    :type/JSON                :json]
   ["date_day"      "date"                     :type/Date                :temporal]
   ["created_at"    "timestamp"                :type/DateTime            :temporal]
   ["created_at_tz" "timestamp with time zone" :type/DateTimeWithLocalTZ :temporal]
   ["shift_time"    "time"                     :type/Time                :temporal]
   ["blob"          "bytea"                    :type/Binary              :binary]])

(def ^:private base-columns
  (into {"fact_sales_key" "integer", "order_key" "text", "product_key" "text"}
        (map (fn [[column-name data-type]] [column-name data-type]))
        pg-columns))

(def product-columns
  "Columns of `dim_product` (name → data_type)."
  {"product_key"      "text"
   "product_category" "text"
   "msrp"             "integer"
   "first_order_date" "date"})

(def order-columns
  "Columns of `dim_order` (name → data_type)."
  {"order_key"  "text"
   "status"     "text"
   "order_date" "date"})

(defn- column-map
  "`columns` (name → data_type) as a node's `columns` map. A data type of `::remove` drops the column."
  [columns]
  (into {}
        (keep (fn [[column-name data-type]]
                (when-not (= data-type ::remove)
                  [column-name {:name column-name, :description "", :data_type data-type}])))
        columns))

(defn- node
  "A model node over `public.<table-name>` with `columns` (name → data_type)."
  [node-id table-name columns]
  {:unique_id     node-id
   :resource_type "model"
   :name          table-name
   :database      "dbt_bi"
   :schema        "public"
   :alias         table-name
   :relation_name (format "\"dbt_bi\".\"public\".\"%s\"" table-name)
   :description   ""
   :columns       (column-map columns)})

(defn model-node
  "A model node over `public.fact_sales` with `columns` (name → data_type) merged into the default column set."
  [columns]
  (node model-id "fact_sales" (merge base-columns columns)))

(defn dimension
  "A `dimensions[]` entry as the manifest writes it. `opts` are `:expr`, `:label`, `:description` and, for a time
  dimension, `:granularity` (default `day`)."
  [dimension-name dimension-type & {:keys [expr label description granularity]}]
  {:name         dimension-name
   :type         dimension-type
   :description  description
   :label        label
   :is_partition false
   :type_params  (when (= dimension-type "time")
                   {:time_granularity (or granularity "day"), :validity_params nil})
   :expr         expr})

(defn entity
  "An `entities[]` entry as the manifest writes it."
  [entity-name entity-type & {:keys [expr label]}]
  {:name entity-name, :type entity-type, :description nil, :label label, :role nil, :expr expr})

(defn base-measure
  "The default measure: `sum` of `sales`."
  []
  {:name                   "m"
   :agg                    "sum"
   :description            nil
   :label                  nil
   :create_metric          false
   :expr                   "sales"
   :agg_params             nil
   :non_additive_dimension nil
   :agg_time_dimension     nil
   :config                 {:meta {}}})

(defn- semantic-model [measures]
  {:unique_id      sm-id
   :name           "fact_sales"
   :label          nil
   :description    nil
   :model          "ref('fact_sales')"
   :node_relation  {:alias         "fact_sales"
                    :schema_name   "public"
                    :database      "dbt_bi"
                    :relation_name "\"dbt_bi\".\"public\".\"fact_sales\""}
   :defaults       {:agg_time_dimension "date_day"}
   :primary_entity nil
   ;; `customer` joins to nothing: the fixture has no semantic model whose primary entity it is
   :entities       [(entity "fact_sales_key" "primary")
                    (entity "customer" "foreign" :expr "customer_key")
                    (entity "order" "foreign" :expr "order_key")
                    (entity "product" "foreign" :expr "product_key")]
   :dimensions     [(dimension "date_day" "time")
                    (dimension "created_at" "time")
                    ;; a time dimension whose expr is SQL, which cannot be bucketed
                    (dimension "next_day" "time" :expr "date_day + 1")
                    (dimension "status" "categorical")
                    (dimension "amount" "categorical")
                    (dimension "is_returned" "categorical")
                    ;; a dimension whose expr is SQL, as the flexanalytics project's is_cancelled_order is
                    (dimension "is_big_sale" "categorical" :expr "case when sales > 100 then 1 else 0 end")]
   :measures       measures
   :depends_on     {:macros [], :nodes [model-id]}
   :config         {:enabled true, :group nil, :meta {}}})

(defn dimension-semantic-model
  "A semantic model over dimension table `public.<table-name>` with no measures: one primary `entity` and
  `dimensions`."
  [sm-id node-id table-name label entity dimensions]
  {:unique_id      sm-id
   :name           table-name
   :label          label
   :description    nil
   :model          (format "ref('%s')" table-name)
   :node_relation  {:alias         table-name
                    :schema_name   "public"
                    :database      "dbt_bi"
                    :relation_name (format "\"dbt_bi\".\"public\".\"%s\"" table-name)}
   :defaults       nil
   :primary_entity nil
   :entities       [entity]
   :dimensions     dimensions
   :measures       []
   :depends_on     {:macros [], :nodes [node-id]}
   :config         {:enabled true, :group nil, :meta {}}})

(defn product-semantic-model
  "`dim_product`, labelled \"Product\": the `product` entity, a categorical dimension over a column, one over SQL
  (as the flexanalytics project's `is_aviation_order`), one with no `expr` and a time dimension."
  []
  (dimension-semantic-model
   product-sm-id product-model-id "dim_product" "Product"
   (entity "product" "primary" :expr "product_key")
   [(dimension "product_category_dim" "categorical" :expr "product_category" :label "Product category")
    (dimension "is_aviation_order" "categorical" :expr "case when product_category = 'Aviation' then 1 else 0 end")
    (dimension "msrp" "categorical")
    (dimension "first_order_date" "time")]))

(defn order-semantic-model
  "`dim_order`, with no label: the `order` entity, a categorical dimension over a column, one over SQL (as the
  flexanalytics project's `is_cancelled_order`) and a time dimension."
  []
  (dimension-semantic-model
   order-sm-id order-model-id "dim_order" nil
   (entity "order" "primary" :expr "order_key")
   [(dimension "order_status_dim" "categorical" :expr "status")
    (dimension "is_cancelled_order" "categorical" :expr "case when status = 'Cancelled' then 1 else 0 end")
    (dimension "order_date" "time" :label "Ordered on")]))

(defn input-measure
  "A `type_params.measure` entry pointing at measure `m`, with `overrides` merged in."
  [overrides]
  (merge {:name "m", :filter nil, :alias nil, :join_to_timespine false, :fill_nulls_with nil} overrides))

(defn- base-type-params [im]
  {:measure                   im
   :input_measures            (if im [im] [])
   :numerator                 nil
   :denominator               nil
   :expr                      nil
   :window                    nil
   :grain_to_date             nil
   :metrics                   []
   :conversion_type_params    nil
   :cumulative_type_params    nil
   :metric_aggregation_params nil
   :fill_nulls_with           nil
   :join_to_timespine         false
   :is_private                nil})

(defn- base-metric []
  {:name             "m"
   :resource_type    "metric"
   :unique_id        "metric.p.m"
   :description      "d"
   :label            "M"
   :type             "simple"
   :filter           nil
   :metadata         nil
   :time_granularity nil
   :config           {:enabled true, :group nil, :meta {}}
   :depends_on       {:macros [], :nodes [sm-id]}
   :meta             {}
   :tags             []})

(defn build-manifest
  "A manifest with the `fact_sales` model node and semantic model, the `dim_product` and `dim_order` ones it joins to,
  and one metric `m` (sum of `sales`), tweaked with `:measure` (merged into the measure), `:measures` (replaces them),
  `:input-measure`, `:metric`, `:type-params`, `:columns` (merged into the fact node's columns; `::remove` drops one)
  and finally `:edit`, a fn over the whole manifest."
  [{im-overrides :input-measure, :keys [measure measures metric type-params columns edit]}]
  (let [im      (input-measure im-overrides)
        metric' (as-> (base-metric) $metric
                  (merge $metric metric)
                  (assoc $metric :type_params (merge (base-type-params im) (:type_params $metric) type-params)))]
    (cond-> {:metadata        {:dbt_schema_version "https://schemas.getdbt.com/dbt/manifest/v12.json"
                               :dbt_version        "1.12.6"
                               :project_name       "p"
                               :adapter_type       "postgres"}
             :nodes           {model-id         (model-node columns)
                               product-model-id (node product-model-id "dim_product" product-columns)
                               order-model-id   (node order-model-id "dim_order" order-columns)}
             :semantic_models {sm-id         (semantic-model (or measures [(merge (base-measure) measure)]))
                               product-sm-id (product-semantic-model)
                               order-sm-id   (order-semantic-model)}
             :metrics         {(:unique_id metric') metric'}}
      edit edit)))

(defn edit-semantic-model
  "A `:edit` fn for [[build-manifest]] that applies `f` to the semantic model `sm-id` (default the fact table's)."
  ([f]
   (edit-semantic-model sm-id f))
  ([sm-id f]
   #(update-in % [:semantic_models sm-id] f)))

(defn round-trip
  "The manifest as `dbt parse` would write it and the converter would read it: JSON with string keys."
  [manifest]
  (json/decode (json/encode manifest)))

(defn resolve-manifest-map
  "Run a built manifest through decode, parse and resolve with `config` (default [[default-config]])."
  ([manifest]
   (resolve-manifest-map default-config manifest))
  ([config manifest]
   (->> manifest round-trip dbt-manifest/decode-manifest parse/parse-manifest (resolve/resolve-manifest config))))

(defn card-entity
  "The serdes Card entity [[emit/files]] writes for the resolved metric named `metric-name`, with its dimensions and
  dimension mappings in portable form, or nil when the metric was not converted."
  [config resolved metric-name]
  (some (fn [{:keys [entity metric]}]
          (when (= metric-name (-> metric :metric :name))
            entity))
        (emit/files config resolved)))

(defn convert
  "Run the manifest [[build-manifest]] makes from `tweaks` through the whole pipeline and describe what happened to its
  metric (`m`, unless `:metric-name` says otherwise): `{:aggregation clause, :filters clauses, :source-table ref,
  :dimensions dimensions, :dimension-mappings mappings, :unsupported-dimensions reports}` when it converted, with the
  dimensions and mappings in the portable form serdes writes, `{:unsupported reason}` when it was reported. `:config`
  is merged over [[default-config]]. A failure of the whole run throws, as it does in the converter."
  [{:keys [config metric-name] :as tweaks}]
  (let [config      (merge default-config config)
        metric-name (or metric-name (get-in tweaks [:metric :name]) "m")
        resolved    (resolve-manifest-map config (build-manifest tweaks))]
    (if-let [converted (m/find-first #(= metric-name (-> % :metric :name)) (:metrics resolved))]
      (let [stage  (-> (emit/dataset-query converted) :stages first)
            entity (card-entity config resolved metric-name)]
        {:aggregation            (first (:aggregation stage))
         :filters                (:filters stage [])
         :source-table           (:source-table stage)
         :dimensions             (:dimensions entity)
         :dimension-mappings     (:dimension_mappings entity)
         :unsupported-dimensions (:unsupported-dimensions converted)})
      (if-let [unsupported (m/find-first #(= metric-name (:name %)) (:unsupported resolved))]
        {:unsupported (:reason unsupported)}
        (throw (ex-info (format "metric %s was neither converted nor reported" (pr-str metric-name))
                        {:resolved resolved}))))))

(defn aggregation
  "The aggregation clause the metric [[convert]] builds from `tweaks` converts to. When it is reported instead, the
  `{:unsupported reason}` map, so a failing `is` shows the reason."
  [tweaks]
  (let [result (convert tweaks)]
    (if (contains? result :aggregation)
      (:aggregation result)
      result)))

(defn filters
  "The filter clauses of the query the metric [[convert]] builds from `tweaks` converts to, in order. When it is
  reported instead, the `{:unsupported reason}` map, so a failing `is` shows the reason."
  [tweaks]
  (let [result (convert tweaks)]
    (if (contains? result :filters)
      (:filters result)
      result)))

(defn unsupported
  "The reason the metric [[convert]] builds from `tweaks` is reported as unsupported. When it converts instead, a
  string saying what to, so a failing `re-find` shows the query."
  [tweaks]
  (let [result (convert tweaks)]
    (or (:unsupported result)
        (str "converted to " (pr-str (select-keys result [:aggregation :filters]))))))

(defn dimension-names
  "The names of the curated dimensions of the metric [[convert]] builds from `tweaks`, in the order they are written.
  When it is reported instead, the `{:unsupported reason}` map."
  [tweaks]
  (let [result (convert tweaks)]
    (if (contains? result :dimensions)
      (mapv :name (:dimensions result))
      result)))

(defn dimension-set
  "The curated dimensions of the metric [[convert]] builds from `tweaks`, keyed by name. Each is the portable
  dimension merged with the `:table-id` and `:target` of its mapping, without the ids that tie the two together, so a
  test compares what a dimension *is* and leaves ids to the tests about ids. When the metric is reported instead, the
  `{:unsupported reason}` map."
  [tweaks]
  (let [{:keys [dimensions dimension-mappings] :as result} (convert tweaks)]
    (if (contains? result :dimensions)
      (let [mapping-for (m/index-by :dimension-id dimension-mappings)]
        (into {}
              (map (fn [{:keys [id] :as dimension}]
                     [(:name dimension) (merge (dissoc dimension :id)
                                               (select-keys (mapping-for id) [:table-id :target]))]))
              dimensions))
      result)))

(defn unsupported-dimensions
  "The dimensions of the metric [[convert]] builds from `tweaks` that could not become curated dimensions, as a map of
  dimension name → reason. When the metric is reported instead, the `{:unsupported reason}` map."
  [tweaks]
  (let [result (convert tweaks)]
    (if (contains? result :unsupported-dimensions)
      (into {} (map (juxt :name :reason)) (:unsupported-dimensions result))
      result)))

(defn metrics-manifest
  "A manifest whose metrics all sum `sales` and differ only in `label` (and description). Metric names are m0, m1, …"
  ([labels]
   (metrics-manifest labels (repeat nil)))
  ([labels descriptions]
   (let [base (get-in (build-manifest {}) [:metrics "metric.p.m"])]
     (build-manifest
      {:edit (fn [m]
               (assoc m :metrics (into (array-map)
                                       (map-indexed (fn [i [label description]]
                                                      (let [id (str "metric.p.m" i)]
                                                        [id (assoc base :name (str "m" i), :unique_id id
                                                                   :label label, :description description)]))
                                                    (map vector labels descriptions)))))}))))

(defn card-files
  "The card files [[emit/files]] produces for a built manifest, without the collection file."
  [manifest]
  (rest (emit/files default-config (resolve-manifest-map manifest))))

(defn temp-dir []
  (str (Files/createTempDirectory "dbt-import-test" (make-array FileAttribute 0))))
