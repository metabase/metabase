(ns metabase.api.getting-started
  "/api/getting_started endpoints."
  (:require [compojure.core :refer [GET]]
            [metabase.api.common :as api]
            [metabase.models
             [dashboard :refer [Dashboard]]
             [interface :as mi]
             [metric :refer [Metric]]
             [metric-important-field :refer [MetricImportantField]]
             [segment :refer [Segment]]
             [setting :refer [defsetting]]
             [table :refer [Table]]]
            [metabase.util :as u]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]))

(defsetting getting-started-things-to-know
  "'Some things to know' text field for the Getting Started guide.")

(defsetting getting-started-contact-name
  "Name of somebody users can contact for help in the Getting Started guide.")

(defsetting getting-started-contact-email
  "Email of somebody users can contact for help in the Getting Started guide.")


(defn- important-metrics
  "Metrics that should be shown in the Getting Started Guide, that are allowed to be viewed by the current user.
   Includes hydrated important fields for each Metric. These are recorded via the intermediate MetricImportantField
   model, which is basically a many-to-many table."
  []
  (let [metrics (filter mi/can-read? (db/select Metric, :show_in_getting_started true, {:order-by [:%lower.name]}))
        metric-id->important-fields (when (seq metrics)
                                      (as-> (db/select [MetricImportantField :field_id :metric_id]
                                              :metric_id [:in (map u/get-id metrics)]) <>
                                        (hydrate <> :field)
                                        (group-by :metric_id <>)))]
    (for [metric metrics]
      ;; add the important fields to each metric; unwrap them so we just return the Fields instead of entire
      ;; MetricImportantField objects
      (assoc metric :fields (for [important-field (metric-id->important-fields (u/get-id metric))]
                              (:field important-field))))))

(defn- important-tables
  "Tables that should be shown in the Getting Started Guide, that are allowed to be viewed by the current user."
  []
  (filter mi/can-read? (db/select Table, :show_in_getting_started true, {:order-by [:%lower.name]})))

(defn- important-segments
  "Segments that should be shown in the Getting Started Guide, that are allowed to be viewed by the current user."
  []
  (filter mi/can-read? (db/select Segment, :show_in_getting_started true, {:order-by [:%lower.name]})))

(defn- most-important-dashboard
  "The 'most important Dashboard' of the application, if its allowed to be viewed by the current user."
  []
  (when-let [dashboard (Dashboard :show_in_getting_started true)]
    (when (mi/can-read? dashboard)
      dashboard)))


(api/defendpoint GET "/"
  "Fetch basic info for the Getting Started guide."
  []
  {:things_to_know           (getting-started-things-to-know)
   :contact                  {:name  (getting-started-contact-name)
                              :email (getting-started-contact-email)}
   :most_important_dashboard (most-important-dashboard)
   :important_metrics        (important-metrics)
   :important_tables         (important-tables)
   :important_segments       (important-segments)})


(api/define-routes)
