(ns metabase.timeline.event-update
  "An update of one TimelineEvent, as a validated record. `PUT /api/timeline-event/:id` validates it, and
  [[metabase.timeline.db/update-timeline-event!]] takes nothing else."
  (:require
   [malli.error :as me]
   [malli.util :as mut]
   [metabase.api.common :as api]
   [metabase.timeline.schema]
   [metabase.util.malli.registry :as mr]
   [metabase.util.validated :as validated]))

(set! *warn-on-reflection* true)

(def ^:private changes-schema
  "The columns an update of a TimelineEvent may set from the request, and their types. Closed, so any other column
  fails, `timeline_id` included: a move comes only from a [[TimelineWrite]]."
  (mut/select-keys (mr/resolve-schema :metabase.timeline.schema/timeline-event.update)
                   [:name :description :timestamp :time_matters :timezone :icon :archived]))

;; `user-id` may write the Timeline with `timeline-id`. Validated, it is the only way to put a `timeline_id` into an
;; [[EventUpdate]], so moving an event to a timeline nobody checked is not something the update can say.
(defrecord TimelineWrite [user-id timeline-id]
  validated/Validatable
  (checks [_]
    [])

  (external-checks [_]
    ;; `api/write-check` reads the current user from the request, not from `user-id`, so `user-id` must name them.
    (api/write-check :model/Timeline timeline-id) ; throws the 404 or 403
    [[::acting-user-is-current-user (and (some? user-id)
                                         (= user-id api/*current-user-id*))]]))

;; `user-id` is who is acting, `event-id` the TimelineEvent to update, `changes` the columns to set, and `new-timeline`
;; nil or a validated [[TimelineWrite]] for the timeline to move the event to. The checks fetch the event by
;; `event-id`, the same id the update writes.
(defrecord EventUpdate [user-id event-id changes new-timeline]
  validated/Validatable
  (checks [_]
    [[::changes-match-schema (or (mr/validate changes-schema changes)
                                 (me/humanize (mr/explain changes-schema changes)))]
     [::new-timeline-checked (or (nil? new-timeline)
                                 (and (validated/validated? TimelineWrite new-timeline)
                                      (= user-id (.-user-id ^TimelineWrite new-timeline))))]])

  (external-checks [_]
    ;; `api/write-check` reads the current user from the request, not from `user-id`, so `user-id` must name them.
    (api/write-check :model/TimelineEvent event-id) ; throws the 404 or 403
    [[::acting-user-is-current-user (and (some? user-id)
                                         (= user-id api/*current-user-id*))]]))
