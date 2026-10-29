(ns dev.dbt-import.resolve.dimensions
  "The resolve stage's curated dimension set: the dimensions a converted metric can be broken out by.

  Each metric gets the dbt dimensions of its own semantic model, the dimensions of every semantic model its foreign
  and unique entities join to (see [[resolve.columns/join-context]]), and the metric's `agg_time_dimension` as the
  default, bucketed by the metric's `time_granularity` when it has one (see [[dimension-set]]). A dimension mapping
  targets a column, so a dimension whose `expr` is SQL is reported per metric rather than written, as is a dimension
  that bounds a slowly changing dimension's validity window and an entity that joins through one (see
  [[resolve.columns/natural-targets]]). Ids are derived, not generated, so a re-run writes the same ids and a
  re-import updates the dimensions in place. Every dimension is written `:status/active`, the status the instance
  gives a dimension whose column it finds, so its first refresh of the set changes nothing."
  (:require
   [better-cond.core :as b]
   [clojure.string :as str]
   [dev.dbt-import.ids :as ids]
   [dev.dbt-import.resolve.columns :as resolve.columns]
   [dev.dbt-import.resolve.filters :as resolve.filters]
   [dev.dbt-import.schemas.ir :as ir]
   [dev.dbt-import.schemas.resolved :as resolved]
   [dev.dbt-import.unsupported :as unsupported]
   [medley.core :as m]
   [metabase.lib-metric.schema :as lib-metric.schema]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
   [metabase.util.humanization :as u.humanization]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(mu/defn- dimension-group :- ::lib.schema.metadata/dimension-group
  "The group of the dimensions of `semantic-model`: the metric's own table (`main`) or one joined to (`connection`),
  named after the semantic model's label, or its table when it has none. The id is derived from that name (see
  [[ids/group-id]]), so a re-run writes the same ids. The groups carry dbt's labels by design: they are the names the
  project gives its models, and they are stable across re-imports. The instance names the groups it computes for the
  same table after the table's and the foreign key's display names, so a dimension added later in the UI sits in a
  sibling group next to the imported one."
  [group-type               :- [:enum "main" "connection"]
   {:keys [label relation]} :- ::ir/semantic-model]
  (let [group-name (or label (:table relation))]
    {:id           (ids/group-id group-type group-name)
     :type         group-type
     :display-name group-name}))

