(ns metabase.api.autoarchive
  (:require
   [compojure.core :refer [DELETE GET POST PUT]]
   [metabase.api.common :as api]
   [toucan2.core :as t2]))

;; TODO
;; (def ^:private archive-timing "6 months")

(defn- ->last-used [{:keys [last_viewed created_at] :as q}]
  (assoc q :last_used_at (or last_viewed created_at)))

(defn- ->auto-archivable [q]
  (-> q ->last-used (select-keys [:id :name :last_used_at :model])))

(defn- auto-archivable-questions []
  (->> (t2/query {:select   [:rc.id :rc.name :rc.created_at [:vl.timestamp :last_viewed] [:vl.model :model]]
                  :from     [[:report_card :rc]]
                  :join     [[:view_log :vl] [:= :rc.id :vl.model_id]]
                  :where    [:and [:= :vl.model "card"]]})
       (map ->auto-archivable)))

(api/defendpoint GET "/" []
  {}
  (auto-archivable-questions))

(api/define-routes)
