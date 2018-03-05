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
            [toucan.db :as db]))

; Should be POST, GET for testing convinience
(api/defendpoint GET "/database/:id"
  "Create automagic dashboards for all visible tables in database with id `ìd`."
  [id]
  (->> (db/select Table
         :db_id id
         :visibility_type nil)
       (remove (some-fn magic/link-table? magic/single-field-table?))
       (keep magic/automagic-dashboard)
       (map (comp :id dashboard/save-transient-dashboard!))))

(api/defendpoint GET "/table/:id"
  "Create an automagic dashboard for table with id `ìd`."
  [id]
  (->> (magic/automagic-dashboard (Table id))
       (map comp :id dashboard/save-transient-dashboard!)))

(api/defendpoint GET "/analize/metric/:id"
  "Create an automagic dashboard analyzing metric with id `id`."
  [id]
  [(-> (magic/automagic-analysis (Metric id))
       dashboard/save-transient-dashboard!
       :id)])

(api/defendpoint GET "/compare/dashboard/:dashboard-id/segments/:left-id/:right-id"
  "Create an automagic comparison dashboard based on dashboard with ID
   `dashboard-id`, comparing segments with IDs `left-id` and `right-id`."
  [dashboard-id left-id right-id]
  [(-> (magic.comparison/comparison-dashboard (Dashboard dashboard-id)
                                              (Segment left-id)
                                              (Segment right-id))
       dashboard/save-transient-dashboard!
       :id)])

(api/define-routes)
