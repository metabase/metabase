(ns metabase.api.automagic-dashboards
  (:require [compojure.core :refer [GET]]
            [metabase.api.common :as api]
            [metabase.automagic-dashboards
             [core :as magic]
             [comparison :as magic.comparison]]
            [metabase.models
             [dashboard :refer [Dashboard] :as dashboard]
             [metric :refer [Metric]]
             [segment :refer [Segment]]
             [table :refer [Table]]]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]))

(api/defendpoint GET "/database/:id"
  "Return automagic dashboards for all visible tables in database with id `ìd`."
  [id]
  (->> (db/select Table
         :db_id id
         :visibility_type nil)
       (remove (some-fn magic/link-table? magic/list-like-table?))
       (keep magic/automagic-dashboard)
       first))

(api/defendpoint GET "/table/:id"
  "Return an automagic dashboard for table with id `ìd`."
  [id]
  (first (magic/automagic-dashboard (Table id))))

(api/defendpoint GET "/analize/metric/:id"
  "Return an automagic dashboard analyzing metric with id `id`."
  [id]
  (magic/automagic-analysis (Metric id)))

(api/defendpoint GET "/compare/dashboard/:dashboard-id/segments/:left-id/:right-id"
  "Return an automagic comparison dashboard based on dashboard with ID
   `dashboard-id`, comparing segments with IDs `left-id` and `right-id`."
  [dashboard-id left-id right-id]
  (-> (Dashboard dashboard-id)
      api/check-404
      (hydrate [:ordered_cards [:card :in_public_dashboard] :series])
      (magic.comparison/comparison-dashboard (Segment left-id) (Segment right-id))))


;; ----------------------------------------- for testing convinience ----------------

(api/defendpoint GET "/database/:id/save"
  "Create automagic dashboards for all visible tables in database with id `ìd`."
  [id]
  (->> (db/select Table
         :db_id id
         :visibility_type nil)
       (remove (some-fn magic/link-table? magic/list-like-table?))
       (mapcat magic/automagic-dashboard)
       (map (comp :id dashboard/save-transient-dashboard!))))

(api/defendpoint GET "/table/:id/save"
  "Create an automagic dashboard for table with id `ìd`."
  [id]
  (->> (magic/automagic-dashboard (Table id))
       (map (comp :id dashboard/save-transient-dashboard!))))

(api/defendpoint GET "/analize/metric/:id/save"
  "Create an automagic dashboard analyzing metric with id `id`."
  [id]
  [(-> (magic/automagic-analysis (Metric id))
       dashboard/save-transient-dashboard!
       :id)])

(api/defendpoint GET "/compare/dashboard/:dashboard-id/segments/:left-id/:right-id/save"
  "Create an automagic comparison dashboard based on dashboard with ID
   `dashboard-id`, comparing segments with IDs `left-id` and `right-id`."
  [dashboard-id left-id right-id]
  [(-> (Dashboard dashboard-id)
       api/check-404
       (hydrate [:ordered_cards [:card :in_public_dashboard] :series])
       (magic.comparison/comparison-dashboard (Segment left-id) (Segment right-id))
       dashboard/save-transient-dashboard!
       :id)])

(api/define-routes)
