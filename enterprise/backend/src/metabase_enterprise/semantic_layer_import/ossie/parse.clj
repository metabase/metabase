(ns metabase-enterprise.semantic-layer-import.ossie.parse
  "Turn an Apache Ossie semantic model (see [[metabase-enterprise.semantic-layer-import.ossie.document]]) into the IR
  (see [[metabase-enterprise.semantic-layer-import.schemas.ir]]).

  Pure apart from [[parse-file]]. Puts what Ossie says in the IR's terms:

  * a *dataset* becomes an IR table over the relation its `source` names (see [[parse-source]]); a dataset whose
    source is a query rather than a table is reported, and so is every metric that refers to it;
  * a *field* with a `dimension` becomes an IR dimension, a time one when `is_time` is true or, when it is left out, when
    the field's `datatype` is temporal (see [[time-field?]]); a field without one becomes an IR named expression, which
    a metric's SQL refers to and which is inlined there (an Ossie metric may only name fields, never the source's own
    columns). A field whose expression is a bare column documents that column, typed by the field's `datatype` (see
    [[datatype->base-type]]). The spec leaves open whether a field without `dimension` may be grouped by; the import
    reads `dimension` as the declaration of that (see [[parse-field]]);
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

  A metric the IR has no place for is reported in `:unsupported` with a reason, as is a dataset that is a query, a
  relationship from a dataset the model does not have, and the second of two datasets or metrics of one name; an
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
   [metabase.util.malli.registry :as mr]))

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

