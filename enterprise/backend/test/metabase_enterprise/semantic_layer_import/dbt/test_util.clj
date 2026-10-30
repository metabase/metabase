(ns metabase-enterprise.semantic-layer-import.dbt.test-util
  "Shared fixtures for the converter's tests.

  [[build-manifest]] makes a small manifest in the shape `dbt parse` writes (manifest v12, dbt 1.12): a fact table
  `fact_sales` with one metric `m` (sum of `sales`), and two dimension tables, `dim_product` and `dim_order`, that its
  `product` and `order` entities join to, the way the flexanalytics project is laid out; tweaked per test. [[convert]]
  runs it through the whole pipeline ([[dbt-manifest/decode-manifest]] → [[parse/parse-manifest]] →
  [[resolve/resolve-semantic-layer]] → [[emit/files]]); [[aggregation]], [[filters]], [[dimension-set]] and
  [[unsupported]] pick out the clause the metric converted to, its filters, its curated dimensions, or the reason it did
  not, for an `is` to compare against.

  The checked-in manifests are here too: [[flexanalytics-manifest-filename]], with [[flexanalytics-manifest]],
  [[flexanalytics-ir]] and [[flexanalytics-resolved]] for each stage's view of it, and
  [[parcel-delivery-manifest-filename]]."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase-enterprise.semantic-layer-import.dbt.manifest :as dbt-manifest]
   [metabase-enterprise.semantic-layer-import.dbt.parse :as parse]
   [metabase-enterprise.semantic-layer-import.emit :as emit]
   [metabase-enterprise.semantic-layer-import.resolve :as resolve]
   [metabase.util.json :as json]
   [metabase.util.yaml :as yaml]))

(set! *warn-on-reflection* true)

(def db "The Metabase database the fixture's warehouse database `dbt_bi` maps to." "Sales DB")

(def default-config
  {:databases     {"dbt_bi" db}
   :driver        :postgres
   :creator-email "admin@example.com"})

(def fixtures-dir
  "Where the dbt fixtures live, relative to the repo root the tests run from. EE test resources are not on the
  classpath, so they are read by path."
  "enterprise/backend/test_resources/semantic_layer_import/dbt")

(def flexanalytics-manifest-filename
  "The flexanalytics/dbt-business-intelligence manifest, trimmed to the sections the converter reads; see
  [[metabase-enterprise.semantic-layer-import.dbt.test-util.fixture]]."
  (str fixtures-dir "/flexanalytics_manifest.json"))

(def parcel-delivery-manifest-filename
  "The manifest of the small project under
  `enterprise/backend/test_resources/semantic_layer_import/dbt/parcel_delivery/`, written on the dbt 1.12 inline spec;
  see [[metabase-enterprise.semantic-layer-import.dbt.test-util.fixture]]."
  (str fixtures-dir "/parcel_delivery_manifest.json"))

(defn flexanalytics-manifest
  "The flexanalytics fixture, read and decoded but not yet parsed into the IR."
  []
  (parse/read-manifest flexanalytics-manifest-filename))

(defn flexanalytics-ir
  "The flexanalytics fixture parsed into the IR."
  []
  (parse/parse-manifest-file flexanalytics-manifest-filename))

(defn flexanalytics-resolved
  "The flexanalytics fixture resolved with [[default-config]]."
  []
  (resolve/resolve-semantic-layer default-config (flexanalytics-ir)))

