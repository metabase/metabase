(ns metabase.lib.query.field-ref-upgrade
  (:require
   [metabase.lib.util :as lib.util]
   [metabase.lib.walk :as lib.walk]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :refer [some select-keys mapv empty? #?(:clj for)]]
   [weavejester.dependency :as dep]))

(defn- update-source-table-or-card
  [{:keys [source-table source-card], :as stage}
   [old-source-type old-source-id, :as _old-source]
   [new-source-type new-source-alias new-source-id, :as _new-source]]
  (cond-> stage
    (and (= old-source-type :table) (= old-source-id source-table)) (assoc :source-table new-source-id)
    (and (= old-source-type :card) (= old-source-id source-card)) (assoc :source-card new-source-id)))

(defn- update-stage
  [query stage-number]
  (-> (lib.util/query-stage query stage-number)
      (update-source-table-or-card old-source new-source)
      (u/update-some :joins (fn [joins] (mapv #(update-source-table-or-card % old-source new-source) joins)))))

(defn update-field-refs
  "Updates the qeury to use the new source table or card."
  [query old-source new-source]
  (update query :stages #(vec (map-indexed (fn [stage-number _]
                                             (update-stage query stage-number))
                                           %))))
