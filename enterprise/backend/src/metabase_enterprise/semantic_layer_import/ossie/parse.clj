(ns metabase-enterprise.semantic-layer-import.ossie.parse
  "Turn an Apache Ossie semantic model (see [[metabase-enterprise.semantic-layer-import.ossie.document]]) into the IR
  (see [[metabase-enterprise.semantic-layer-import.schemas.ir]]).

  Pure apart from [[parse-file]]. Puts what Ossie says in the IR's terms:

  * a *dataset* becomes an IR table over the relation its `source` names (see [[parse-source]]); a dataset whose
    source is a query rather than a table is reported, and so is every metric over it;
  * a *field* with a `dimension` becomes an IR dimension, a time one when `is_time` is true or, in 0.2.0.dev0, when it
    is left out and the field's `datatype` is temporal (see [[time-field?]]); a field without one becomes an IR named
    expression, which a metric's SQL refers to and which is inlined there (an Ossie metric may only name fields, never
    the source's own columns). A field whose expression is a bare column documents that column, typed by the field's
    `datatype` (see [[datatype->base-type]]);
  * a dataset's `primary_key` fields become its keys, and the dataset's own name an alias of the table, so that
    `dataset.field` in a metric names the metric's own table;
  * a *relationship* becomes a join of its `from` table to its `to` table, through the column its one `from_columns`
    field is (see [[relationship-join]]); a composite one, one through a field that is SQL, or one that does not land
    on a key of the `to` dataset is a join the import could not make, reported where a metric reaches through it;
  * a *metric*, a SQL aggregate expression, becomes a simple metric whose aggregation is that SQL with a placeholder
    for every field it refers to (see [[metabase-enterprise.semantic-layer-import.ossie.metric-sql]]), over the base
    dataset it works out; a dataset-scoped metric (0.2.0.dev0) over its own dataset. The metric's time dimension is
    the base dataset's one time dimension, when it has exactly one. Ossie has no metric types, filters, grains or
    references between metrics, so nothing else is read;
  * every expression is read in one dialect for the whole document (see
    [[metabase-enterprise.semantic-layer-import.ossie.dialect]]), which also says which warehouse the document was
    written for, and so which Metabase driver the config has to name.

  A metric the IR has no place for is reported in `:unsupported` with a reason, as is a dataset that is a query; an
  unexpected exception while parsing one metric or dataset is logged and reported too, flagged `:error?`, so one bad
  entry does not fail the run."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase-enterprise.semantic-layer-import.ossie.dialect :as dialect]
   [metabase-enterprise.semantic-layer-import.ossie.document :as document]
   [metabase-enterprise.semantic-layer-import.ossie.metric-sql :as metric-sql]
   [metabase-enterprise.semantic-layer-import.schemas.ir :as ir]
   [metabase-enterprise.semantic-layer-import.sql :as sql]
   [metabase-enterprise.semantic-layer-import.unsupported :as unsupported]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::options
  "The Ossie source's own options, next to the import's config. `:dialect` names the dialect the document's
  expressions are read in (`SNOWFLAKE`, `BIGQUERY`, ...; see
  [[metabase-enterprise.semantic-layer-import.ossie.dialect/choose]]) when the document writes its SQL in more than
  one vendor dialect, or when the one it writes is not the one wanted; without it the document's one vendor dialect is
  read, or the portable ones."
  [:map {:closed true}
   [:dialect {:optional true} [:maybe :string]]])

(def tool
  "The `:tool` of every IR this source makes, which prefixes every id the import writes and names the default
  collection (`ossie metrics`). Never to change, see [[metabase-enterprise.semantic-layer-import.ids]]."
  "ossie")

