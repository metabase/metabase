(ns metabase-enterprise.semantic-layer-import.schemas.ir
  "The intermediate representation (IR) of a semantic layer: what a source parses its project into (see
  [[metabase-enterprise.semantic-layer-import.interface/raw->ir]]), and all the rest of the import reads.

  The IR is in the import's own terms, not any one tool's:

  * a *table* is a physical relation and what the semantic layer declares on it: its documented columns, the
    dimensions it can be broken out and filtered by, its named keys, and its joins to other tables. A dbt semantic
    model, a Cube cube and an OSI dataset are each one;
  * a *metric* is one aggregation over one table (`:simple`), the running total of one (`:cumulative`), or arithmetic
    over other metrics (`:ratio`, `:derived`);
  * a *filter* is a SQL condition in the warehouse's dialect in which every reference to the semantic layer's own
    objects (a dimension, perhaps through a join and bucketed by a time grain; a key; the metric's time dimension)
    stands as a placeholder identifier (see `::filter`).

  Whatever is the warehouse's stays as the source wrote it: column names, warehouse type strings, SQL. Mapping those
  to Metabase base types, field refs and MBQL is the resolve stage's job. Everything else that is the source's is the
  source's job: it applies its own defaulting rules, works out its own way of joining tables into `::join`s, rewrites
  its filter syntax into `::filter`s, and reports as `::unsupported` whatever it cannot put in this shape.

  The IR holds metrics. Another kind of content (a transform, say) would be a key of its own next to `:metrics`, with
  its schema here, a resolver and an emitter (see [[metabase-enterprise.semantic-layer-import.core]])."
  (:require
   [metabase.util.malli.registry :as mr]))

(mr/def ::relation-part
  "One of the three parts of a relation's name."
  [:enum :database :schema :table])

(mr/def ::relation
  "The physical table a table is built on, named as the source project spells it. `quoted` holds the parts the
  project wrote in quotes when it built the table, so the warehouse kept their spelling; the others it wrote bare, and
  a warehouse that folds the case of a bare identifier stores them folded (see
  [[metabase-enterprise.semantic-layer-import.metadata]]). Empty when the project does not say, which is read as
  nothing quoted."
  [:map {:closed true}
   [:database [:maybe :string]]
   [:schema   :string]
   [:table    :string]
   [:quoted   [:set ::relation-part]]])

(mr/def ::column
  "A column of the relation, as the source project documents it. `data-type` is the warehouse type string and may be
  missing when the project does not declare it. `quoted?` is whether the project writes the column's name in quotes,
  so the warehouse kept its spelling, as `quoted` on `::relation`."
  [:map {:closed true}
   [:name        :string]
   [:data-type   [:maybe :string]]
   [:description [:maybe :string]]
   [:quoted?     :boolean]])