(mu/defn- display-name :- ::lib.schema.common/non-blank-string
  "The display name of the dimension `dimension-name` with the dbt `label`: the label when the project gives one, else
  the name humanized (`date_day` is \"Date Day\"), as the instance names a Field. A blank label is no label."
  [label          :- [:maybe :string]
   dimension-name :- :string]
  (if (str/blank? label)
    (u.humanization/name->human-readable-name :simple dimension-name)
    label))

(mu/defn- default-temporal-unit :- [:maybe ::lib.schema.temporal-bucketing/unit]
  "The unit a time dimension's `granularity` names, when Lib can bucket `column` by it; nil otherwise."
  [context                                     :- ::resolve.columns/context
   {:keys [granularity], dimension-name :name} :- ::ir/dimension
   column                                      :- ::lib.schema.ref/ref]
  (when granularity
    (resolve.filters/available-unit context column (name granularity) dimension-name)))

(mr/def ::dimension-pair
  "A curated dimension and the mapping that binds it to a column, with the dbt `path` they were made from
  (`<entity>__<dimension>`, or a bare name for the metric's own semantic model), see [[with-unique-names]]."
  [:map {:closed true}
   [:dimension ::lib-metric.schema/persisted-dimension]
   [:mapping   ::lib-metric.schema/dimension-mapping]
   [:path      :string]])

(mu/defn- dimension-column :- :string
  "The column `dimension`'s expr names. A dimension mapping targets a column, so a dimension whose expr is anything
  else is [[unsupported/throw!]]."
  [{dimension-name :name, :keys [expr]} :- ::ir/dimension]
  (let [{:keys [kind], column-name :name} (resolve.columns/parse-expr expr)]
    (case kind
      :column column-name
      :sql    (unsupported/throw! (str "dimension %s is the SQL expression %s; a dimension mapping targets a column,"
                                       " not SQL")
                                  (pr-str dimension-name) (pr-str expr))
      (unsupported/throw! "dimension %s is %s, not a column" (pr-str dimension-name) (pr-str expr)))))

(mu/defn- dimension-pair :- ::dimension-pair
  "The curated dimension and mapping for the dbt `dimension` of `context`'s semantic model, in `group`.
  `dimension-path` is the dbt spelling of the dimension from the metric's semantic model, which seeds the id (see
  [[ids/dimension-id]]). The dimension is written
  `:status/active`, what the instance's refresh sets on a dimension whose column it finds, so the refresh after the
  import rewrites nothing (see [[metabase.lib-metric.dimension/dimensions-changed?]]). A time dimension that bounds a
  slowly changing dimension's validity window (`validity_params`) is [[unsupported/throw!]]: a dimension set has no
  notion of a window, and breaking a metric out by the window's start or end would count every version of a row."
  [{:keys [query provider metric-unique-id resolve-column] :as context}      :- ::resolve.columns/context
   group                                                                     :- ::lib.schema.metadata/dimension-group
   dimension-path                                                            :- :string
   {dimension-name :name, dimension-type :type, :keys [label validity-params], :as dimension} :- ::ir/dimension]
  (when validity-params
    (unsupported/throw! (str "dimension %s bounds a validity window (validity_params), the %s of a slowly changing"
                             " dimension's versions; a dimension set has no notion of one")
                        (pr-str dimension-name)
                        (cond
                          (and (:is-start validity-params) (:is-end validity-params)) "start and end"
                          (:is-start validity-params)                                 "start"
                          :else                                                       "end")))
  (let [column-ref (resolve-column (dimension-column dimension))
        field-id   (lib/field-ref-id column-ref)
        field      (lib.metadata/field provider field-id)
        base-type  (lib/type-of query column-ref)
        unit       (when (= dimension-type :time)
                     (default-temporal-unit context dimension column-ref))
        id         (ids/dimension-id metric-unique-id dimension-path)]
    {:dimension (cond-> {:id           id
                         :name         dimension-name
                         :display-name (display-name label dimension-name)
                         :status       :status/active
                         :sources      [{:type :field, :field-id field-id}]
                         :group        group}
                  (resolve.columns/known-type? base-type) (assoc :effective-type base-type)
                  unit                            (assoc :default-temporal-unit unit))
     :mapping   {:type         :table
                 :table-id     (:table-id field)
                 :dimension-id id
                 :target       column-ref}
     :path      dimension-path}))

(mr/def ::dimension-result
  "A [[dimension-pair]], or why a dbt dimension could not become one."
  [:or ::dimension-pair ::resolved/unsupported-dimension])

(mu/defn- unsupported-dimension :- ::resolved/unsupported-dimension
  "The report entry for a dbt dimension that could not become a curated dimension, and why."
  [dimension-name :- :string
   reason         :- :string]
  {:name dimension-name, :reason reason})

(mu/defn- own-dimensions :- [:sequential ::dimension-result]
  "A [[dimension-pair]] for every dimension of `context`'s semantic model, or the reason it cannot be one.
  `entity-name` prefixes the dimensions' paths; nil for the metric's own semantic model."
  [{:keys [semantic-model] :as context} :- ::resolve.columns/context
   group                                :- ::lib.schema.metadata/dimension-group
   entity-name                          :- [:maybe :string]]
  (vec (for [{dimension-name :name, :as dimension} (:dimensions semantic-model)
             :let [dimension-path (if entity-name (str entity-name "__" dimension-name) dimension-name)]]
         (unsupported/catching #(dimension-pair context group dimension-path dimension)
                               #(unsupported-dimension dimension-name %)))))

(mu/defn- joined-dimensions :- [:sequential ::dimension-result]
  "The dimensions reached through the foreign or unique `entity` of `context`'s semantic model, see
  [[resolve.columns/join-context]]. When the join itself cannot be made, every dimension of the semantic models the
  entity would join to is reported with the reason, so a dimension the project declares is never silently dropped; an
  entity no other semantic model is keyed by has no dimensions behind it, and is just a key. An entity that is the
  natural entity of another semantic model, a slowly changing dimension, is one entry naming the entity (see
  [[resolve.columns/natural-targets]]): the semantic models behind it are reported once, not once per dimension."
  [context                         :- ::resolve.columns/context
   {entity-name :name, :as entity} :- ::ir/entity]
  (unsupported/catching
   (fn []
     (let [{:keys [semantic-model] :as join} (resolve.columns/join-context context entity)]
       (own-dimensions join (dimension-group "connection" semantic-model) entity-name)))
   (fn [reason]
     (let [targets (resolve.columns/join-targets context entity-name)]
       (cond
         (seq targets)
         (vec (for [target    targets
                    dimension (:dimensions target)]
                (unsupported-dimension (:name dimension) reason)))

         (seq (resolve.columns/natural-targets context entity-name))
         [(unsupported-dimension entity-name reason)]

         :else
         [])))))

(mu/defn- natural-entity :- [:sequential ::dimension-result]
  "The report entry for the natural `entity` of `context`'s semantic model, when another semantic model is keyed by it
  (see [[resolve.columns/join-targets]]): the converter joins through foreign and unique entities only, and the
  dimensions behind a natural one exist, so the entity is named once rather than dropped. A natural entity no other
  semantic model is keyed by is just a key."
  [context             :- ::resolve.columns/context
   {entity-name :name} :- ::ir/entity]
  (if-let [targets (seq (resolve.columns/join-targets context entity-name))]
    [(unsupported-dimension entity-name
                           (format (str "entity %s is a natural entity, the key of a slowly changing dimension; a join"
                                        " from it to %s needs the validity window of this model's time dimensions,"
                                        " which an implicit join cannot express")
                                   (pr-str entity-name) (str/join ", " (map (comp pr-str :name) targets))))]
    []))

(mr/def ::dimension-set
  "A metric's curated dimensions, their mappings, and the dbt dimensions that could not become one."
  [:map {:closed true}
   [:dimensions             ::lib-metric.schema/persisted-dimensions]
   [:dimension-mappings     [:sequential ::lib-metric.schema/dimension-mapping]]
   [:unsupported-dimensions [:sequential ::resolved/unsupported-dimension]]])

(mu/defn- metric-time-unit :- ::lib.schema.temporal-bucketing/unit
  "The default temporal unit of the default dimension `column` of a metric with `time-granularity`, dbt's coarsest
  grain for querying the metric. Metabase cannot hold a breakout to a grain, so the grain becomes the default unit of
  the default dimension instead, which is what a user breaking the metric out by time gets first. A grain Lib cannot
  bucket `column` by, such as a custom calendar's, is [[unsupported/throw!]]."
  [context          :- ::resolve.columns/context
   time-granularity :- :string
   dimension-name   :- :string
   column           :- ::lib.schema.ref/ref]
  (or (resolve.filters/available-unit context column time-granularity dimension-name)
      (unsupported/throw! "time_granularity %s has no Metabase temporal unit for %s"
                          (pr-str time-granularity) (pr-str dimension-name))))

(mu/defn- with-default-dimension :- [:sequential ::dimension-result]
  "`results`, the metric's own semantic model's dimensions, with its `agg_time_dimension` marked as the default, and
  bucketed by the metric's `time_granularity` when it has one (see [[metric-time-unit]]). An `agg_time_dimension` that
  is not a dimension of the semantic model is reported; one that is but could not be converted already is. A
  `time_granularity` on a metric with no `agg_time_dimension` to carry it (a ratio or derived metric whose inputs
  disagree on one, see [[dev.dbt-import.resolve/resolve-composed]]) is reported under dbt's name for the dimension it
  buckets, `metric_time`, rather than dropped."
  [{:keys [semantic-model agg-time-dimension time-granularity] :as context} :- ::resolve.columns/context
   results                                                                 :- [:sequential ::dimension-result]]
  (b/cond
    (and (nil? agg-time-dimension) time-granularity)
    (conj results (unsupported-dimension "metric_time"
                                         (format (str "time_granularity %s buckets the metric's agg_time_dimension,"
                                                      " and the metric has none to apply it to: its inputs do not"
                                                      " agree on one, or its measure declares none")
                                                 (pr-str time-granularity))))

    (nil? agg-time-dimension)
    results

    (not (m/find-first #(= agg-time-dimension (:name %)) (:dimensions semantic-model)))
    (conj results (unsupported-dimension agg-time-dimension
                                         (format "agg_time_dimension %s is not a dimension of semantic model %s"
                                                 (pr-str agg-time-dimension) (pr-str (:name semantic-model)))))

    :else
    (mapv (fn [{:keys [dimension mapping] :as result}]
            (if (and dimension (= agg-time-dimension (:name dimension)))
              (let [unit (when time-granularity
                           (metric-time-unit context time-granularity agg-time-dimension (:target mapping)))]
                (cond-> (assoc-in result [:dimension :default] true)
                  unit (assoc-in [:dimension :default-temporal-unit] unit)))
              result))
          results)))

(mu/defn- with-unique-names :- [:sequential ::dimension-result]
  "`results` with no two curated dimensions of the same name: a joined dimension named like another dimension of the
  set takes its dbt path, `<entity>__<dimension>`, as its name, which is how dbt itself tells the two apart. The
  metric's own dimensions keep their names. Display names are left alone: two dimensions may share one, as two
  columns of the same name on the metric's table and a joined table do in Metabase, and their groups tell them apart."
  [results :- [:sequential ::dimension-result]]
  (let [shared? (->> (keep (comp :name :dimension) results)
                     frequencies
                     (m/filter-vals #(> % 1))
                     keys
                     set)]
    (mapv (fn [{:keys [dimension path] :as result}]
            (if (and dimension
                     (shared? (:name dimension))
                     (= "connection" (-> dimension :group :type)))
              (assoc-in result [:dimension :name] path)
              result))
          results)))

(mu/defn dimension-set :- ::dimension-set
  "The curated dimension set of the metric `context` is for: its own semantic model's dimensions first, with the
  default among them (see [[with-default-dimension]]), then those reached through each of its foreign and unique
  entities, in the order the semantic model declares them. A unique entity is a key into another semantic model keyed
  by it just as a foreign entity is; the semantic model's primary entity names its own dimensions, and a natural entity
  is reported (see [[natural-entity]]). No two dimensions share a name (see [[with-unique-names]])."
  [{:keys [semantic-model] :as context} :- ::resolve.columns/context]
  (let [results (-> (with-default-dimension context
                      (own-dimensions context (dimension-group "main" semantic-model) nil))
                    (into (mapcat (fn [{entity-type :type, :as entity}]
                                    (case entity-type
                                      (:foreign :unique) (joined-dimensions context entity)
                                      :natural           (natural-entity context entity)
                                      :primary           [])))
                          (:entities semantic-model))
                    with-unique-names)
        pairs   (filter :mapping results)]
    {:dimensions             (mapv :dimension pairs)
     :dimension-mappings     (mapv :mapping pairs)
     :unsupported-dimensions (filterv :reason results)}))
