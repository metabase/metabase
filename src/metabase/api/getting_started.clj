(ns metabase.api.getting-started
  (:require [compojure.core :refer [GET]]
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
   ;; only need :id here because guide needs to load all entities to populate select options anyways
   :most_important_dashboard (:id (db/select-one 'Dashboard :show_in_getting_started true))
   ;; TODO - Need to hydrate the `MetricImportantFields` for this
   :important_metrics        (map :id (db/select 'Metric :show_in_getting_started true, {:order-by [:name]}))
   ;; TODO - should these come back combined or separate?
   :important_tables         (map :id (db/select 'Table :show_in_getting_started true, {:order-by [:name]}))
   :important_segments       (map :id (db/select 'Segment :show_in_getting_started true, {:order-by [:name]}))})


;; TODO - Endpoint for editing the settings above? Or just edit them the normal way via PUT /api/setting/:key ?
;; TODO - Endpoint for setting most_important_dashboard (?) Or just have people set it the normal way via PUT /api/dashboard/:id ?
;;        If we keep the existing endpoint it might make sense to clear `show_in_getting_started` for other Dashboards whenever this is set
;; TODO - Endpoints for setting most important metrics / tables / segments ? Or just have people set them the normal way via PUT /api/.../:id ?

(define-routes)
