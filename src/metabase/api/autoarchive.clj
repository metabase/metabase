(ns metabase.api.autoarchive
  (:require
   [compojure.core :refer [DELETE GET POST PUT]]
   [metabase.api.common :as api]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;; TODO
;; (def ^:private archive-timing "6 months")

;; TODO
;; 1. only worry about orphaned questions
;; 2. use the archive-timing

(defn- ->last-used [{:keys [last_viewed created_at] :as q}]
  (assoc q :last_used_at (or last_viewed created_at)))

(defn- ->auto-archivable [q]
  (->> q
       ->last-used
       (into {})
       ;; TODO:
       #_(select-keys [:id :name :last_used_at :model])))

(defn- auto-archivable-questions []
  (->> (t2/query {:select    [:rc.id
                              :rc.name
                              :rc.created_at
                              [:vl.timestamp :last_viewed]
                              [:vl.model :model]]
                  :from      [[:report_card :rc]]
                  :left-join [[:view_log :vl] [:= :rc.id :vl.model_id]
                              [:report_dashboardcard :dc] [:= :rc.id :dc.card_id]]
                  :where     [:and
                              [:= :dc.dashboard_id nil]
                              [:= :vl.model "card"]]})
       (mapv ->auto-archivable)))

(api/defendpoint GET "/:collection-id" []
  {:collection-id ms/PositiveInt}
  {:archivable (auto-archivable-questions)})

(api/define-routes)
