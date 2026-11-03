(ns metabase-enterprise.semantic-layer-import.ossie.test-util
  "Shared fixtures for the Ossie source's tests: where the checked-in documents are (see the README in that
  directory), a config that maps their warehouse databases onto one Metabase database, and the shortcuts from a
  document, on disk or built in a test, to each stage's view of it: the IR ([[ir]], [[parse-file]]), the resolved
  layer ([[resolve-file]]) and what became of one metric ([[outcome]])."
  (:require
   [medley.core :as m]
   [metabase-enterprise.semantic-layer-import.emit :as emit]
   [metabase-enterprise.semantic-layer-import.ossie.document :as document]
   [metabase-enterprise.semantic-layer-import.ossie.parse :as parse]
   [metabase-enterprise.semantic-layer-import.resolve :as resolve]))

(def fixtures-dir
  "Where the Ossie fixtures live, relative to the repo root the tests run from. EE test resources are not on the
  classpath, so they are read by path."
  "enterprise/backend/test_resources/semantic_layer_import/ossie")

(defn fixture
  "The path of the fixture `relative` to [[fixtures-dir]]."
  [relative]
  (str fixtures-dir "/" relative))

(def tpch-document
  "Snowflake's TPC-H revenue model in the 0.1.1 shape."
  (fixture "tpch/tpch-revenue.osi.yaml"))

(def tpch-document-v02
  "The same model in the 0.2.0.dev0 shape."
  (fixture "tpch/tpch-revenue.osi.v02.yaml"))

(def tpch-dataset
  "TPC-H at scale factor 0.001 as a test dataset definition, for the end-to-end test."
  (fixture "tpch/tpch_sf0_001.edn"))

(def tpch-summary
  "What the generator computed over [[tpch-dataset]] when it wrote it, the model's `net_revenue` among it."
  (fixture "tpch/tpch_sf0_001_summary.edn"))

(def db
  "The Metabase database every fixture's warehouse database maps to in [[default-config]]."
  "Warehouse")

(def default-config
  "A config that maps every warehouse database the fixtures name (`SNOWFLAKE_SAMPLE_DATA`, `samples`, `tpcds`,
  `scott`'s none, ...) onto [[db]], read with the Postgres driver, which folds the fixtures' unquoted names to lower
  case."
  {:databases     {"SNOWFLAKE_SAMPLE_DATA" db
                   "samples"               db
                   "sales"                 db
                   "tpcds"                 db
                   "memory"                db
                   nil                     db}
   :driver        :postgres
   :creator-email "admin@example.com"})

(defn ir
  "The IR of `raw`, a document as YAML or JSON parses it (a map with keyword keys), parsed with the source's `options`
  (default none)."
  ([raw]
   (ir {} raw))
  ([options raw]
   (parse/parse-model options (document/model raw))))

(defn parse-file
  "The IR of the document at `filename`, parsed with the source's `options` (default none)."
  ([filename]
   (parse-file {} filename))
  ([options filename]
   (parse/parse-file options filename)))

(defn resolve-file
  "The document at `filename` parsed and resolved with `config` (default [[default-config]])."
  ([filename]
   (resolve-file default-config filename))
  ([config filename]
   (resolve-file config {} filename))
  ([config options filename]
   (resolve/resolve-semantic-layer config (parse-file options filename))))