(defn metric-named
  "The IR metric named `metric-name` among `metrics`, a parsed manifest's `:metrics`."
  [metrics metric-name]
  (m/find-first #(= metric-name (:name %)) metrics))

(defn resolved-metric-named
  "The resolved metric named `metric-name` in `resolved`, a resolved manifest."
  [resolved metric-name]
  (m/find-first #(= metric-name (-> % :ir :name)) (:metrics resolved)))

(def model-id "model.p.fact_sales")
(def sm-id "semantic_model.p.fact_sales")
(def ^:private product-model-id "model.p.dim_product")
(def product-sm-id "semantic_model.p.dim_product")
(def order-model-id "model.p.dim_order")
(def order-sm-id "semantic_model.p.dim_order")

(defn fld
  "The `:field` clause serdes writes for `column` on `public.fact_sales` of [[db]], or on `schema`.`table` of `db`.
  `base-type` is what the converter knows the column as (nil for a column whose type the manifest does not declare) and
  documents the expectation only: a written ref carries no type, so that the instance's own metadata decides (see
  [[metabase-enterprise.semantic-layer-import.resolve.metrics/without-ref-types]])."
  ([column base-type]
   (fld db "public" "fact_sales" column base-type))
  ([schema table column base-type]
   (fld db schema table column base-type))
  ([database schema table column _base-type]
   [:field {} [database schema table column]]))

(def sum-sales
  "What the fixture's metric `m` converts to untouched: the sum of `sales`."
  [:sum {} (fld "sales" :type/Float)])

(defn joined-fld
  "The `:field` clause serdes writes for `column` on dimension table `public.<table>`, reached from `fact_sales` through
  the foreign key column `fk-column`: an implicit join, which Metabase spells as `:source-field`."
  [fk-column table column base-type]
  (assoc-in (fld "public" table column base-type) [1 :source-field] [db "public" "fact_sales" fk-column]))

(def order-status
  "`dim_order.status`, reached from `fact_sales` through the `order` entity's column."
  (joined-fld "order_key" "dim_order" "status" :type/Text))

(defn portable-table
  "The `[database schema table]` serdes writes for `public.<table>`."
  [table]
  [db "public" table])

(defn portable-field
  "The `[database schema table column]` serdes writes for `column` on `public.<table>`."
  [table column]
  [db "public" table column])

(defn where-filters
  "A metric or measure `filter` as the manifest writes it: one where clause per `template`."
  [& templates]
  {:where_filters (mapv (fn [template] {:where_sql_template template}) templates)})

(def shipped-filter
  "A metric `filter` on the fact table's own `status` column: `{{ Dimension('fact_sales_key__status') }} = 'Shipped'`."
  (where-filters "{{ Dimension('fact_sales_key__status') }} = 'Shipped'"))

(def shipped-order-template
  "A filter template through the `order` entity, on `dim_order`'s `order_status_dim`."
  "{{ Dimension('order__order_status_dim') }} = 'Shipped'")

(def shipped-order-filter
  "A metric `filter` of [[shipped-order-template]]: a join to `dim_order` through the `order` entity's column."
  (where-filters shipped-order-template))

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

(def ^:private product-columns
  "Columns of `dim_product` (name → data_type)."
  {"product_key"      "text"
   "product_category" "text"
   "msrp"             "integer"
   "first_order_date" "date"})

(def ^:private order-columns
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

(defn- dimension-semantic-model
  "A semantic model over dimension table `public.<table-name>` with no measures: one `primary-entity` and
  `model-dimensions`."
  [model-sm-id node-id table-name label primary-entity model-dimensions]
  {:unique_id      model-sm-id
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
   :entities       [primary-entity]
   :dimensions     model-dimensions
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

(defn- order-semantic-model
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

(defn metric-input
  "A `type_params.numerator` / `denominator` / `metrics[]` entry pointing at metric `metric-name`, with `overrides`
  merged in: `:alias`, `:filter`, `:offset_window`, `:offset_to_grain`."
  [metric-name & {:as overrides}]
  (merge {:name metric-name, :filter nil, :alias nil} overrides))

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
  and one metric `m` (sum of `sales`), tweaked by, in this order:

  * `:measures` replaces the fact table's measures; otherwise `:measure` is merged into its one measure, `m`;
  * `:columns` is merged into the fact node's columns (a data type of `::remove` drops the column);
  * `:input-measure` is merged into the metric's `type_params.measure`;
  * `:metric` is merged into the metric, then `:type-params` over its `type_params`, so `:type-params` wins over a
    `:type_params` in `:metric`, which wins over `:input-measure`;
  * `:edit`, a fn over the whole manifest, runs last and may change anything."
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
  "A `:edit` fn for [[build-manifest]] that applies `f` to the semantic model `model-sm-id` (default the fact
  table's)."
  ([f]
   (edit-semantic-model sm-id f))
  ([model-sm-id f]
   #(update-in % [:semantic_models model-sm-id] f)))

(defn add-measure
  "A `:edit` fn for [[build-manifest]] that adds `measure`, merged over [[base-measure]], to the measures of the
  semantic model `model-sm-id` (default the fact table's)."
  ([measure]
   (add-measure sm-id measure))
  ([model-sm-id measure]
   (edit-semantic-model model-sm-id #(update % :measures conj (merge (base-measure) measure)))))

(defn add-metric
  "A `:edit` fn for [[build-manifest]] that adds a metric `metric-name` next to the fixture's `m`, cloned from it: the
  same boilerplate, type and `type_params`, with its `name`, `unique_id` (`metric.p.<metric-name>`) and `label` set,
  then `f` (default identity) changing what differs."
  ([metric-name]
   (add-metric metric-name identity))
  ([metric-name f]
   (fn [manifest]
     (assoc-in manifest [:metrics (str "metric.p." metric-name)]
               (f (assoc (get-in manifest [:metrics "metric.p.m"])
                         :name metric-name, :unique_id (str "metric.p." metric-name), :label metric-name))))))

(defn over-measure
  "`metric`, a manifest metric, made a simple metric over the measure `measure-name`: its `type_params.measure` and
  `input_measures` point at it."
  [metric measure-name]
  (-> metric
      (assoc-in [:type_params :measure] (input-measure {:name measure-name}))
      (assoc-in [:type_params :input_measures] [(input-measure {:name measure-name})])))

(defn round-trip
  "The manifest as `dbt parse` would write it and the converter would read it: JSON with string keys."
  [manifest]
  (json/decode (json/encode manifest)))

(defn resolve-manifest-map
  "Run a built manifest through decode, parse (with the dbt source's `options`, default none) and resolve with
  `config` (default [[default-config]])."
  ([manifest]
   (resolve-manifest-map default-config manifest))
  ([config manifest]
   (resolve-manifest-map config {} manifest))
  ([config options manifest]
   (->> manifest
        round-trip
        dbt-manifest/decode-manifest
        (parse/parse-manifest options)
        (resolve/resolve-semantic-layer config))))

(defn stage
  "The one stage of the query [[emit/dataset-query]] writes for `resolved-metric`."
  [resolved-metric]
  (-> (emit/dataset-query resolved-metric) :stages first))

(defn query-clauses
  "The clauses of the query `resolved-metric` converts to: `{:aggregation clause, :filters clauses, :source-table
  ref}`, with `:filters` `[]` when the stage has none."
  [resolved-metric]
  (let [{:keys [aggregation filters source-table]} (stage resolved-metric)]
    {:aggregation  (first aggregation)
     :filters      (or filters [])
     :source-table source-table}))

(defn reasons-by-name
  "`reports`, unsupported metrics or dimensions (`{:name ..., :reason ...}`), as a map of name → reason."
  [reports]
  (into {} (map (juxt :name :reason)) reports))

(defn read-yaml
  "The YAML file at `path` under `dir`, parsed; `opts` go to [[yaml/parse-string]] (`:key-fn`)."
  [dir path & opts]
  (apply yaml/parse-string (slurp (io/file dir path)) opts))

(defn card-entity
  "The serdes Card entity [[emit/files]] writes for the resolved metric named `metric-name`, with its dimensions and
  dimension mappings in portable form, or nil when the metric was not converted."
  [config resolved-layer metric-name]
  (some (fn [{card :entity, :keys [resolved]}]
          (when (= metric-name (-> resolved :ir :name))
            card))
        (emit/files config resolved-layer)))

(defn convert
  "Run the manifest [[build-manifest]] makes from `tweaks` through the whole pipeline and describe what happened to its
  metric (`m`, unless `:metric-name` says otherwise): `{:aggregation clause, :filters clauses, :source-table ref,
  :notes notes, :dimensions dimensions, :dimension-mappings mappings, :unsupported-dimensions reports}` when it
  converted, with the dimensions and mappings in the portable form serdes writes, `{:unsupported reason}` when it was
  reported, `{:error message}` when the import failed on it. `:config` is merged over [[default-config]], and
  `:entity-models` is the dbt source's option of that name. A failure of the whole run throws, as it does in the
  import."
  [{:keys [config metric-name entity-models] :as tweaks}]
  (let [config      (merge default-config config)
        metric-name (or metric-name (get-in tweaks [:metric :name]) "m")
        options     (cond-> {} entity-models (assoc :entity-models entity-models))
        resolved    (resolve-manifest-map config options (build-manifest tweaks))
        named       (fn [k] (m/find-first #(= metric-name (:name %)) (k resolved)))]
    (if-let [converted (resolved-metric-named resolved metric-name)]
      (let [card (card-entity config resolved metric-name)]
        (assoc (query-clauses converted)
               :notes                  (:notes converted)
               :dimensions             (:dimensions card)
               :dimension-mappings     (:dimension_mappings card)
               :unsupported-dimensions (:unsupported-dimensions converted)))
      (if-let [unsupported (named :unsupported)]
        {:unsupported (:reason unsupported)}
        (if-let [failed (named :errors)]
          {:error (:message failed)}
          (throw (ex-info (format "metric %s was neither converted nor reported" (pr-str metric-name))
                          {:resolved resolved})))))))

(defn- converted
  "`(f (k result))` where `result` is what [[convert]] makes of `tweaks`, when the metric converted. When it was
  reported instead, the `{:unsupported reason}` map, so a failing `is` shows the reason."
  [tweaks k f]
  (let [result (convert tweaks)]
    (if (contains? result k)
      (f (k result))
      result)))

(defn aggregation
  "The aggregation clause the metric [[convert]] builds from `tweaks` converts to."
  [tweaks]
  (converted tweaks :aggregation identity))

(defn filters
  "The filter clauses of the query the metric [[convert]] builds from `tweaks` converts to, in order."
  [tweaks]
  (converted tweaks :filters identity))

(defn unsupported
  "The reason the metric [[convert]] builds from `tweaks` is reported as unsupported. When it converts instead, a
  string saying what to, so a failing `re-find` shows the query."
  [tweaks]
  (let [result (convert tweaks)]
    (or (:unsupported result)
        (str "converted to " (pr-str (select-keys result [:aggregation :filters]))))))

(defn dimension-names
  "The names of the curated dimensions of the metric [[convert]] builds from `tweaks`, in the order they are written."
  [tweaks]
  (converted tweaks :dimensions #(mapv :name %)))

(defn dimension-set
  "The curated dimensions of the metric [[convert]] builds from `tweaks`, keyed by name. Each is the portable
  dimension merged with the `:table-id` and `:target` of its mapping, without the ids that tie the two together, so a
  test compares what a dimension *is* and leaves ids to the tests about ids."
  [tweaks]
  (let [{:keys [dimensions dimension-mappings] :as result} (convert tweaks)]
    (if (contains? result :dimensions)
      (let [mapping-for (m/index-by :dimension-id dimension-mappings)]
        (into {}
              (map (fn [{:keys [id] :as curated}]
                     [(:name curated) (merge (dissoc curated :id)
                                             (select-keys (mapping-for id) [:table-id :target]))]))
              dimensions))
      result)))

(defn unsupported-dimensions
  "The dimensions of the metric [[convert]] builds from `tweaks` that could not become curated dimensions, as a map of
  dimension name → reason."
  [tweaks]
  (converted tweaks :unsupported-dimensions reasons-by-name))

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

(defn unquoted-relations
  "A `:edit` fn for [[build-manifest]] that writes every `relation_name`, on the nodes and on the semantic models,
  without quotes (`dbt_bi.public.fact_sales`), as dbt-snowflake does, so a warehouse that folds the case of an
  unquoted identifier folds every part of every relation."
  [manifest]
  (let [unquoted (fn [{:keys [database], table-alias :alias, :as relation} schema]
                   (assoc relation :relation_name (str/join "." [database schema table-alias])))]
    (-> manifest
        (update :nodes update-vals #(unquoted % (:schema %)))
        (update :semantic_models update-vals
                #(update % :node_relation (fn [relation] (unquoted relation (:schema_name relation))))))))
