(ns metabase.lib.analysis
  (:require
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.metadata.column :as column]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli.registry :as mr]))

(mr/def ::drill.dimension
  "A clicked cell's value in one of the analysis's result columns. `:column-ref` is the clicked column's reference.
  The FE sends `DatasetColumn.field_ref` (legacy MBQL); the drill handler converts it at use-site."
  [:map {:decode/normalize lib.schema.common/normalize-map}
   [:column-ref :any]
   [:value      :any]])

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

(defn- resolve-dimension-column
  "Convert `a-ref` to MBQL 5, then find the matching column in `columns`.

  Skips the conversion for already-MBQL-5 refs used in tests."
  [actors-query a-ref columns]
  (let [mbql5 (cond->> a-ref
                (not (lib.util/ref-clause? a-ref)) (lib.convert/legacy-ref->mbql5 actors-query -1))]
    (or (lib.equality/find-matching-column mbql5 columns)
        (throw (ex-info "A drill names a column the analysis doesn't have" {:column-ref a-ref})))))

(defn- filter-to-cell
  "Filters the last stage of `actors-query`, which has a row per actor, to the actors in the clicked cell. Throws when
  a dimension's `:column-ref` doesn't resolve to a column in the stage."
  [actors-query dimensions]
  (let [columns (lib/filterable-columns actors-query)]
    (reduce (fn [query {:keys [column-ref value]}]
              (lib/filter query (lib/= (resolve-dimension-column actors-query column-ref columns) value)))
            actors-query
            dimensions)))

(defn- project-visible-columns
  "Return all visible columns (implicitly joinable ones included)."
  [query]
  (lib/with-fields query -1 (lib/visible-columns query -1)))

(defn- drill->mbql
  "The query `drill` asks for, from `actors-query`, whose last stage has a row per actor and the columns the drill's
  dimensions name."
  [actors-query {drill-type :type, :keys [dimensions]}]
  (case drill-type
    :actors (-> (filter-to-cell actors-query dimensions) project-visible-columns)
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
