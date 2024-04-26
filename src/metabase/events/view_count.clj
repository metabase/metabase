(ns metabase.events.view-count
  "This namespace is responsible for subscribing to events which increment view counts like
   report_card.view_count and report_dashboard.view_count."
  (:require
   [metabase.events :as events]
   [metabase.util.log :as log]
   [methodical.core :as m]
   [steffan-westcott.clj-otel.api.trace.span :as span]
   [toucan2.core :as t2]))

(def ^:private view-count-column
  "The column name that is used for view counts."
  :view_count)

(defn increment-view-count!
  "Increments the view_count column of on the table of a toucan model instance.
   Assumes the primary key of the table is `id`."
  [instance]
  (t2/query {:update (t2/table-name instance)
             :set    {view-count-column [:+ view-count-column [:inline 1]]}
             :where  [:= :id (:id instance)]}))

(derive ::view-count-event :metabase/event)
(derive :event/card-read ::view-count-event)
(derive :event/dashboard-read ::view-count-event)

(m/defmethod events/publish-event! ::view-count-event
  "Handle processing for a generic read event notification"
  [topic event]
  (span/with-span!
    {:name "view-count-event"
     :topic topic
     :user-id (:user-id event)}
    (try
      (increment-view-count! (:object event))
      (catch Throwable e
        (log/warnf e "Failed to process view count event: %s" topic)))))
