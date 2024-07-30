(ns metabase.events.snowplow
  "This namespace is responsible for publishing events to snowplow."
  (:require
   [metabase.analytics.snowplow :as snowplow]
   [metabase.events :as events]
   [metabase.models.collection.root :as collection.root]
   [methodical.core :as methodical]))

(defn- date->datetime-str [date]
  (format "%sT00:00:00Z" (str date)))

(derive ::event :metabase/event)

(derive ::stale-items-read ::event)
(derive :event/stale-items-read ::stale-items-read)

(methodical/defmethod events/publish-event! ::stale-items-read
  [_topic {:keys [object user-id cutoff-date total]}]
  (snowplow/track-event! ::snowplow/stale-items-read
                         user-id
                         {:collection_id (when-not (collection.root/is-root-collection? object)
                                           (:id object))
                          :total_stale_items_found total
                          :cutoff_date (date->datetime-str cutoff-date)}))

(derive ::stale-items-archived ::event)
(derive :event/stale-items-archived ::stale-items-archived)

(methodical/defmethod events/publish-event! ::stale-items-archived
  [_topic {:keys [object user-id cutoff-date total]}]
  (snowplow/track-event! ::snowplow/stale-items-archived
                         user-id
                         {:collection_id (when-not (collection.root/is-root-collection? object)
                                           (:id object))
                          :total_stale_items_found total
                          :cutoff_date (date->datetime-str cutoff-date)}))
