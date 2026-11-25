(ns metabase.lib.analysis
  (:require
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.column :as column]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.util.malli.registry :as mr]))

(mr/def ::drill.dimension
  "A clicked cell's value in one of the analysis's result columns. Column names are values, not keys, so they keep
  their spelling through normalization."
  [:map {:decode/normalize lib.schema.common/normalize-map}
   [:column :string]
   [:value  :any]])

(mr/def ::drill
  "A clicked cell of an analysis's result, and what to show for it instead of the result. `:actors` lists the actors
  in the cell."
  [:map {:decode/normalize lib.schema.common/normalize-map}
   [:type       [:ref ::lib.schema.common/keyword]]
   [:dimensions [:sequential [:ref ::drill.dimension]]]])

(mr/def ::analysis-state
  [:map {:decode/normalize lib.schema.common/normalize-map}
   [:kind         [:ref ::lib.schema.common/keyword]]
   [:granularity  [:ref ::lib.schema.common/keyword]]
   [:drill        {:optional true} [:maybe [:ref ::drill]]]
   [:habit.values {:optional true} [:ref ::lib.schema.common/keyword]]
   [:habit.active {:optional true} [:maybe [:map {:decode/normalize lib.schema.common/normalize-map}
                                            [:conditions [:sequential [:ref ::lib.schema.expression/boolean]]]]]]])

(defn- named [aggregation column-name]
  (lib.options/update-options aggregation assoc :name column-name))

(defn- event-condition
  "`conditions`, ANDed into one boolean expression."
  [event-name conditions]
  ;; The conditions may also be filters of the base query, and a query can't repeat a `:lib/uuid`.
  (let [conditions (map lib/fresh-uuids conditions)]
    (case (count conditions)
      0 (throw (ex-info "An event must have at least one condition" {:event event-name}))
      1 (first conditions)
      (apply lib/and conditions))))

(defn add-events
  "Adds each of `events`, a map of name to a list of boolean expressions, to `base-query` as one boolean expression
  with that name: true when every one of its expressions is. Throws when an event has none."
  [base-query events]
  (reduce-kv (fn [query event-name conditions]
               (lib/expression query event-name (event-condition event-name conditions)))
             base-query
             events))

(defmulti ->mbql
  "Convert the given analysis state into MBQL."
  {:arglists '([analysis-state])}
  (fn [{:keys [kind]}] kind))

(defmethod ->mbql :default
  [{:keys [kind]}]
  (throw (ex-info "unsupported analysis kind" {:kind kind})))

(defn- habit-period-aggregation [habit-values]
  (case habit-values
    :count   (lib/count)
    :percent (lib// (lib/count)
                    (lib/window (lib/sum (lib/count))
                                {:partition-by []}))))

(defn- filter-to-cell
  "Filters the last stage of `actors-query`, which has a row per actor, to the actors in the clicked cell. Throws when
  a dimension names a column the stage doesn't have."
  [actors-query dimensions]
  (let [columns (lib/filterable-columns actors-query)]
    (reduce (fn [query {column-name :column, value :value}]
              (let [column (m/find-first #(= column-name (:lib/original-name %)) columns)]
                (when-not column
                  (throw (ex-info "A drill names a column the analysis doesn't have" {:column column-name})))
                (lib/filter query (lib/= column value))))
            actors-query
            dimensions)))

(defn- drill->mbql
  "The query `drill` asks for, from `actors-query`, whose last stage has a row per actor and the columns the drill's
  dimensions name."
  [actors-query {drill-type :type, :keys [dimensions]}]
  (case drill-type
    :actors (filter-to-cell actors-query dimensions)
    (throw (ex-info "unsupported drill type" {:type drill-type}))))

(defmethod ->mbql :habit
  [{:keys [base-query granularity drill]
    habit-values :habit.values
    habit-active :habit.active
    person-column-key :columns.person timestamp-column-key :columns.timestamp}]
  (let [base-query (add-events base-query
                               (cond-> {}
                                 habit-active (assoc "habit.active" (:conditions habit-active))))
        timestamp-column (column/column-with-unique-key base-query timestamp-column-key)
        person-column (column/column-with-unique-key base-query person-column-key)
        actors-query (-> base-query
                         (cond-> habit-active
                           (lib/filter (lib/expression-ref base-query "habit.active")))
                         (lib/aggregate (named (lib/distinct
                                                (lib/with-temporal-bucket timestamp-column granularity))
                                               "periods"))
                         (lib/breakout person-column)
                         lib/append-stage)]
    (if drill
      (drill->mbql actors-query drill)
      (let [query (lib/aggregate actors-query (named (habit-period-aggregation habit-values) "people"))
            [periods-col] (filter #(= "periods" (:lib/original-name %))
                                  (lib/breakoutable-columns query -1))]
        (lib/breakout query periods-col)))))
