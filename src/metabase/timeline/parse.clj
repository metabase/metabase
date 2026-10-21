(ns metabase.timeline.parse
  "Parsed types for the timeline module, and the checks each one runs. `defparsed` defines a class, not a var: callers
  require this namespace and `(:import (metabase.timeline.parse TimelineEventUpdate))`."
  (:require
   [malli.util :as mut]
   [metabase.models.interface :as mi]
   [metabase.timeline.db.fetch :as timeline.db.fetch]
   [metabase.timeline.schema :as timeline.schema]
   [metabase.util.malli.registry :as mr]
   [parsed-types.core :as pt]))

(set! *warn-on-reflection* true)

(def ^:private event-changes-schema
  "The columns an update of a TimelineEvent may set, other than `timeline_id`, which is a field of its own."
  (mut/select-keys (mr/resolve-schema ::timeline.schema/timeline-event.update)
                   [:name :description :timestamp :time_matters :timezone :icon :archived]))

(defn- rows-by-tuple
  "`{[id] row}` for each `[id]` in `tuples`, with nil for a nil id or an id that has no row, from one call to
  `rows-by-id`."
  [rows-by-id tuples]
  (let [ids  (into [] (keep first) tuples)
        rows (if (seq ids) (rows-by-id ids) {})]
    (into {} (map (fn [[id :as tuple]] [tuple (get rows id)])) tuples)))

(defn- events-by-tuple [tuples]
  (rows-by-tuple timeline.db.fetch/timeline-events-by-id tuples))

(defn- timelines-by-tuple [tuples]
  (rows-by-tuple timeline.db.fetch/timelines-by-id tuples))

;; The current user may apply `changes` to the TimelineEvent with `event-id`, and, when `new-timeline-id` is not nil,
;; move it to that Timeline. The permission checks read the current user's permissions. Each check needs a status in
;; `check->status` in [[metabase.timeline.api.timeline-event]].
;; The ignore covers what the library's kondo hook generates for each `defparsed`: a `def` without a docstring and a
;; `fn` per check, which reads as a redundant wrapper when its body is a single call.
#_{:clj-kondo/ignore [:missing-docstring :redundant-fn-wrapper]}
(pt/defparsed TimelineEventUpdate [event-id new-timeline-id changes]
  (pure ::changes-match-schema "The changes set only the columns an update may, with values of their types."
        [changes]
        (mr/validate event-changes-schema changes))
  (external ::event-exists "The event exists."
            [] [event ::event]
            (some? event))
  (external ::may-write-event "The current user may write the event."
            [] [event ::event]
            (boolean (mi/can-write? event)))
  (external ::new-timeline-exists "The timeline to move the event to exists."
            [new-timeline-id] [timeline ::new-timeline]
            (or (nil? new-timeline-id) (some? timeline)))
  (external ::may-write-new-timeline "The current user may write the timeline to move the event to."
            [new-timeline-id] [event ::event, timeline ::new-timeline]
            (or (nil? new-timeline-id)
                (= new-timeline-id (:timeline_id event))
                (boolean (mi/can-write? timeline))))
  ;; through the vars, so a test can stub them with `with-redefs`
  (fetch ::event [event-id] #'events-by-tuple)
  (fetch ::new-timeline [new-timeline-id] #'timelines-by-tuple))
