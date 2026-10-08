(ns metabase.analytics.event
  "Dispatches analytics events to Snowplow and Metaplow. Each tracker gates itself on its own setting; this namespace
  just fans the call out."
  (:require
   [metabase.analytics.metaplow :as metaplow]
   [metabase.analytics.snowplow :as snowplow]
   [metabase.api.common :as api]))

(defn track-event!
  "Send a single analytics event to Snowplow and Metaplow. Each tracker decides whether to emit based on its own
  setting. `metaplow-only-data` is merged into `data` for Metaplow alone, so it can carry fields that the event's
  Snowplow schema doesn't declare."
  ([schema data]
   (track-event! schema data api/*current-user-id*))
  ([schema data user-id]
   (track-event! schema data user-id nil))
  ([schema data user-id metaplow-only-data]
   (let [snowplow? (snowplow/track-event! schema data user-id)
         metaplow? (metaplow/track-event! schema (merge data metaplow-only-data) user-id)]
     (or snowplow? metaplow?))))