(mr/def ::grain
  "A time grain by name: the name of a Metabase temporal unit (`day`, `week`, `month`, ...) where it is one, or
  whatever else the source calls it (a custom calendar's `retail_month`), which the resolve stage reports where it
  has to apply it."
  :string)

(mr/def ::dimension
  "Something a metric can be broken out and filtered by. `expr` is a bare column name or SQL. `grain` is the unit a
  `:time` dimension is bucketed by by default. `validity` is set on a `:time` dimension that bounds the validity window
  of a slowly changing dimension's rows, and says which bounds: such a dimension can be filtered on, but breaking a
  metric out by it would count every version of a row."
  [:map {:closed true}
   [:name        :string]
   [:type        [:enum :categorical :time]]
   [:expr        :string]
   [:grain       [:maybe ::grain]]
   [:validity    [:maybe [:set [:enum :start :end]]]]
   [:label       [:maybe :string]]
   [:description [:maybe :string]]])

(mr/def ::key
  "A named key of a table: the column, or SQL, that identifies something (a dbt entity). A filter can refer to it by
  name (see `::reference`)."
  [:map {:closed true}
   [:name :string]
   [:expr :string]])

(mr/def ::join.supported
  "A join from a table to the table named `table`. Metabase joins implicitly, through `source-column` of the table the
  join is on, whose foreign key the instance has to know."
  [:map {:closed true}
   [:name          :string]
   [:table         :string]
   [:source-column :string]])

(mr/def ::join.unsupported
  "A join the source could not make, and why. `unreachable` names what the dimension set reports with the reason: the
  dimensions behind the join, or the join's own name when nothing more specific is known, or nothing for a join that
  leads nowhere."
  [:map {:closed true}
   [:name        :string]
   [:reason      :string]
   [:unreachable [:sequential :string]]])

(mr/def ::join
  "A way from a table to another one, named the way a reference names it as a step of its `path` (see `::reference`),
  and the way the dimensions it reaches are prefixed when two dimensions of a metric would share a name. Either one
  the resolve stage can follow, or one the source could not make."
  [:or ::join.supported ::join.unsupported])

(mr/def ::table
  "One physical relation and everything the semantic layer declares on it. `name` is the source's name for it, by
  which metrics and joins refer to it. `columns` is keyed by name. `aliases` are the names by which a reference
  path can name the table itself, as SQL can name a table by an alias of its own (dbt's primary entity)."
  [:map {:closed true}
   [:name        :string]
   [:label       [:maybe :string]]
   [:description [:maybe :string]]
   [:relation    ::relation]
   [:columns     [:map-of :string ::column]]
   [:dimensions  [:sequential ::dimension]]
   [:keys        [:sequential ::key]]
   [:joins       [:sequential ::join]]
   [:aliases     [:set :string]]])

(mr/def ::bucket
  "How a reference to a time dimension is bucketed: nil for not at all, a nil `grain` for by the dimension's own
  grain, and otherwise by `grain`."
  [:maybe [:map {:closed true}
           [:grain [:maybe ::grain]]]])

(mr/def ::reference.dimension
  "A dimension of the table at the end of `path`, the joins to follow from the metric's table (or names of the table
  itself, see `aliases` on `::table`); an empty `path` is the metric's table."
  [:map {:closed true}
   [:kind   [:= :dimension]]
   [:path   [:sequential :string]]
   [:name   :string]
   [:bucket ::bucket]])

(mr/def ::reference.time-dimension
  "The metric's own time dimension (see `time-dimension` on `::metric.simple`)."
  [:map {:closed true}
   [:kind   [:= :time-dimension]]
   [:bucket ::bucket]])

(mr/def ::reference.key
  "A key of the metric's table, by name."
  [:map {:closed true}
   [:kind [:= :key]]
   [:name :string]])

(mr/def ::reference
  "What a placeholder in a filter's SQL stands for."
  [:multi {:dispatch :kind}
   [:dimension      ::reference.dimension]
   [:time-dimension ::reference.time-dimension]
   [:key            ::reference.key]])

(mr/def ::filter
  "A condition: `sql` in the warehouse's dialect, in which each key of `references` is an identifier standing for what
  it maps to, and any other identifier is a column of the metric's table. `text` is the filter as the source wrote
  it, which a report quotes."
  [:map {:closed true}
   [:text       :string]
   [:sql        :string]
   [:references [:map-of :string ::reference]]])

(mr/def ::aggregation
  "An aggregate function over `expr` with SQL's meaning: `expr` is a bare column name, a literal (`1`, or `*` under
  `:count`, for a row count) or SQL. `:count` counts the rows where `expr` is not null, `:count-distinct` its distinct
  values, and `:count-where` the rows where `expr`, a condition, holds. `percentile` is the fraction, between 0 and 1,
  of a `:percentile`."
  [:map {:closed true}
   [:operator   [:enum :sum :avg :min :max :median :percentile :count :count-distinct :count-where]]
   [:expr       :string]
   [:percentile {:optional true} [:and number? [:>= 0] [:<= 1]]]])

(mr/def ::metric-input
  "A reference from a ratio or derived metric to another metric: by name, with the alias a derived `expr` uses for it
  (nil means its name) and the filters that apply to this use of it only."
  [:map {:closed true}
   [:metric  :string]
   [:alias   [:maybe :string]]
   [:filters [:sequential ::filter]]])

