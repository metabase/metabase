(ns metabase-enterprise.semantic-layer-import.resolve.dimensions
  "The resolve stage's curated dimension set: the dimensions a converted metric can be broken out by.

  Each metric gets the dimensions of its own table, the dimensions of every table its joins lead to (see
  [[resolve.columns/join-context]]), and its time dimension as the default, bucketed by the metric's `time-grain` when
  it has one (see [[dimension-set]]). A dimension mapping targets a column, so a dimension whose `expr` is SQL is
  reported per metric rather than written, as is a dimension that bounds a slowly changing dimension's validity
  window, and every dimension behind a join that cannot be made. Ids are derived, not generated, so a re-run writes
  the same ids and a re-import updates the dimensions in place. Every dimension is written `:status/active`, the
  status the instance gives a dimension whose column it finds, so its first refresh of the set changes nothing."
  (:require
   [better-cond.core :as b]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase-enterprise.semantic-layer-import.ids :as ids]
   [metabase-enterprise.semantic-layer-import.resolve.columns :as resolve.columns]
   [metabase-enterprise.semantic-layer-import.resolve.filters :as resolve.filters]
   [metabase-enterprise.semantic-layer-import.schemas.ir :as ir]
   [metabase-enterprise.semantic-layer-import.schemas.resolved :as resolved]
   [metabase-enterprise.semantic-layer-import.sql :as sql]
   [metabase-enterprise.semantic-layer-import.unsupported :as unsupported]
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
  "The group of the dimensions of `table`: the metric's own table (`main`) or one joined to (`connection`), named
  after the table's label, or its relation's table name when it has none. The id is derived from that name (see
  [[ids/group-id]]), so a re-run writes the same ids. The groups carry the source's labels by design: they are the
  names the project gives its tables, and they are stable across re-imports. The instance names the groups it
  computes for the same table after the table's and the foreign key's display names, so a dimension added later in
  the UI sits in a sibling group next to the imported one."
  [group-type               :- [:enum "main" "connection"]
   {:keys [label relation]} :- ::ir/table]
  (let [group-name (or label (:table relation))]
    {:id           (ids/group-id group-type group-name)
     :type         group-type
     :display-name group-name}))

(mu/defn- display-name :- ::lib.schema.common/non-blank-string
  "The display name of the dimension `dimension-name` labelled `label`: the label when the project gives one, else the
  name humanized (`date_day` is \"Date Day\"), as the instance names a Field. A blank label is no label."
  [label          :- [:maybe :string]
   dimension-name :- :string]
  (if (str/blank? label)
    (u.humanization/name->human-readable-name :simple dimension-name)
    label))

(mu/defn- default-temporal-unit :- [:maybe ::lib.schema.temporal-bucketing/unit]
  "The unit a time dimension's `grain` names, when Lib can bucket `column` by it; nil otherwise."
  [context         :- ::resolve.columns/context
   {:keys [grain]} :- ::ir/dimension
   column          :- ::lib.schema.ref/ref]
  (when grain
    (resolve.filters/available-unit context column grain)))

(mu/defn- dimension-path :- :string
  "How the dimension `dimension-name` is spelled from the metric's table: its name on the table itself, and
  `<join>__<dimension>` through the join `join-name`. The path seeds the dimension's id (see [[ids/dimension-id]]),
  and names a joined dimension that shares its name with another of the set (see [[with-unique-names]])."
  [join-name      :- [:maybe :string]
   dimension-name :- :string]
  (if join-name
    (str join-name "__" dimension-name)
    dimension-name))

(mr/def ::dimension-pair
  "A curated dimension and the mapping that binds it to a column, with the `path` they were made from (see
  [[dimension-path]])."
  [:map {:closed true}
   [:dimension ::lib-metric.schema/persisted-dimension]
   [:mapping   ::lib-metric.schema/dimension-mapping]
   [:path      :string]])

(mu/defn- dimension-column :- :string
  "The column `dimension`'s expr names. A dimension mapping targets a column, so a dimension whose expr is anything
  else is [[unsupported/throw-reason]]."
  [{dimension-name :name, :keys [expr]} :- ::ir/dimension]
  (let [{:keys [kind], column-name :name} (sql/parse-expr expr)]
    (case kind
      :column column-name
      :sql    (unsupported/throw-reason (str "dimension %s is the SQL expression %s; a dimension mapping targets a"
                                             " column, not SQL")
                                        (pr-str dimension-name) (pr-str expr))
      (unsupported/throw-reason "dimension %s is %s, not a column" (pr-str dimension-name) (pr-str expr)))))

