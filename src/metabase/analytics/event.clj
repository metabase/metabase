(ns metabase.analytics.event
  "Dispatches analytics events to Snowplow and Metaplow. Each tracker gates itself on its own setting; this namespace
  just fans the call out."
  (:require
   [metabase.analytics.snowplow :as snowplow]
   [metabase.api.common :as api]))

(defn track-event!
  "Send a single analytics event to Snowplow and Metaplow. Each tracker decides whether to emit based on its own
  setting."
  ([schema data]
   (track-event! schema data api/*current-user-id*))
  ([schema data user-id]
   (snowplow/track-event! schema data user-id)))
