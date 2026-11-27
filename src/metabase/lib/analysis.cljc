(ns metabase.lib.analysis
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.column :as column]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.util.malli.registry :as mr]))

(mr/def ::analysis-state
  [:map {:decode/normalize lib.schema.common/normalize-map}
   [:kind         [:ref ::lib.schema.common/keyword]]
   [:granularity  [:ref ::lib.schema.common/keyword]]
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

(defmethod ->mbql :habit
  [{:keys [base-query granularity]
    habit-values :habit.values
    habit-active :habit.active
    person-column-key :columns.person timestamp-column-key :columns.timestamp}]
  (let [base-query (add-events base-query
                               (cond-> {}
                                 habit-active (assoc "habit.active" (:conditions habit-active))))
        timestamp-column (column/column-with-unique-key base-query timestamp-column-key)
        person-column (column/column-with-unique-key base-query person-column-key)
        query (-> base-query
                  (cond-> habit-active
                    (lib/filter (lib/expression-ref base-query "habit.active")))
                  (lib/aggregate (named (lib/distinct
                                         (lib/with-temporal-bucket timestamp-column granularity))
                                        "periods"))
                  (lib/breakout person-column)
                  lib/append-stage
                  (lib/aggregate (named (habit-period-aggregation habit-values) "people")))
        [periods-col] (filter #(= "periods" (:lib/original-name %))
                              (lib/breakoutable-columns query -1))]
    (lib/breakout query periods-col)))

(defn raw->mbql
  "Convert an analysis-state which contains a raw base query."
  [metadata-provider analysis-state]
  (->mbql (update analysis-state :base-query (partial lib/query metadata-provider))))
