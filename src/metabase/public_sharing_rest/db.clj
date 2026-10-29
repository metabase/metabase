(ns metabase.public-sharing-rest.db
  "Application database queries for the public sharing REST module. Every function here is a direct Toucan 2 call with
  no additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;;; ------------------------------------------------------ Cards -------------------------------------------------------

;;; ---------------------------------------------------- Dashboards ----------------------------------------------------

(mu/defn dashcard-id-in-dashboard
  "`dashcard-id` if that DashboardCard belongs to the Dashboard with `dashboard-id`, otherwise nil."
  [dashcard-id  :- ::lib.schema.id/dashcard
   dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-one-pk :model/DashboardCard :id dashcard-id :dashboard_id dashboard-id))

;;; ----------------------------------------------------- Documents ----------------------------------------------------

;;; ----------------------------------------------------- Timelines ----------------------------------------------------

(mu/defn active-timeline-ids
  "The ids of the non-archived Timelines among `timeline-ids`."
  [timeline-ids :- [:set ms/PositiveInt]]
  (t2/select-pks-set :model/Timeline :id [:in timeline-ids] :archived false))

(mu/defn active-timeline-events
  "The non-archived TimelineEvents of the Timelines with `timeline-ids`, restricted to the columns safe to expose
  publicly, in timestamp order."
  [timeline-ids :- [:set ms/PositiveInt]]
  (t2/select [:model/TimelineEvent :id :timeline_id :name :description :icon :timestamp :timezone :time_matters
              :archived :created_at]
             :timeline_id [:in timeline-ids]
             :archived false
             {:order-by [[:timestamp :asc] [:id :asc]]}))