(mu/defn- validity-bounds :- :string
  "The bounds of a validity window `validity` names, for a message: `start`, `end` or `start and end`."
  [validity :- [:set [:enum :start :end]]]
  (str/join " and " (map name (filter validity [:start :end]))))

(mu/defn- dimension-pair :- ::dimension-pair
  "The curated dimension and mapping for `dimension` of `context`'s table, in `group`. `path` is the dimension spelled
  from the metric's table (see [[dimension-path]]), which seeds the id. The dimension is written `:status/active`, what
  the instance's refresh sets on a dimension whose column it finds, so the refresh after the import rewrites nothing
  (see [[metabase.lib-metric.dimension/dimensions-changed?]]). A time dimension that bounds a slowly changing
  dimension's validity window is [[unsupported/throw-reason]]: a dimension set has no notion of a window, and breaking a
  metric out by the window's start or end would count every version of a row."
  [context   :- ::resolve.columns/context
   group     :- ::lib.schema.metadata/dimension-group
   path      :- :string
   dimension :- ::ir/dimension]
  (let [{:keys [env query provider metric-unique-id resolve-column]}         context
        {dimension-name :name, dimension-type :type, :keys [label validity]} dimension]
    (when validity
      (unsupported/throw-reason (str "dimension %s bounds a validity window, the %s of a slowly changing dimension's"
                                     " versions; a dimension set has no notion of one")
                                (pr-str dimension-name) (validity-bounds validity)))
    (let [column-ref (resolve-column (dimension-column dimension))
          field-id   (lib/field-ref-id column-ref)
          field      (lib.metadata/field provider field-id)
          base-type  (lib/type-of query column-ref)
          unit       (when (= dimension-type :time)
                       (default-temporal-unit context dimension column-ref))
          id         (ids/dimension-id (:source env) metric-unique-id path)]
      {:dimension (cond-> {:id           id
                           :name         dimension-name
                           :display-name (display-name label dimension-name)
                           :status       :status/active
                           :sources      [{:type :field, :field-id field-id}]
                           :group        group}
                    (resolve.columns/known-type? base-type) (assoc :effective-type base-type)
                    unit                                    (assoc :default-temporal-unit unit))
       :mapping   {:type         :table
                   :table-id     (:table-id field)
                   :dimension-id id
                   :target       column-ref}
       :path      path})))

(mr/def ::dimension-result
  "A [[dimension-pair]], or why a dimension could not become one."
  [:or ::dimension-pair ::resolved/unsupported-dimension])

(mu/defn- unsupported-dimension :- ::resolved/unsupported-dimension
  "The report entry for a dimension that could not become a curated dimension, and why."
  [dimension-name :- :string
   reason         :- :string]
  {:name dimension-name, :reason reason})