(mr/def ::metric.common
  "What every metric has. `unique-id` is the source's own stable id for it, from which the ids the import writes are
  derived (see [[metabase-enterprise.semantic-layer-import.ids]]). `filters` apply to the metric itself; empty means
  none. `fill-nulls-with` is the value the metric takes where its aggregation is null. `time-grain` is the coarsest
  grain the metric is meant to be queried at; nil means its time dimension's own. `meta` is the project's free-form
  metadata, carried for a later mapping and not written anywhere."
  [:map {:closed true}
   [:type            [:enum :simple :cumulative :ratio :derived]]
   [:name            :string]
   [:unique-id       :string]
   [:label           :string]
   [:description     [:maybe :string]]
   [:filters         [:sequential ::filter]]
   [:fill-nulls-with [:maybe :int]]
   [:time-grain      [:maybe ::grain]]
   [:meta            [:maybe [:map {::mr/deliberately-open true, :description "free-form metadata"}]]]])

(mr/def ::metric.simple
  "One aggregation over the table named `table`. A cumulative metric is the same with its aggregation running over
  everything up to each row. `time-dimension` names the dimension of the table the metric is measured along over
  time: its default dimension, and what a `:time-dimension` reference refers to."
  [:merge
   ::metric.common
   [:map {:closed true}
    [:type           [:enum :simple :cumulative]]
    [:table          :string]
    [:aggregation    ::aggregation]
    [:time-dimension [:maybe :string]]]])

(mr/def ::metric.ratio
  "A ratio of two other metrics."
  [:merge
   ::metric.common
   [:map {:closed true}
    [:type        [:= :ratio]]
    [:numerator   ::metric-input]
    [:denominator ::metric-input]]])

(mr/def ::metric.derived
  "Arithmetic, as SQL in `expr`, over other metrics, which `expr` names by their alias or name."
  [:merge
   ::metric.common
   [:map {:closed true}
    [:type   [:= :derived]]
    [:expr   :string]
    [:inputs [:sequential ::metric-input]]]])

(mr/def ::metric
  "A metric of any kind, see `type`."
  [:multi {:dispatch :type}
   [:simple     ::metric.simple]
   [:cumulative ::metric.simple]
   [:ratio      ::metric.ratio]
   [:derived    ::metric.derived]])

(mr/def ::content-kind
  "What an entry of a report is about: a metric, or a table, which only the parse stage can fail on."
  [:enum :metric :table])

(mr/def ::unsupported
  "Something the import could not convert, and why: at parse time a metric that could not become a `::metric` (or,
  rarely, a table that could not be parsed), at resolve time a metric that has no Metabase equivalent. Reported
  rather than thrown so one bad entry does not fail the whole run. `error?` marks an entry that is not a case the
  import chose not to convert but an exception it did not anticipate, a bug or an input outside what it reads; absent
  means a reported case."
  [:map {:closed true}
   [:kind      ::content-kind]
   [:name      :string]
   [:unique-id :string]
   [:reason    :string]
   [:error?    {:optional true} :boolean]])

(mr/def ::source
  "Where a semantic layer came from: the `tool` that defines it (`\"dbt\"`), its version and the project's name, as
  the tool records them; nil where it does not. The tool's name prefixes every id the import derives (see
  [[metabase-enterprise.semantic-layer-import.ids]]) and names the collection by default."
  [:map {:closed true}
   [:tool    :string]
   [:version [:maybe :string]]
   [:project [:maybe :string]]])

(mr/def ::warehouse
  "What the source says about the warehouse the project was written for: the source's own name for it (dbt's
  `adapter_type`, `postgres`), and the Metabase driver that connects to it, when the source knows one. The config's
  `:driver` is checked against it (see [[metabase-enterprise.semantic-layer-import.core/check-driver]])."
  [:map {:closed true}
   [:type   [:maybe :string]]
   [:driver [:maybe :keyword]]])

(mr/def ::semantic-layer
  "Everything parsed from one semantic layer. `tables` is keyed by name; `metrics` is in the source's order (the
  resolve stage puts a metric after the metrics it refers to)."
  [:map {:closed true}
   [:source      ::source]
   [:warehouse   ::warehouse]
   [:tables      [:map-of :string ::table]]
   [:metrics     [:sequential ::metric]]
   [:unsupported [:sequential ::unsupported]]])
