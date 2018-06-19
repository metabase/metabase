(ns metabase.api.getting-started
  "/api/getting_started routes."
  (:require [compojure.core :refer [GET]]
            [medley.core :as m]
            [metabase.api.common :as api]
            [metabase.models
             [interface :as mi]
             [setting :refer [defsetting]]]
            [metabase.util :as u]
            [puppetlabs.i18n.core :refer [tru]]
            [toucan.db :as db]))

(defsetting getting-started-things-to-know
  (tru "''Some things to know'' text field for the Getting Started guide."))

(defsetting getting-started-contact-name
  (tru "Name of somebody users can contact for help in the Getting Started guide."))

(defsetting getting-started-contact-email
  (tru "Email of somebody users can contact for help in the Getting Started guide."))


(api/defendpoint GET "/"
  "Fetch basic info for the Getting Started guide."
  []
  (let [metric-ids  (map :id (filter mi/can-read? (db/select ['Metric :table_id :id]     :show_in_getting_started true, {:order-by [:%lower.name]})))
        table-ids   (map :id (filter mi/can-read? (db/select ['Table :db_id :schema :id] :show_in_getting_started true, {:order-by [:%lower.name]})))
        segment-ids (map :id (filter mi/can-read? (db/select ['Segment :table_id :id]    :show_in_getting_started true, {:order-by [:%lower.name]})))]
    {:things_to_know           (getting-started-things-to-know)
     :contact                  {:name  (getting-started-contact-name)
                                :email (getting-started-contact-email)}
     :most_important_dashboard (when-let [dashboard (db/select-one ['Dashboard :id :collection_id]
                                                      :show_in_getting_started true)]
                                 (when (mi/can-read? dashboard)
                                   (u/get-id dashboard)))
     :important_metrics        metric-ids
     :important_tables         table-ids
     :important_segments       segment-ids
     ;; A map of metric_id -> sequence of important field_ids
     :metric_important_fields  (m/map-vals (partial map :field_id)
                                           (group-by :metric_id (when (seq metric-ids)
                                                                  (db/select ['MetricImportantField :field_id :metric_id]
                                                                    :metric_id [:in metric-ids]))))}))

(api/define-routes)