(mu/defn parse-source :- [:maybe ::ir/relation]
  "The relation a dataset's `source` names, `database.schema.table`, `schema.table` or `table`, each part quoted or
  bare (see [[sql/relation-parts]]; BigQuery's `` `project.dataset.table` `` is the three); nil when it is a query
  (anything else) or a name of more than three parts."
  [source :- :string]
  (let [parts (sql/relation-parts source)]
    (when (<= 1 (count parts) 3)
      (let [[table schema database] (reverse parts)]
        {:database (:name database)
         :schema   (:name schema)
         :table    (:name table)
         :quoted   (into #{}
                         (keep (fn [[part k]] (when (:quoted? part) k)))
                         [[table :table] [schema :schema] [database :database]])}))))

(mu/defn- source-reason :- :string
  "Why the dataset `dataset-name` with the `source` [[parse-source]] reads as no relation is reported: a name of too
  many parts, or a query."
  [dataset-name :- :string
   source       :- :string]
  (if-let [parts (sql/relation-parts source)]
    (format "dataset %s has the source %s, a name of %d parts; a table is named by at most three, database.schema.table"
            (pr-str dataset-name) (pr-str source) (count parts))
    (format "dataset %s is defined by the query %s, not a table; a metric is over a table"
            (pr-str dataset-name) (pr-str source))))

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
  "The `datatype`s 0.2.0.dev0 defaults `is_time` to true for, and `timestamp`, which writers use for a `DateTime`."
  #{"date" "time" "datetime" "datetimetz" "timestamp"})

(mu/defn- time-field? :- :boolean
  "Whether `field`, a field with a `dimension`, is a time dimension: its `is_time` when it says, else whether its
  `datatype` is temporal, as 0.2.0.dev0 defaults it and as Snowflake's 0.1.1 writer, which emits a `datatype` too, has
  it read. A field with no `datatype` is categorical."
  [{:keys [dimension datatype]} :- ::document/field]
  (let [{:keys [is_time]} dimension]
    (if (some? is_time)
      is_time
      (contains? temporal-datatypes (some-> datatype str/trim u/lower-case-en)))))

(mr/def ::parsed-field
  "A field as the parser reads it: with the expression text it is read by (see [[dialect/pick]]), and what it is in the
  IR's terms, a dimension or a named expression."
  [:map {:closed true}
   [:field ::document/field]
   [:expr  :string]
   [:kind  [:enum :dimension :expression]]])

(mu/defn- parse-field :- ::parsed-field
  "`field` read in the `chosen` dialect; [[unsupported/throw-reason]] when it has no expression the import can read. A
  field with a `dimension` is a dimension, one without a named expression: the spec defines `dimension` as the metadata
  of a field that is one, and says of fields only that they \"can be used for grouping, filtering, and in metric
  expressions\", without saying which; the writers that mark anything (Snowflake's, the TPC-DS example) mark the
  groupable fields with `dimension`, so the import reads it as the declaration, and a document that marks nothing gets
  metrics with no curated dimensions rather than a dimension per column."
  [chosen                           :- ::dialect/chosen
   {field-name :name, :as field}    :- ::document/field]
  (if-let [{:keys [expression]} (dialect/pick chosen (:expression field))]
    {:field field
     :expr  expression
     :kind  (if (:dimension field) :dimension :expression)}
    (unsupported/throw-reason "field %s has no expression in %s" (pr-str field-name)
                              (str/join ", " (dialect/candidates chosen)))))

(mu/defn- column :- [:maybe ::ir/column]
  "The column a field documents, when its expression is a bare column: named as written, quoted or not as written
  (see [[sql/parse-expr]]), typed by the field's `datatype`, described by the field."
  [{:keys [field expr]} :- ::parsed-field]
  (let [{:keys [kind quoted?], column-name :name} (sql/parse-expr expr)]
    (when (= kind :column)
      {:name        column-name
       :data-type   nil
       :base-type   (base-type (:datatype field))
       :description (:description field)
       :quoted?     quoted?})))

(mu/defn- field-dimension :- ::ir/dimension
  "The IR dimension a field with a `dimension` is: categorical or time (see [[time-field?]]), over its expression."
  [{:keys [field expr]} :- ::parsed-field]
  {:name        (:name field)
   :type        (if (time-field? field) :time :categorical)
   :expr        expr
   :grain       nil
   :validity    nil
   :label       (:label field)
   :description (:description field)})

(mu/defn- field-expression :- ::ir/expression
  "The IR named expression a field without a `dimension` is."
  [{:keys [field expr]} :- ::parsed-field]
  {:name        (:name field)
   :expr        expr
   :label       (:label field)
   :description (:description field)})

(mr/def ::key
  "A primary or unique key of a dataset: the names of its fields, one for a simple key."
  [:sequential {:min 1} :string])

(mr/def ::dataset
  "A dataset as the parser reads it: its name, the IR table it becomes, its joins not yet known, its fields by name as
  the metric SQL sees them, the fields left out for want of a readable expression with the reason, the keys it
  declares (`primary_key` and `unique_keys`, each as the tuple of field names it is), and its one time dimension when
  it has exactly one. For a dataset that is a query, the table is nil and `unsupported` is the report entry for it,
  whose reason every metric over it is reported with."
  [:map {:closed true}
   [:name           :string]
   [:table          [:maybe ::ir/table]]
   [:fields         [:map-of :string ::parsed-field]]
   [:dropped        [:map-of :string :string]]
   [:keys           [:set ::key]]
   [:time-dimension [:maybe :string]]
   [:unsupported    [:maybe ::ir/unsupported]]])

(mu/defn- escape-part :- :string
  "`part` of a unique id with its backslashes and dots escaped, so that the parts of an id can be told apart whatever
  a name holds."
  [part :- :string]
  (-> part
      (str/replace "\\" "\\\\")
      (str/replace "." "\\.")))

(mu/defn- unique-id :- :string
  "The unique id of an entry of the model, its `parts` (nil ones left out) joined with dots: `<model>.<dataset>` for a
  dataset, `<model>.<metric>` for a model-scoped metric, `<model>.<dataset>.<metric>` for a dataset-scoped one. Each
  part is escaped (see [[escape-part]]) so that no two entries share an id: dataset-scoped metric `b` of dataset `a` is
  `m.a.b`, and a model-scoped metric named `a.b` is `m.a\\.b`."
  [& parts :- [:* [:maybe :string]]]
  (str/join "." (map escape-part (remove nil? parts))))

(mr/def ::parsed-fields
  "What [[parse-fields]] makes of a dataset's fields: the ones read, in order, and the ones left out, by name with the
  reason."
  [:map {:closed true}
   [:parsed  [:sequential ::parsed-field]]
   [:dropped [:map-of :string :string]]])

(mu/defn- parse-fields :- ::parsed-fields
  "The `fields` of the dataset `dataset-name` read in the `chosen` dialect. A field with no expression the import can
  read is left out and logged, and the reason kept: a metric that refers to it is reported with it. The second field of
  a name is left out and logged too: the fields are read by name, so the first is the one."
  [dataset-name :- :string
   chosen       :- ::dialect/chosen
   fields       :- [:maybe [:sequential ::document/field]]]
  (reduce (fn [acc {field-name :name, :as field}]
            (if (some #(= field-name (-> % :field :name)) (:parsed acc))
              (do
                (log/warnf "Dataset %s: field %s is declared more than once; the first is read" (pr-str dataset-name)
                           (pr-str field-name))
                acc)
              (unsupported/catching #(update acc :parsed conj (parse-field chosen field))
                                    (fn [reason]
                                      (log/warnf "Dataset %s: %s" (pr-str dataset-name) reason)
                                      (assoc-in acc [:dropped field-name] reason)))))
          {:parsed [], :dropped {}}
          fields))

(mu/defn- parse-dataset :- ::dataset
  "Parse one dataset of the model named `model-name` in the `chosen` dialect (see `::dataset`)."
  [model-name :- :string
   chosen     :- ::dialect/chosen
   {dataset-name :name, :keys [source description fields], primary-key :primary_key, unique-keys :unique_keys}
   :- ::document/dataset]
  (let [{:keys [parsed dropped]} (parse-fields dataset-name chosen fields)
        by-name                  (m/index-by (comp :name :field) parsed)
        relation                 (parse-source source)
        {dimensions  :dimension
         expressions :expression} (group-by :kind parsed)
        times                    (into []
                                       (comp (filter #(time-field? (:field %)))
                                             (map (comp :name :field)))
                                       dimensions)]
    {:name           dataset-name
     :table          (when relation
                       {:name        dataset-name
                        :label       nil
                        :description description
                        :relation    relation
                        :columns     (into {} (comp (keep column) (map (juxt :name identity))) parsed)
                        :dimensions  (mapv field-dimension dimensions)
                        :expressions (mapv field-expression expressions)
                        :keys        (mapv (fn [field-name]
                                             {:name field-name
                                              ;; a key naming no field is read as a column, the 0.1.1 way
                                              :expr (or (:expr (get by-name field-name)) field-name)})
                                           primary-key)
                        :joins       []
                        :aliases     #{dataset-name}})
     :fields         by-name
     :dropped        dropped
     :keys           (into #{} (comp (remove empty?) (map vec)) (cons primary-key unique-keys))
     :time-dimension (when (= 1 (count times))
                       (first times))
     :unsupported    (when-not relation
                       (unsupported/report :table dataset-name (unique-id model-name dataset-name)
                                           (source-reason dataset-name source)))}))

(mu/defn- key? :- :boolean
  "Whether the field named `field-name` is, on its own, one of `dataset`'s keys, the names compared ignoring case as a
  key names them."
  [dataset    :- ::dataset
   field-name :- :string]
  (contains? (into #{} (map #(mapv u/lower-case-en %)) (:keys dataset))
             [(u/lower-case-en field-name)]))

(mu/defn- key-names :- :string
  "The keys `dataset` declares, for a message: each tuple's fields joined with `+`, sorted."
  [dataset :- ::dataset]
  (str/join ", " (sort (map #(str/join "+" (map pr-str %)) (:keys dataset)))))

(mu/defn- relationship-join :- ::ir/join
  "The join the relationship `relationship` is, from its `from` dataset: to its `to` dataset through the column its
  one `from_columns` field is, which Metabase follows as an implicit join on the instance's foreign key. Dataset and
  field names match ignoring case, as the metric SQL's do. The join cannot be made, and says why, when the `to` dataset
  is not in the model, when the key is composite, when the field on either side is missing or is SQL rather than a
  column, or when the `to` field is not on its own a key of its dataset, among the keys it declares (a relationship on
  anything else, a part of a composite key included, would multiply the rows). What is behind such a join, the `to`
  dataset's dimensions, is what the dimension set reports."
  [datasets :- [:map-of :string ::dataset]
   {relationship-name :name, :keys [from to], [from-field & more-from] :from_columns, [to-field & more-to] :to_columns}
   :- ::document/relationship]
  (let [source        (metric-sql/find-named datasets from)
        target        (metric-sql/find-named datasets to)
        source-field  (some-> source :fields (metric-sql/find-named from-field))
        target-field  (some-> target :fields (metric-sql/find-named to-field))
        source-column (some-> source-field :expr sql/column-name)
        target-column (some-> target-field :expr sql/column-name)
        cannot        (fn [reason & args]
                        {:name        relationship-name
                         :reason      (apply format reason args)
                         :unreachable (mapv :name (-> target :table :dimensions))})]
    (cond
      (not target)
      (cannot "relationship %s leads to dataset %s, which the model does not have" (pr-str relationship-name) (pr-str to))

      (not (:table target))
      (cannot "relationship %s leads to dataset %s, which is a query, not a table" (pr-str relationship-name) (pr-str to))

      (or more-from more-to)
      (cannot "relationship %s is on a composite key (%s to %s); an implicit join is on one column of each side"
              (pr-str relationship-name)
              (str/join ", " (map pr-str (cons from-field more-from)))
              (str/join ", " (map pr-str (cons to-field more-to))))

      (not source-field)
      (cannot "relationship %s is on %s, which is not a field of dataset %s"
              (pr-str relationship-name) (pr-str from-field) (pr-str from))

      (not target-field)
      (cannot "relationship %s leads to %s, which is not a field of dataset %s"
              (pr-str relationship-name) (pr-str to-field) (pr-str to))

      (not source-column)
      (cannot "relationship %s is on %s, which is the SQL expression %s, not a column; an implicit join needs a column"
              (pr-str relationship-name) (pr-str from-field) (pr-str (:expr source-field)))

      (not target-column)
      (cannot (str "relationship %s leads to %s of dataset %s, which is the SQL expression %s, not a column; an"
                   " implicit join needs a column")
              (pr-str relationship-name) (pr-str to-field) (pr-str to) (pr-str (:expr target-field)))

      (and (seq (:keys target)) (not (key? target (-> target-field :field :name))))
      (cannot (str "relationship %s leads to %s of dataset %s, which is not on its own among its keys (%s); a join to"
                   " anything but a key would multiply the rows")
              (pr-str relationship-name) (pr-str to-field) (pr-str to) (key-names target))

      :else
      {:name relationship-name, :table (:name target), :source-column source-column})))

(mr/def ::joined
  "What [[with-joins]] makes of the relationships: the datasets with their joins, and the report entries for the
  relationships from a dataset the model does not have."
  [:map {:closed true}
   [:datasets    [:map-of :string ::dataset]]
   [:unsupported [:sequential ::ir/unsupported]]])

(mu/defn- with-joins :- ::joined
  "`datasets` with each table's joins: one per relationship from it, in the model's order (see
  [[relationship-join]]). A relationship from a dataset the model does not have is reported: nothing in the import
  could reach through it, so no metric will say so. One from a dataset that is a query is logged and dropped: the
  dataset is reported already, and so is every metric over it."
  [model-name    :- :string
   datasets      :- [:map-of :string ::dataset]
   relationships :- [:sequential ::document/relationship]]
  (reduce (fn [acc {relationship-name :name, :keys [from] :as relationship}]
            (let [source (metric-sql/find-named datasets from)]
              (cond
                (:table source)
                (update-in acc [:datasets (:name source) :table :joins] conj (relationship-join datasets relationship))

                source
                (do
                  (log/warnf "Relationship %s is from dataset %s, which is a query" (pr-str relationship-name)
                             (pr-str from))
                  acc)

                :else
                (update acc :unsupported conj
                        (unsupported/report :relationship relationship-name (unique-id model-name relationship-name)
                                            (format (str "relationship %s is from dataset %s, which the model does not"
                                                         " have; no metric can reach through it")
                                                    (pr-str relationship-name) (pr-str from)))))))
          {:datasets datasets, :unsupported []}
          relationships))

(mu/defn- metric-sql-model :- ::metric-sql/model
  "`datasets` and `relationships` as the metric SQL resolves against them (see
  [[metabase-enterprise.semantic-layer-import.ossie.metric-sql]]): every dataset with its fields, the ones left out,
  and, for a dataset that is a query, the reason a reference to it is reported with; the relationships between the
  datasets' declared names, whatever case the relationship spells them in."
  [datasets      :- [:map-of :string ::dataset]
   relationships :- [:sequential ::document/relationship]]
  (let [declared-name (fn [dataset-name]
                        (or (:name (metric-sql/find-named datasets dataset-name)) dataset-name))]
    {:datasets      (update-vals datasets (fn [{:keys [fields dropped unsupported] :as dataset}]
                                            {:name    (:name dataset)
                                             :fields  (update-vals fields (fn [{:keys [field kind]}]
                                                                            {:name (:name field), :kind kind}))
                                             :dropped dropped
                                             :reason  (:reason unsupported)}))
     :relationships (mapv (fn [{relationship-name :name, :keys [from to]}]
                            {:name relationship-name, :from (declared-name from), :to (declared-name to)})
                          relationships)}))

(mu/defn- metric-meta :- [:maybe [:map {::mr/deliberately-open true, :description "free-form metadata"}]]
  "The project's own metadata on a metric, carried for a later mapping and written nowhere: its `datatype`,
  `ai_context` and `custom_extensions`, when it has any."
  [metric :- ::document/metric]
  (not-empty (m/remove-vals nil? (select-keys metric [:datatype :ai_context :custom_extensions]))))

(mr/def ::context
  "What parsing a metric needs of the rest of the model: the model's name, the dialect the document is read in, the
  datasets, and the model as the metric SQL sees it (see [[metric-sql-model]])."
  [:map {:closed true}
   [:model-name :string]
   [:chosen     ::dialect/chosen]
   [:datasets   [:map-of :string ::dataset]]
   [:sql-model  ::metric-sql/model]])

(mr/def ::scoped-metric
  "A metric of the document with the dataset it is scoped to, nil for a model-scoped one, and the IR name and unique id
  it gets (see [[metric-names]])."
  [:map {:closed true}
   [:scope     [:maybe :string]]
   [:metric    ::document/metric]
   [:name      :string]
   [:unique-id :string]])

(mu/defn- metric-names :- ::scoped-metric
  "`metric`, scoped to `scope`, with its IR name and unique id: a dataset-scoped metric is named `<dataset>.<metric>`,
  as the spec says it is referred to, a model-scoped one by its own name; both unique ids carry the model's name (see
  [[unique-id]])."
  [model-name :- :string
   scope      :- [:maybe :string]
   {metric-name :name, :as metric} :- ::document/metric]
  {:scope     scope
   :metric    metric
   :name      (if scope (str scope "." metric-name) metric-name)
   :unique-id (unique-id model-name scope metric-name)})

(mu/defn- parse-metric :- ::ir/metric.simple
  "The IR metric for `scoped`, a metric of the document with its scope and names: a simple metric over the base dataset
  its SQL works out, aggregated by that SQL with its references as placeholders (see [[metric-sql/analyze]]).
  [[unsupported/throw-reason]] for a metric the IR has no place for, see
  [[metabase-enterprise.semantic-layer-import.ossie.metric-sql]], a metric of a dataset that is a query among them."
  [{:keys [chosen datasets sql-model]}  :- ::context
   {:keys [scope metric unique-id], ir-name :name} :- ::scoped-metric]
  (let [{metric-name :name, :keys [description]} metric
        scoped                                   (when scope (get datasets scope))]
    (when (and scope (not (:table scoped)))
      (unsupported/throw-reason (or (:reason (:unsupported scoped))
                                    (format "dataset %s could not be parsed" (pr-str scope)))))
    (let [{:keys [expression]} (or (dialect/pick chosen (:expression metric))
                                   (unsupported/throw-reason "the metric has no expression in %s"
                                                             (str/join ", " (dialect/candidates chosen))))
          {:keys [table aggregation]} (unsupported/with-reason-prefix (str "expr " (pr-str expression))
                                        #(metric-sql/analyze sql-model scope (dialect/sqlglot-dialect chosen)
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

(mu/defn- parse-metric-or-report :- [:or ::ir/metric.simple ::ir/unsupported]
  "[[parse-metric]], or the report entry for a metric that could not be one, with the reason, or that the parser
  failed on (see [[unsupported/error-report]])."
  [context                             :- ::context
   {:keys [unique-id], ir-name :name, :as scoped} :- ::scoped-metric]
  (try
    (unsupported/catching #(parse-metric context scoped)
                          #(unsupported/report :metric ir-name unique-id %))
    (catch Exception e
      (unsupported/error-report :metric "metric" ir-name unique-id e))))

(mu/defn- parse-dataset-or-report :- [:or ::dataset ::ir/unsupported]
  "[[parse-dataset]], or the report entry for a dataset the parser failed on (see [[unsupported/error-report]]); the
  metrics over such a dataset are then reported as over a dataset the model does not have."
  [model-name :- :string
   chosen     :- ::dialect/chosen
   {dataset-name :name, :as dataset} :- ::document/dataset]
  (try
    (parse-dataset model-name chosen dataset)
    (catch Exception e
      (unsupported/error-report :table "dataset" dataset-name (unique-id model-name dataset-name) e))))

(mu/defn- expressions :- [:sequential ::document/expression]
  "Every expression in `model`: of its fields and its metrics, dataset-scoped ones included."
  [{:keys [datasets metrics]} :- ::document/model]
  (-> []
      (into (mapcat (fn [{:keys [fields], dataset-metrics :metrics}]
                      (map :expression (concat fields dataset-metrics))))
            datasets)
      (into (map :expression) metrics)))

(mr/def ::named
  "An entry of the document, or of the parser's reading of it, with a `name`."
  [:map {::mr/deliberately-open true, :description "an entry with a name"}
   [:name :string]])

(mr/def ::deduplicated
  "What [[split-duplicates]] makes of entries by name: the first of each name, in order, and the later ones of a name
  already seen."
  [:map {:closed true}
   [:kept       [:sequential ::named]]
   [:duplicates [:sequential ::named]]])

(mu/defn- split-duplicates :- ::deduplicated
  "`entries` split into the first entry of each name, in order, and the later entries of a name already seen, which
  are reported: a name is how the rest of the import refers to a dataset or a metric, so two of one name would be one
  card, the second written over the first."
  [entries :- [:sequential ::named]]
  (-> (reduce (fn [{:keys [seen] :as acc} {entry-name :name, :as entry}]
                (if (contains? seen entry-name)
                  (update acc :duplicates conj entry)
                  (-> acc
                      (update :kept conj entry)
                      (update :seen conj entry-name))))
              {:kept [], :duplicates [], :seen #{}}
              entries)
      (dissoc :seen)))

(mu/defn- duplicate-report :- ::ir/unsupported
  "The report entry for `entry`, the second declaration of a `kind` (`what`, for the message) of one name."
  [kind      :- ::ir/content-kind
   what      :- :string
   unique-id :- :string
   {entry-name :name} :- ::named]
  (unsupported/report kind entry-name unique-id
                      (format "%s %s is declared more than once; the first declaration is read and this one is not"
                              what (pr-str entry-name))))

(mu/defn parse-model :- ::ir/semantic-layer
  "Parse `model`, a decoded Ossie document (see [[document/read-document]]), into the IR with the source's `options`
  (see `::options`). Metrics that cannot be parsed land in `:unsupported` with a reason instead of failing the run, and
  so does a dataset that is a query or could not be parsed, a relationship from a dataset the model does not have, and
  the second of two datasets or metrics of one name. The report entries are in the document's order: datasets,
  relationships, then metrics."
  ([model :- ::document/model]
   (parse-model {} model))

  ([{option :dialect} :- ::options
    {model-name :name, :keys [version datasets relationships metrics] :as model} :- ::document/model]
   (let [chosen          (dialect/choose option (dialect/used (expressions model)))
         relationships   (vec relationships)
         {kept-datasets      :kept
          duplicate-datasets :duplicates} (split-duplicates datasets)
         dataset-results (mapv #(parse-dataset-or-report model-name chosen %) kept-datasets)
         parsed          (into {}
                               (comp (remove unsupported/report?) (map (juxt :name identity)))
                               dataset-results)
         joined          (with-joins model-name parsed relationships)
         context         {:model-name model-name
                          :chosen     chosen
                          :datasets   (:datasets joined)
                          :sql-model  (metric-sql-model (:datasets joined) relationships)}
         {kept-metrics      :kept
          duplicate-metrics :duplicates} (split-duplicates
                                          (-> []
                                              (into (mapcat (fn [{dataset-name :name, dataset-metrics :metrics}]
                                                              (map #(metric-names model-name dataset-name %)
                                                                   dataset-metrics)))
                                                    kept-datasets)
                                              (into (map #(metric-names model-name nil %)) metrics)))
         {converted false
          reported  true}  (group-by unsupported/report? (mapv #(parse-metric-or-report context %) kept-metrics))]
     {:source      {:tool    tool
                    :version version
                    :project model-name}
      :warehouse   (dialect/warehouse chosen)
      :tables      (into {}
                         (keep (fn [[dataset-name {:keys [table]}]]
                                 (when table
                                   [dataset-name table])))
                         (:datasets joined))
      :metrics     (vec converted)
      :unsupported (-> []
                       (into (keep (fn [result]
                                     (if (unsupported/report? result) result (:unsupported result))))
                             dataset-results)
                       (into (map (fn [{dataset-name :name, :as dataset}]
                                    (duplicate-report :table "dataset" (unique-id model-name dataset-name) dataset)))
                             duplicate-datasets)
                       (into (:unsupported joined))
                       (into reported)
                       (into (map (fn [{:keys [unique-id] :as scoped}]
                                    (duplicate-report :metric "metric" unique-id scoped)))
                             duplicate-metrics))})))

(mu/defn parse-file :- ::ir/semantic-layer
  "[[document/read-document]] then [[parse-model]]."
  ([filename :- :string]
   (parse-file {} filename))

  ([options  :- ::options
    filename :- :string]
   (parse-model options (document/read-document filename))))
