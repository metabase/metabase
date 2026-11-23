(ns metabase.lib.analysis
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.column :as column]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util.malli.registry :as mr]))

(mr/def ::analysis-state
  [:map {:decode/normalize lib.schema.common/normalize-map}
   [:kind         [:ref ::lib.schema.common/keyword]]
   [:granularity  [:ref ::lib.schema.common/keyword]]
   [:habit.values {:optional true} [:ref ::lib.schema.common/keyword]]])

(defn- named [aggregation column-name]
  (lib.options/update-options aggregation assoc :name column-name))

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
    person-column-key :columns.person timestamp-column-key :columns.timestamp}]
  (let [timestamp-column (column/column-with-unique-key base-query timestamp-column-key)
        person-column (column/column-with-unique-key base-query person-column-key)
        query (-> base-query
                  (lib/aggregate (named (lib/distinct
                                         (lib/with-temporal-bucket timestamp-column granularity))
                                        "periods"))
                  (lib/breakout person-column)
                  lib/append-stage
                  (lib/aggregate (named (habit-period-aggregation habit-values) "people")))
        [periods-col] (filter #(= "periods" (:lib/original-name %))
                              (lib/breakoutable-columns query -1))]
    (lib/breakout query periods-col)))
q