(def ^:private source-part-re
  "One part of a dataset's `source` as a dotted name, with the dot after it when there is one: in double quotes, in
  backticks, in square brackets, or bare, a bare part being anything but a dot, a quote, a bracket or whitespace. The
  groups, in that order, say how the part was quoted."
  #"(?:\"((?:[^\"]|\"\")*)\"|`((?:[^`]|``)*)`|\[((?:[^\]]|\]\])*)\]|([^.\"`\[\]\s]+))\.?")

(mr/def ::source-part
  "One part of a relation's name, and whether the project wrote it in quotes."
  [:map {:closed true}
   [:name    :string]
   [:quoted? :boolean]])

(mu/defn- source-parts :- [:maybe [:sequential ::source-part]]
  "The parts of `source` in order, each with its quotes stripped (a doubled closing quote undoubled) and whether it had
  any; nil when the source is not a dotted name of one to three parts, which is to say a query."
  [source :- :string]
  (let [trimmed (str/trim source)
        matches (re-seq source-part-re trimmed)
        parts   (for [[_ double-quoted backticked bracketed bare] matches]
                  (cond
                    double-quoted {:name (str/replace double-quoted "\"\"" "\""), :quoted? true}
                    backticked    {:name (str/replace backticked "``" "`"), :quoted? true}
                    bracketed     {:name (str/replace bracketed "]]" "]"), :quoted? true}
                    :else         {:name bare, :quoted? false}))]
    (when (and (seq matches)
               (= trimmed (apply str (map first matches)))
               (<= 1 (count parts) 3))
      (vec parts))))

(mu/defn parse-source :- [:maybe ::ir/relation]
  "The relation a dataset's `source` names, `database.schema.table`, `schema.table` or `table`, each part quoted or
  bare; nil when it is a query (anything else)."
  [source :- :string]
  (when-let [parts (source-parts source)]
    (let [[table schema database] (reverse parts)]
      {:database (:name database)
       :schema   (:name schema)
       :table    (:name table)
       :quoted   (into #{}
                       (keep (fn [[part k]] (when (:quoted? part) k)))
                       [[table :table] [schema :schema] [database :database]])})))

(def ^:private datatype->base-type
  "An Ossie logical `datatype`, lower-cased, to the Metabase base type: the 0.2.0.dev0 vocabulary, and `timestamp`,
  which writers use for a `DateTime`. `Opaque`, and a name not here, is a type the import does not know, so the column
  is of unknown type and the instance supplies it."
  {"string"     :type/Text
   "integer"    :type/Integer
   "decimal"    :type/Decimal
   "float"      :type/Float
   "boolean"    :type/Boolean
   "date"       :type/Date
   "time"       :type/Time
   "datetime"   :type/DateTime
   "timestamp"  :type/DateTime
   "datetimetz" :type/DateTimeWithTZ})

(mu/defn- base-type :- [:maybe ::lib.schema.common/base-type]
  "The Metabase base type of a field with `datatype`; nil when it has none, or one the import does not know."
  [datatype :- [:maybe :string]]
  (some-> datatype str/trim u/lower-case-en datatype->base-type))

(def ^:private temporal-datatypes
  "The `datatype`s 0.2.0.dev0 defaults `is_time` to true for."
  #{"date" "time" "datetime" "datetimetz" "timestamp"})

(mu/defn- time-field? :- :boolean
  "Whether `field`, a field with a `dimension`, is a time dimension: its `is_time` when it says, else whether its
  `datatype` is temporal, as 0.2.0.dev0 defaults it. A 0.1.1 field has no `datatype`, so there the default is false."
  [{:keys [dimension datatype]} :- ::document/field]
  (let [{:keys [is_time]} dimension]
    (if (some? is_time)
      is_time
      (contains? temporal-datatypes (some-> datatype str/trim u/lower-case-en)))))

(mr/def ::field
  "A field as the parser reads it: with the expression text it is read by (see [[dialect/pick]]), and what it is in the
  IR's terms, a dimension or a named expression."
  [:map {:closed true}
   [:field ::document/field]
   [:expr  :string]
   [:kind  [:enum :dimension :expression]]])

(mu/defn- parse-field :- ::field
  "`field` read in the `chosen` dialect; [[unsupported/throw-reason]] when it has no expression the import can read."
  [chosen                           :- ::dialect/chosen
   {field-name :name, :as field}    :- ::document/field]
  (if-let [{:keys [expression]} (dialect/pick chosen (:expression field))]
    {:field field
     :expr  expression
     :kind  (if (:dimension field) :dimension :expression)}
    (unsupported/throw-reason "field %s has no expression in %s" (pr-str field-name)
                              (str/join ", " (cond->> dialect/portable chosen (cons chosen))))))

(mu/defn- quoted? :- :boolean
  "Whether `expr`, a bare column name, is written in quotes."
  [expr :- :string]
  (boolean (re-matches #"(?s)^\s*(?:\"[^\"]+\"|`[^`]+`)\s*$" expr)))

(mu/defn- column :- [:maybe ::ir/column]
  "The column a field documents, when its expression is a bare column: named as written, typed by the field's
  `datatype`, described by the field."
  [{:keys [field expr]} :- ::field]
  (let [{:keys [kind], column-name :name} (sql/parse-expr expr)]
    (when (= kind :column)
      {:name        column-name
       :data-type   nil
       :base-type   (base-type (:datatype field))
       :description (:description field)
       :quoted?     (quoted? expr)})))

(mu/defn- dimension :- ::ir/dimension
  [{:keys [field expr]} :- ::field]
  {:name        (:name field)
   :type        (if (time-field? field) :time :categorical)
   :expr        expr
   :grain       nil
   :validity    nil
   :label       (:label field)
   :description (:description field)})

(mu/defn- expression :- ::ir/expression
  [{:keys [field expr]} :- ::field]
  {:name        (:name field)
   :expr        expr
   :label       (:label field)
   :description (:description field)})

(mr/def ::dataset
  "A dataset as the parser reads it: the IR table it becomes, its joins not yet known, its fields by name as the
  metric SQL sees them, the field names that are its primary or a unique key, and its one time dimension when it has
  exactly one. Or, for a dataset that is a query, the report entry for it and the reason every metric over it is
  reported."
  [:map {:closed true}
   [:table          [:maybe ::ir/table]]
   [:fields         [:map-of :string ::field]]
   [:key-fields     [:set :string]]
   [:time-dimension [:maybe :string]]
   [:unsupported    [:maybe ::ir/unsupported]]])

(mu/defn- dataset-unique-id :- :string
  "The unique id of a dataset in the IR, `<model>.<dataset>`."
  [model-name   :- :string
   dataset-name :- :string]
  (str model-name "." dataset-name))

(mu/defn- parse-dataset :- ::dataset
  "Parse one dataset of the model named `model-name` in the `chosen` dialect (see `::dataset`). A field with no
  expression the import can read is left out, logged, and reported where a metric refers to it; the dataset itself
  is still read."
  [model-name :- :string
   chosen     :- ::dialect/chosen
   {dataset-name :name, :keys [source description fields primary_key unique_keys]} :- ::document/dataset]
  (let [parsed   (into []
                       (keep (fn [field]
                               (unsupported/catching #(parse-field chosen field)
                                                     (fn [reason]
                                                       (log/warnf "Dataset %s: %s" (pr-str dataset-name) reason)
                                                       nil))))
                       fields)
        by-name  (m/index-by (comp :name :field) parsed)
        relation (parse-source source)
        times    (for [{:keys [field kind]} parsed
                       :when (and (= kind :dimension) (time-field? field))]
                   (:name field))]
    {:table          (when relation
                       {:name        dataset-name
                        :label       nil
                        :description description
                        :relation    relation
                        :columns     (into {} (map (juxt :name identity)) (keep column parsed))
                        :dimensions  (into [] (comp (filter #(= :dimension (:kind %))) (map dimension)) parsed)
                        :expressions (into [] (comp (filter #(= :expression (:kind %))) (map expression)) parsed)
                        :keys        (vec (for [field-name primary_key]
                                            {:name field-name
                                             ;; a key naming no field is read as a column, the 0.1.1 way
                                             :expr (or (:expr (get by-name field-name)) field-name)}))
                        :joins       []
                        :aliases     #{dataset-name}})
     :fields         by-name
     :key-fields     (into (set primary_key) cat unique_keys)
     :time-dimension (when (= 1 (count times))
                       (first times))
     :unsupported    (when-not relation
                       (unsupported/report :table dataset-name (dataset-unique-id model-name dataset-name)
                                           (format (str "dataset %s is defined by the query %s, not a table; a metric"
                                                        " is over a table")
                                                   (pr-str dataset-name) (pr-str source))))}))

(mu/defn- field-column :- [:maybe :string]
  "The column the field named `field-name` of `dataset` is; nil when the dataset has no such field or the field is SQL,
  which an implicit join has no use for: it needs a column on each side."
  [dataset    :- ::dataset
   field-name :- :string]
  (when-let [{:keys [expr]} (get (:fields dataset) field-name)]
    (let [{:keys [kind], column-name :name} (sql/parse-expr expr)]
      (when (= kind :column)
        column-name))))

(mu/defn- relationship-join :- ::ir/join
  "The join the relationship `relationship` is, from its `from` dataset: to its `to` dataset through the column its
  one `from_columns` field is, which Metabase follows as an implicit join on the instance's foreign key. The join
  cannot be made, and says why, when the `to` dataset is not in the model, when the key is composite, when the field
  on either side is missing or is SQL rather than a column, or when the `to` field is not a key of its dataset, among
  the keys it declares (a relationship on anything else would multiply the rows). What is behind such a join, the `to`
  dataset's dimensions, is what the dimension set reports."
  [datasets :- [:map-of :string ::dataset]
   {:keys [name from to from_columns to_columns]} :- ::document/relationship]
  (let [target      (get datasets to)
        unreachable (vec (map :name (-> target :table :dimensions)))
        unsupported (fn [reason & args]
                      {:name name, :reason (apply format reason args), :unreachable unreachable})]
    (cond
      (not target)
      (unsupported "relationship %s leads to dataset %s, which the model does not have" (pr-str name) (pr-str to))

      (not (:table target))
      (unsupported "relationship %s leads to dataset %s, which is a query, not a table" (pr-str name) (pr-str to))

      (or (next from_columns) (next to_columns))
      (unsupported (str "relationship %s is on a composite key (%s to %s); an implicit join is on one column of each"
                        " side")
                   (pr-str name) (str/join ", " from_columns) (str/join ", " to_columns))

      (not (get-in datasets [from :fields (first from_columns)]))
      (unsupported "relationship %s is on %s, which is not a field of dataset %s"
                   (pr-str name) (pr-str (first from_columns)) (pr-str from))

      (not (get-in target [:fields (first to_columns)]))
      (unsupported "relationship %s leads to %s, which is not a field of dataset %s"
                   (pr-str name) (pr-str (first to_columns)) (pr-str to))

      (not (field-column (get datasets from) (first from_columns)))
      (unsupported "relationship %s is on %s, which is the SQL expression %s, not a column; an implicit join needs a column"
                   (pr-str name) (pr-str (first from_columns))
                   (pr-str (get-in datasets [from :fields (first from_columns) :expr])))

      (not (field-column target (first to_columns)))
      (unsupported (str "relationship %s leads to %s of dataset %s, which is the SQL expression %s, not a column; an"
                        " implicit join needs a column")
                   (pr-str name) (pr-str (first to_columns)) (pr-str to)
                   (pr-str (get-in target [:fields (first to_columns) :expr])))

      (and (seq (:key-fields target)) (not (contains? (:key-fields target) (first to_columns))))
      (unsupported (str "relationship %s leads to %s of dataset %s, which is not among its keys (%s); a join to"
                        " anything but a key would multiply the rows")
                   (pr-str name) (pr-str (first to_columns)) (pr-str to)
                   (str/join ", " (sort (:key-fields target))))

      :else
      {:name name, :table to, :source-column (field-column (get datasets from) (first from_columns))})))

(mu/defn- with-joins :- [:map-of :string ::dataset]
  "`datasets` with each table's joins: one per relationship from it, in the model's order (see
  [[relationship-join]]). A relationship from a dataset the model does not have is logged and dropped: nothing in the
  import could reach through it."
  [datasets      :- [:map-of :string ::dataset]
   relationships :- [:sequential ::document/relationship]]
  (reduce (fn [datasets {:keys [name from] :as relationship}]
            (if (get-in datasets [from :table])
              (update-in datasets [from :table :joins] conj (relationship-join datasets relationship))
              (do
                (log/warnf "Relationship %s is from dataset %s, which the model does not have, or which is a query"
                           (pr-str name) (pr-str from))
                datasets)))
          datasets
          relationships))

(mu/defn- sql-model :- ::metric-sql/model
  "`datasets` and `relationships` as the metric SQL resolves against them (see
  [[metabase-enterprise.semantic-layer-import.ossie.metric-sql]]): the datasets that are tables, with their fields."
  [datasets      :- [:map-of :string ::dataset]
   relationships :- [:sequential ::document/relationship]]
  {:datasets      (into {}
                        (keep (fn [[dataset-name {:keys [table fields]}]]
                                (when table
                                  [dataset-name {:name   dataset-name
                                                 :fields (update-vals fields (fn [{:keys [field kind]}]
                                                                               {:name (:name field), :kind kind}))}])))
                        datasets)
   :relationships (mapv #(select-keys % [:name :from :to]) relationships)})

(mu/defn- metric-meta :- [:maybe [:map {::mr/deliberately-open true, :description "free-form metadata"}]]
  "The project's own metadata on a metric, carried for a later mapping and written nowhere: its `datatype`,
  `ai_context` and `custom_extensions`, when it has any."
  [metric :- ::document/metric]
  (not-empty (m/remove-vals nil? (select-keys metric [:datatype :ai_context :custom_extensions]))))

(mu/defn- parse-metric :- ::ir/metric.simple
  "The IR metric for `metric`: a simple metric over the base dataset its SQL works out, aggregated by that SQL with its
  references as placeholders (see [[metric-sql/aggregation]]). `scope` is the dataset of a dataset-scoped metric, nil
  for a model-scoped one; the former is named `<dataset>.<metric>`, as the spec says it is referred to, and its unique
  id carries the model's name as every metric's does. [[unsupported/throw-reason]] for a metric the IR has no place
  for, see [[metabase-enterprise.semantic-layer-import.ossie.metric-sql]], a metric over a dataset that is a query
  among them."
  [model-name :- :string
   chosen     :- ::dialect/chosen
   datasets   :- [:map-of :string ::dataset]
   sql-model  :- ::metric-sql/model
   scope      :- [:maybe :string]
   {metric-name :name, :keys [description] :as metric} :- ::document/metric]
  (let [ir-name   (if scope (str scope "." metric-name) metric-name)
        unique-id (str/join "." (remove nil? [model-name scope metric-name]))
        scoped    (when scope (get datasets scope))]
    (when (and scope (not (:table scoped)))
      (unsupported/throw-reason (or (:reason (:unsupported scoped))
                                    (format "dataset %s could not be parsed" (pr-str scope)))))
    (let [{:keys [expression]} (or (dialect/pick chosen (:expression metric))
                                   (unsupported/throw-reason "the metric has no expression in %s"
                                                             (str/join ", " (cond->> dialect/portable
                                                                              chosen (cons chosen)))))
          {:keys [table aggregation]} (unsupported/with-reason-prefix (str "expr " (pr-str expression))
                                        #(metric-sql/aggregation sql-model scope (dialect/sqlglot-dialect chosen)
                                                                 expression))]
      {:type            :simple
       :name            ir-name
       :unique-id       unique-id
       :label           metric-name
       :description     description
       :filters         []
       :fill-nulls-with nil
       :time-grain      nil
       :meta            (metric-meta metric)
       :table           table
       :aggregation     aggregation
       :time-dimension  (get-in datasets [table :time-dimension])})))

(mu/defn- error-report :- ::ir/unsupported
  "The `:unsupported` entry for an entry of the document that threw something other than an unsupported reason while
  it was parsed: a bug in the parser or an input it did not anticipate, logged with its stack and flagged `:error?`
  so the report tells it apart from what the import chose not to convert."
  [kind       :- ::ir/content-kind
   what       :- :string
   entry-name :- :string
   unique-id  :- :string
   e          :- (ms/InstanceOfClass Throwable)]
  (log/errorf e "Error parsing %s %s" what (pr-str entry-name))
  (assoc (unsupported/report kind entry-name unique-id
                             (format "error parsing %s (%s): %s" what (pr-str (class e)) (ex-message e)))
         :error? true))

(mu/defn- parse-metric-or-report :- [:or ::ir/metric.simple ::ir/unsupported]
  "[[parse-metric]], or the report entry for a metric that could not be one, with the reason, or that the parser
  failed on (see [[error-report]])."
  [model-name :- :string
   chosen     :- ::dialect/chosen
   datasets   :- [:map-of :string ::dataset]
   sql-model  :- ::metric-sql/model
   scope      :- [:maybe :string]
   {metric-name :name, :as metric} :- ::document/metric]
  (let [ir-name   (if scope (str scope "." metric-name) metric-name)
        unique-id (str/join "." (remove nil? [model-name scope metric-name]))]
    (try
      (unsupported/catching #(parse-metric model-name chosen datasets sql-model scope metric)
                            #(unsupported/report :metric ir-name unique-id %))
      (catch Exception e
        (error-report :metric "metric" ir-name unique-id e)))))

(mu/defn- parse-dataset-or-report :- [:or ::dataset ::ir/unsupported]
  "[[parse-dataset]], or the report entry for a dataset the parser failed on (see [[error-report]]); the metrics over
  such a dataset are then reported as over a dataset the model does not have."
  [model-name :- :string
   chosen     :- ::dialect/chosen
   {dataset-name :name, :as dataset} :- ::document/dataset]
  (try
    (parse-dataset model-name chosen dataset)
    (catch Exception e
      (error-report :table "dataset" dataset-name (dataset-unique-id model-name dataset-name) e))))

(mu/defn- expressions :- [:sequential ::document/expression]
  "Every expression in `model`: of its fields and its metrics, dataset-scoped ones included."
  [{:keys [datasets metrics]} :- ::document/model]
  (concat (mapcat (fn [{:keys [fields] dataset-metrics :metrics}]
                    (concat (map :expression fields) (map :expression dataset-metrics)))
                  datasets)
          (map :expression metrics)))

(mu/defn parse-model :- ::ir/semantic-layer
  "Parse `model`, a decoded Ossie document (see [[document/read-document]]), into the IR with the source's `options`
  (see `::options`). Metrics that cannot be parsed land in `:unsupported` with a reason instead of failing the run, and
  so does a dataset that is a query or could not be parsed."
  ([model :- ::document/model]
   (parse-model {} model))

  ([{option :dialect} :- ::options
    {model-name :name, :keys [version datasets relationships metrics] :as model} :- ::document/model]
   (let [chosen        (dialect/choose option (dialect/used (expressions model)))
         relationships (vec relationships)
         results       (into {}
                             (map (juxt :name #(parse-dataset-or-report model-name chosen %)))
                             datasets)
         parsed        (-> (m/remove-vals unsupported/report? results)
                           (with-joins relationships))
         sql-model     (sql-model parsed relationships)
         metric-of     (fn [scope metric]
                         (parse-metric-or-report model-name chosen parsed sql-model scope metric))
         all-metrics   (concat (for [{dataset-name :name, dataset-metrics :metrics} datasets
                                     metric dataset-metrics]
                                 (metric-of dataset-name metric))
                               (map #(metric-of nil %) metrics))]
     {:source      {:tool    tool
                    :version version
                    :project model-name}
      :warehouse   (dialect/warehouse chosen)
      :tables      (into {}
                         (keep (fn [[dataset-name {:keys [table]}]]
                                 (when table
                                   [dataset-name table])))
                         parsed)
      :metrics     (vec (remove unsupported/report? all-metrics))
      :unsupported (-> []
                       (into (filter unsupported/report?) (vals results))
                       (into (keep :unsupported) (vals parsed))
                       (into (filter unsupported/report?) all-metrics))})))

(mu/defn parse-file :- ::ir/semantic-layer
  "[[document/read-document]] then [[parse-model]]."
  ([filename :- :string]
   (parse-file {} filename))

  ([options  :- ::options
    filename :- :string]
   (parse-model options (document/read-document filename))))