(mu/defn- own-dimensions :- [:sequential ::dimension-result]
  "A [[dimension-pair]] for every dimension of `context`'s table, or the reason it cannot be one. `join-name` is the
  join the table is reached through; nil for the metric's own table."
  [{:keys [table] :as context} :- ::resolve.columns/context
   group                       :- ::lib.schema.metadata/dimension-group
   join-name                   :- [:maybe :string]]
  (vec (for [{dimension-name :name, :as dimension} (:dimensions table)]
         (unsupported/catching #(dimension-pair context group (dimension-path join-name dimension-name) dimension)
                               #(unsupported-dimension dimension-name %)))))

(mu/defn- joined-dimensions :- [:sequential ::dimension-result]
  "The dimensions reached through `join` from `context`'s table, see [[resolve.columns/join-context]]. When the join
  cannot be made, what is behind it is reported with the reason, so a dimension the project declares is never
  silently dropped: for a join the source could not make, its `unreachable` names; for one this stage cannot follow,
  every dimension of the table it leads to."
  [{:keys [env] :as context} :- ::resolve.columns/context
   join                      :- ::ir/join]
  (unsupported/catching
   (fn []
     (let [{:keys [table] :as joined} (resolve.columns/join-context context join)]
       (own-dimensions joined (dimension-group "connection" table) (:name join))))
   (fn [reason]
     (mapv #(unsupported-dimension % reason)
           (or (:unreachable join)
               (map :name (get-in env [:tables (:table join) :dimensions])))))))

(mr/def ::dimension-set
  "A metric's curated dimensions, their mappings, and the dimensions that could not become one."
  [:map {:closed true}
   [:dimensions             ::lib-metric.schema/persisted-dimensions]
   [:dimension-mappings     [:sequential ::lib-metric.schema/dimension-mapping]]
   [:unsupported-dimensions [:sequential ::resolved/unsupported-dimension]]])

(mu/defn- metric-time-unit :- ::lib.schema.temporal-bucketing/unit
  "The default temporal unit of the default dimension `column` of a metric with `time-grain`, the coarsest grain the
  metric is meant to be queried at. Metabase cannot hold a breakout to a grain, so the grain becomes the default unit
  of the default dimension instead, which is what a user breaking the metric out by time gets first. A grain Lib
  cannot bucket `column` by, such as a custom calendar's, is [[unsupported/throw-reason]]."
  [context        :- ::resolve.columns/context
   time-grain     :- ::ir/grain
   dimension-name :- :string
   column         :- ::lib.schema.ref/ref]
  (or (resolve.filters/available-unit context column time-grain)
      (unsupported/throw-reason "the metric's time grain %s has no Metabase temporal unit for %s"
                                (pr-str time-grain) (pr-str dimension-name))))

(def ^:private no-time-dimension
  "The name a metric's `time-grain` is reported under when the metric has no time dimension to apply it to."
  "time dimension")

(mu/defn- with-default-dimension :- [:sequential ::dimension-result]
  "`results`, the metric's own table's dimensions, with its time dimension marked as the default, and bucketed by the
  metric's `time-grain` when it has one (see [[metric-time-unit]]). A time dimension that is not a dimension of the
  table is reported; one that is but could not be converted already is. A `time-grain` on a metric with no time
  dimension to carry it (a ratio or derived metric whose inputs disagree on one, see
  [[metabase-enterprise.semantic-layer-import.resolve.metrics/resolve-composed]]) is reported under
  [[no-time-dimension]] rather than dropped."
  [{:keys [table time-dimension time-grain] :as context} :- ::resolve.columns/context
   results                                               :- [:sequential ::dimension-result]]
  (b/cond
    (and (nil? time-dimension) time-grain)
    (conj results (unsupported-dimension no-time-dimension
                                         (format (str "the metric's time grain %s applies to its time dimension, and"
                                                      " the metric has none: its inputs do not agree on one, or it"
                                                      " declares none")
                                                 (pr-str time-grain))))

    (nil? time-dimension)
    results

    (not (m/find-first #(= time-dimension (:name %)) (:dimensions table)))
    (conj results (unsupported-dimension time-dimension
                                         (format "the metric's time dimension %s is not a dimension of table %s"
                                                 (pr-str time-dimension) (pr-str (:name table)))))

    :else
    (mapv (fn [{:keys [dimension mapping] :as result}]
            (if (and dimension (= time-dimension (:name dimension)))
              (let [unit (when time-grain
                           (metric-time-unit context time-grain time-dimension (:target mapping)))]
                (cond-> (assoc-in result [:dimension :default] true)
                  unit (assoc-in [:dimension :default-temporal-unit] unit)))
              result))
          results)))

(mu/defn- with-unique-names :- [:sequential ::dimension-result]
  "`results` with no two curated dimensions of the same name: a joined dimension named like another dimension of the
  set takes its path, `<join>__<dimension>`, as its name. The metric's own dimensions keep their names. Display names
  are left alone: two dimensions may share one, as two columns of the same name on the metric's table and a joined
  table do in Metabase, and their groups tell them apart."
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
  "The curated dimension set of the metric `context` is for: its own table's dimensions first, with the default among
  them (see [[with-default-dimension]]), then those reached through each of its table's joins, in the order the table
  declares them. No two dimensions share a name (see [[with-unique-names]])."
  [{:keys [table] :as context} :- ::resolve.columns/context]
  (let [results (-> (with-default-dimension context
                      (own-dimensions context (dimension-group "main" table) nil))
                    (into (mapcat #(joined-dimensions context %)) (:joins table))
                    with-unique-names)
        pairs   (filter :mapping results)]
    {:dimensions             (mapv :dimension pairs)
     :dimension-mappings     (mapv :mapping pairs)
     :unsupported-dimensions (filterv :reason results)}))
