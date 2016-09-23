(ns metabase.api.getting-started
  (:require [compojure.core :refer [GET]]
            [medley.core :as m]
            [metabase.api.common :refer :all]
            [metabase.db :as db]
            [metabase.models.setting :refer [defsetting]]))

(defsetting getting-started-things-to-know
  "'Some things to know' text field for the Getting Started guide.")

(defsetting getting-started-contact-name
  "Name of somebody users can contact for help in the Getting Started guide.")

(defsetting getting-started-contact-email
  "Email of somebody users can contact for help in the Getting Started guide.")


(defendpoint GET "/"
  "Fetch basic info for the Getting Started guide."
  []
  {:things_to_know           (getting-started-things-to-know)
   :contact                  {:name  (getting-started-contact-name)
                              :email (getting-started-contact-email)}
   :most_important_dashboard (db/select-one-id 'Dashboard :show_in_getting_started true)
   :important_metrics        (map :id (db/select ['Metric :id]  :show_in_getting_started true, {:order-by [:name]}))
   :important_tables         (map :id (db/select ['Table :id]   :show_in_getting_started true, {:order-by [:name]}))
   :important_segments       (map :id (db/select ['Segment :id] :show_in_getting_started true, {:order-by [:name]}))
   ;; A map of metric_id -> sequence of important field_ids
   :metric_important_fields  (m/map-vals (partial map :field_id)
                                         (group-by :metric_id (db/select ['MetricImportantField :field_id :metric_id])))})

(define-routes)
