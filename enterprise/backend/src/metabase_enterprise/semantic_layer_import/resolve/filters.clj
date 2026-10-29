(ns metabase-enterprise.semantic-layer-import.resolve.filters
  "The resolve stage's filters: a metric's `::ir/filter`s as Lib filter clauses.

  A filter is SQL in the warehouse's dialect with a placeholder identifier for each reference to the semantic layer's
  own objects. [[sql/condition->mbql]] parses the SQL in the dialect of the config's `:driver`; a placeholder resolves
  to what its reference names (see [[reference-clause]]) and any other identifier to a column of the metric's table.
  A dimension reached with an empty path, or through one of the table's aliases, is one of the table's own; one reached
  through a join is on the table the join leads to (see [[resolve.columns/join-context]]). A bucketed reference
  buckets the dimension's column by its grain, when the column can be (see [[available-unit]])."
  (:require
   [better-cond.core :as b]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase-enterprise.semantic-layer-import.resolve.columns :as resolve.columns]
   [metabase-enterprise.semantic-layer-import.schemas.ir :as ir]
   [metabase-enterprise.semantic-layer-import.sql :as sql]
   [metabase-enterprise.semantic-layer-import.unsupported :as unsupported]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(mr/def ::located-dimension
  "An IR dimension and the context whose columns its expr is written against."
  [:map {:closed true}
   [:dimension ::ir/dimension]
   [:context   ::resolve.columns/context]])

(mu/defn- own-dimension :- ::located-dimension
  "The dimension named `dimension-name` on `context`'s table."
  [{:keys [table] :as context} :- ::resolve.columns/context
   dimension-name              :- :string]
  (if-let [dimension (m/find-first #(= dimension-name (:name %)) (:dimensions table))]
    {:dimension dimension, :context context}
    (unsupported/throw! "dimension %s is not on table %s" (pr-str dimension-name) (pr-str (:name table)))))

(mu/defn- locate-dimension :- ::located-dimension
  "The dimension `reference` names and the context its expr is written against: with an empty path, or one naming the
  table itself (see `aliases` on `::ir/table`), one of the table's own dimensions; through a join, a dimension of the
  table the join leads to (see [[resolve.columns/join-context]]). A dimension mapping is one implicit join, so a path
  of more than one join is [[unsupported/throw!]]."
  [{:keys [table] :as context}         :- ::resolve.columns/context
   {:keys [path], dimension-name :name} :- ::ir/reference.dimension]
  (let [[step & more] path]
    (cond
      (nil? step)
      (own-dimension context dimension-name)

      (seq more)
      (unsupported/throw! "dimension %s is reached through more than one join (%s), which is not supported"
                          (pr-str dimension-name) (str/join ", " (map pr-str path)))

      (contains? (:aliases table) step)
      (own-dimension context dimension-name)

      :else
      (own-dimension (resolve.columns/join-context context (resolve.columns/table-join context step)) dimension-name))))

(mu/defn- metric-time-dimension :- ::located-dimension
  "The metric's time dimension, on its own table."
  [{:keys [time-dimension] :as context} :- ::resolve.columns/context]
  (if time-dimension
    (own-dimension context time-dimension)
    (unsupported/throw! "the metric has no time dimension to refer to")))

(mu/defn available-unit :- [:maybe ::lib.schema.temporal-bucketing/unit]
  "The Metabase unit the time grain `grain` names (see [[sql/truncation-unit]]: a grain truncates, so it is never an
  extraction unit like `day-of-week`), when `column` can be bucketed by it; nil otherwise. For a column of known type
  Lib says which units it supports (a date has no `hour`). A column the project does not type is a Field of unknown
  type, which Lib cannot bucket at all; the source says it is a time dimension, and that is trusted: the unit applies
  as written, and the instance's metadata decides when the card runs (the import itself binds any name, see
  [[metabase-enterprise.semantic-layer-import.preflight]])."
  [{:keys [query]} :- ::resolve.columns/context
   column          :- ::lib.schema.ref/ref
   grain           :- ::ir/grain]
  (when-let [unit (sql/truncation-unit grain)]
    (when (or (not (resolve.columns/known-type? (lib/type-of query column)))
              (m/find-first #(= unit (:unit %)) (lib/available-temporal-buckets query column)))
      unit)))

(mu/defn- bucketed-clause :- ::lib.schema.ref/ref
  "`column`, the ref for `dimension`, bucketed by `grain`; nil means the dimension's own. See [[available-unit]] for
  which grains a column takes."
  [context                               :- ::resolve.columns/context
   {dimension-name :name, :as dimension} :- ::ir/dimension
   column                                :- ::sql/value
   grain                                 :- [:maybe ::ir/grain]]
  (b/cond
    (not= :time (:type dimension))
    (unsupported/throw! "dimension %s is not a time dimension, so it cannot be bucketed by a time grain"
                        (pr-str dimension-name))

    (not= :column (:kind (sql/parse-expr (:expr dimension))))
    (unsupported/throw! "cannot bucket the SQL expression %s by time" (pr-str (:expr dimension)))

    :let [grain (or grain (:grain dimension))
          unit  (some->> grain (available-unit context column))]

    (not unit)
    (unsupported/throw! "the time grain %s has no Metabase temporal unit for %s" (pr-str grain) (pr-str dimension-name))

    :else
    (lib/with-temporal-bucket column unit)))

(mu/defn- reference-clause :- ::sql/value
  "The Lib expression a filter's reference stands for."
  [context                      :- ::resolve.columns/context
   {:keys [kind] :as reference} :- ::ir/reference]
  (case kind
    :key
    (resolve.columns/column-or-sql context (:expr (resolve.columns/table-key context (:name reference))))

    (:dimension :time-dimension)
    (let [{:keys [dimension context]} (if (= kind :time-dimension)
                                        (metric-time-dimension context)
                                        (locate-dimension context reference))
          column                      (resolve.columns/column-or-sql context (:expr dimension))]
      (if-let [bucket (:bucket reference)]
        (bucketed-clause context dimension column (:grain bucket))
        column))))

(mu/defn- filter-clause :- ::lib.schema.expression/boolean
  "The Lib filter clause for one `::ir/filter`."
  [{:keys [env resolve-column] :as context} :- ::resolve.columns/context
   {:keys [sql references]}                 :- ::ir/filter]
  (sql/condition->mbql (:dialect env) sql (fn [identifier]
                                            (if-let [reference (get references identifier)]
                                              (reference-clause context reference)
                                              (resolve-column identifier)))))

(mu/defn filter-clauses :- [:sequential ::lib.schema.expression/boolean]
  "The Lib filter clauses for `filters`, each failure saying which filter, as the source wrote it."
  [context :- ::resolve.columns/context
   filters :- [:sequential ::ir/filter]]
  (mapv (fn [{:keys [text] :as ir-filter}]
          (unsupported/with-reason-prefix (str "filter " (pr-str text)) #(filter-clause context ir-filter)))
        filters))