(defn metric-named
  "The IR metric named `metric-name` among `metrics`, a parsed document's `:metrics`."
  [metrics metric-name]
  (m/find-first #(= metric-name (:name %)) metrics))

(defn stage
  "The one stage of the query [[emit/dataset-query]] writes for `resolved-metric`, with portable refs."
  [resolved-metric]
  (-> (emit/dataset-query resolved-metric) :stages first))

(defn outcome
  "What became of the metric named `metric-name` in `resolved`, a resolved layer: `{:aggregation clause,
  :filters clauses, :source-table ref, :notes notes, :unsupported-dimensions reasons-by-name}` with the clauses in the
  portable form serdes writes when it converted, `{:unsupported reason}` when it was reported, `{:error message}` when
  the import failed on it. Throws when the metric is nowhere, which is a bug."
  [resolved metric-name]
  (let [named     (fn [k] (m/find-first #(= metric-name (:name %)) (k resolved)))
        converted (m/find-first #(= metric-name (-> % :ir :name)) (:metrics resolved))]
    (cond
      converted
      (let [{:keys [aggregation filters source-table]} (stage converted)]
        {:aggregation            (first aggregation)
         :filters                (or filters [])
         :source-table           source-table
         :notes                  (:notes converted)
         :unsupported-dimensions (into {} (map (juxt :name :reason)) (:unsupported-dimensions converted))})

      (named :unsupported)
      {:unsupported (:reason (named :unsupported))}

      (named :errors)
      {:error (:message (named :errors))}

      :else
      (throw (ex-info (format "metric %s was neither converted nor reported" (pr-str metric-name))
                      {:resolved resolved})))))

(defn aggregation
  "The aggregation clause the metric `metric-name` of `resolved` converted to, or `{:unsupported reason}`."
  [resolved metric-name]
  (let [result (outcome resolved metric-name)]
    (if (contains? result :aggregation)
      (:aggregation result)
      result)))

(defn unsupported
  "The reason the metric `metric-name` of `resolved` was reported, or, when it converted, a string saying what to, so a
  failing `re-find` shows the clause."
  [resolved metric-name]
  (let [result (outcome resolved metric-name)]
    (or (:unsupported result)
        (:error result)
        (str "converted to " (pr-str (:aggregation result))))))

(defn fld
  "The `:field` clause serdes writes for `column` of `table` in [[db]]'s schema `schema` (default `public`), or reached
  through `source-field`, a `[table column]` on the metric's table, as an implicit join."
  ([table column]
   (fld "public" table column))
  ([schema table column]
   [:field {} [db schema table column]])
  ([schema table column [source-table source-column]]
   [:field {:source-field [db schema source-table source-column]} [db schema table column]]))

(defn expression-document
  "A one-dialect `expression` as a document writes it."
  ([text]
   (expression-document "ANSI_SQL" text))
  ([dialect text]
   {:dialects [{:dialect dialect, :expression text}]}))

(defn field
  "A `fields[]` entry as a document writes it: `field-name` over the expression `text` (default the name itself),
  with `opts` merged in (`:dimension`, `:datatype`, `:label`, `:description`)."
  [field-name & {:keys [expr] :as opts}]
  (merge {:name field-name, :expression (expression-document (or expr field-name))}
         (dissoc opts :expr)))

(defn dimension
  "A dimension field, `is_time` as `time?` says (default false)."
  [field-name & {:keys [time?] :as opts}]
  (field field-name (assoc (dissoc opts :time?) :dimension {:is_time (boolean time?)})))

(defn metric
  "A `metrics[]` entry as a document writes it: `metric-name` aggregated by the SQL `text`."
  [metric-name text & {:as opts}]
  (merge {:name metric-name, :expression (expression-document text)} opts))

(def orders-dataset
  "An `orders` dataset: a key, a customer key, a time dimension, a status dimension, an amount and a computed net
  amount."
  {:name        "orders"
   :source      "shop.public.orders"
   :primary_key ["order_id"]
   :fields      [(dimension "order_id" :datatype "Integer")
                 (dimension "customer_id" :datatype "Integer")
                 (dimension "order_date" :datatype "Date" :time? true)
                 (dimension "status" :datatype "String")
                 (field "amount" :datatype "Decimal")
                 (field "net_amount" :expr "amount - discount" :datatype "Decimal")]})

(def customers-dataset
  "A `customers` dataset: a key and a segment dimension."
  {:name        "customers"
   :source      "shop.public.customers"
   :primary_key ["id"]
   :fields      [(dimension "id" :datatype "Integer")
                 (dimension "segment" :datatype "String")]})

(def orders-to-customers
  "The relationship from `orders` to `customers`."
  {:name "orders_to_customers", :from "orders", :to "customers", :from_columns ["customer_id"], :to_columns ["id"]})

(defn shop-document
  "A small 0.2.0.dev0 document over [[orders-dataset]] and [[customers-dataset]], joined by
  [[orders-to-customers]], with `metrics` (model-scoped) and `edits`, a fn over the whole document (default identity)."
  [metrics & {:keys [edit], :or {edit identity}}]
  (edit {:version       "0.2.0.dev0"
         :name          "shop"
         :datasets      [orders-dataset customers-dataset]
         :relationships [orders-to-customers]
         :metrics       (vec metrics)}))
