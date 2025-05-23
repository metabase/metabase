(ns metabase.timeline.api
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.timeline.api.timeline]
   [metabase.timeline.api.timeline-event]))

(comment metabase.timeline.api.timeline/keep-me
         metabase.timeline.api.timeline-event/keep-me)

(def ^{:arglists '([request respond raise])} timeline-routes
  "`/api/timeline` routes."
  (api.macros/ns-handler 'metabase.timeline.api.timeline))

(def ^{:arglists '([request respond raise])} timeline-event-routes
  "`/api/timeline-event` routes."
  (api.macros/ns-handler 'metabase.timeline.api.timeline-event))
