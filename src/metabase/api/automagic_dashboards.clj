(ns metabase.api.automagic-dashboards
  (:require [compojure.core :refer [GET]]
            [metabase.api.common :as api]
            [metabase.automagic-dashboards
             [core :as magic]
             [comparison :as magic.comparison]
             [filters :as magic.filters]]
            [metabase.models
             [dashboard :refer [Dashboard]]
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
       (keep magic/automagic-dashboard)))

(api/defendpoint GET "/table/:id"
  "Create an automagic dashboard for table with id `ìd`."
  [id]
  [(magic/automagic-dashboard (Table id))])

(api/defendpoint GET "/analize/metric/:id"
  "Create an automagic dashboard analyzing metric with id `id`."
  [id]
  [(magic/automagic-analysis (Metric id))])

(api/defendpoint GET "/compare/dashboard/:dashboard-id/segments/:left-id/:right-id"
  "Create an automagic comparison dashboard based on dashboard with ID
   `dashboard-id`, comparing segments with IDs `left-id` and `right-id`."
  [dashboard-id left-id right-id]
  [(:id (magic.comparison/comparison-dashboard (Dashboard dashboard-id)
                                               (Segment left-id)
                                               (Segment right-id)))])

(api/defendpoint GET "/filters/:dashboard-id"
  "Add filters to dashboard."
  [dashboard-id]
  (magic.filters/add-filters! (Dashboard dashboard-id))
  "Done")

(api/define-routes)
