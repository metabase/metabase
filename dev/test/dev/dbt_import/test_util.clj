(ns dev.dbt-import.test-util
  "Shared fixture for the converter's tests.

  [[build-manifest]] makes a small manifest in the shape `dbt parse` writes (manifest v12, dbt 1.12): one model node,
  one semantic model and one metric `m` (sum of `sales`), tweaked per test. [[convert]] runs it through the whole
  pipeline (`decode-manifest` → `parse` → `resolve` → `emit/aggregation-clause`); [[aggregation]] and [[unsupported]]
  pick out the clause the metric converted to, or the reason it did not, for an `is` to compare against."
  (:require
   [dev.dbt-import.emit :as emit]
   [dev.dbt-import.parse :as parse]
   [dev.dbt-import.resolve :as resolve]
   [dev.dbt-import.schemas.dbt-manifest :as dbt-manifest]
   [metabase.util.json :as json])
  (:import
   (java.nio.file Files)
   (java.nio.file.attribute FileAttribute)))

(set! *warn-on-reflection* true)

(def db "The Metabase database the fixture's warehouse database `dbt_bi` maps to." "Sales DB")

(def default-config
  {:databases     {"dbt_bi" db}
   :driver        :postgres
   :creator-email "admin@example.com"})

(def model-id "model.p.fact_sales")
(def sm-id "semantic_model.p.fact_sales")

(defn fld
  "Portable `:field` clause for `column` on `public.fact_sales`. A nil `base-type` leaves it out, which is what the
  converter emits for a column whose type the manifest does not declare."
  ([column base-type]
   (fld "public" "fact_sales" column base-type))
  ([schema table column base-type]
   [:field (cond-> {} base-type (assoc :base-type base-type)) [db schema table column]]))

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
   ["blob"          "bytea"                    :type/*                   :binary]])

(def ^:private base-columns
  (into {"fact_sales_key" "integer"} (map (fn [[column-name data-type]] [column-name data-type])) pg-columns))

(defn- column-map
  "`columns` (name → data_type) as a node's `columns` map. A data type of `::remove` drops the column."
  [columns]
  (into {}
        (keep (fn [[column-name data-type]]
                (when-not (= data-type ::remove)
                  [column-name {:name column-name, :description "", :data_type data-type}])))
        columns))

(defn model-node
  "A model node over `public.fact_sales` with `columns` (name → data_type) merged into the default column set."
  [columns]
  {:unique_id     model-id
   :resource_type "model"
   :name          "fact_sales"
   :database      "dbt_bi"
   :schema        "public"
   :alias         "fact_sales"
   :relation_name "\"dbt_bi\".\"public\".\"fact_sales\""
   :description   ""
   :columns       (column-map (merge base-columns columns))})

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
   :entities       [{:name "fact_sales_key", :type "primary", :description nil, :label nil, :role nil, :expr nil}
                    {:name "customer", :type "foreign", :description nil, :label nil, :role nil, :expr "customer_key"}]
   :dimensions     [{:name "date_day", :type "time", :description nil, :label nil, :is_partition false
                     :type_params {:time_granularity "day", :validity_params nil}, :expr nil}
                    {:name "status", :type "categorical", :description nil, :label nil, :is_partition false
                     :type_params nil, :expr nil}]
   :measures       measures
   :depends_on     {:macros [], :nodes [model-id]}
   :config         {:enabled true, :group nil, :meta {}}})

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
  "A manifest with one model node, one semantic model and one metric `m` (sum of `sales`), tweaked with `:measure`
  (merged into the measure), `:measures` (replaces them), `:input-measure`, `:metric`, `:type-params`, `:columns`
  (merged into the node's columns; `::remove` drops one) and finally `:edit`, a fn over the whole manifest."
  [{im-overrides :input-measure, :keys [measure measures metric type-params columns edit]}]
  (let [im      (input-measure im-overrides)
        metric' (merge (base-metric) metric)
        metric' (assoc metric' :type_params (merge (base-type-params im) (:type_params metric') type-params))]
    (cond-> {:metadata        {:dbt_schema_version "https://schemas.getdbt.com/dbt/manifest/v12.json"
                               :dbt_version        "1.12.6"
                               :project_name       "p"
                               :adapter_type       "postgres"}
             :nodes           {model-id (model-node columns)}
             :semantic_models {sm-id (semantic-model (or measures [(merge (base-measure) measure)]))}
             :metrics         {(:unique_id metric') metric'}}
      edit edit)))

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

(defn convert
  "Run the manifest [[build-manifest]] makes from `tweaks` through the whole pipeline and describe what happened to its
  metric (`m`, unless `:metric-name` says otherwise): `{:aggregation clause, :source-table ref}` when it converted,
  `{:unsupported reason}` when it was reported. `:config` is merged over [[default-config]]. A failure of the whole
  run throws, as it does in the converter."
  [{:keys [config metric-name] :as tweaks}]
  (let [config      (merge default-config config)
        metric-name (or metric-name (get-in tweaks [:metric :name]) "m")
        resolved    (resolve-manifest-map config (build-manifest tweaks))]
    (if-let [converted (first (filter #(= metric-name (-> % :metric :name)) (:metrics resolved)))]
      {:aggregation  (emit/aggregation-clause converted)
       :source-table (:source-table converted)}
      (if-let [unsupported (first (filter #(= metric-name (:name %)) (:unsupported resolved)))]
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

(defn unsupported
  "The reason the metric [[convert]] builds from `tweaks` is reported as unsupported. When it converts instead, a
  string saying what to, so a failing `re-find` shows the clause."
  [tweaks]
  (let [result (convert tweaks)]
    (or (:unsupported result)
        (str "converted to " (pr-str (:aggregation result))))))

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
