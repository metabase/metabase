(ns metabase.timeline.event-update
  "An update of one TimelineEvent, as a validated record. `PUT /api/timeline-event/:id` parses it, and
  [[metabase.timeline.db/update-timeline-event!]] takes only an [[EventUpdate]] that `validated/parse` returned."
  (:require
   [malli.error :as me]
   [malli.util :as mut]
   [metabase.api.common :as api]
   [metabase.timeline.db.fetch :as timeline.db.fetch]
   [metabase.timeline.schema]
   [metabase.util.malli.registry :as mr]
   [metabase.util.validated :as validated]))

(set! *warn-on-reflection* true)

(def ^:private changes-schema
  "The columns an update of a TimelineEvent may set from the request, and their types. Closed, so any other column
  fails, `timeline_id` included: a move comes only from a [[TimelineWrite]]."
  (mut/select-keys (mr/resolve-schema :metabase.timeline.schema/timeline-event.update)
                   [:name :description :timestamp :time_matters :timezone :icon :archived]))

(defn- rows-by-id
  "`{[id] row}` for each `[id]` in `arg-tuples`, with nil for an id that has no row, from `rows-by-id-fn`: one query
  for every record in the call."
  [rows-by-id-fn arg-tuples]
  (let [rows (rows-by-id-fn (mapv first arg-tuples))]
    (into {} (map (fn [[id :as arg-tuple]] [arg-tuple (get rows id)])) arg-tuples)))

(defn- may-write?
  "`api/write-check` throws the 404 for a missing row or the 403, and publishes the permission-failure event, as the
  endpoint always did."
  [row]
  (api/write-check row)
  true)

(def ^:private acting-user-is-current-user
  {:name  ::acting-user-is-current-user
   :doc   "The record names the current user, whose permissions `api/write-check` reads."
   :kind  :external
   :reads [:user-id]
   :f     (fn [user-id]
            (and (some? user-id) (= user-id api/*current-user-id*)))})

(def ^:private timeline-write-declaration
  {:checks  [{:name        ::timeline-id-positive
              :doc         "The timeline id is a positive integer."
              :kind        :pure
              ;; a 404, as `api/write-check` gives a nil timeline id
              :status-code 404
              :reads       [:timeline-id]
              :f           pos-int?}
             {:name    ::may-write-timeline
              :doc     "The current user may write the timeline."
              :kind    :external
              :fetches [::timeline]
              :f       may-write?}
             acting-user-is-current-user]
   :fetches [{:name  ::timeline
              :reads [:timeline-id]
              :f     #(rows-by-id timeline.db.fetch/timelines-by-id %)}]})

;; `user-id` may write the Timeline with `timeline-id`. Parsed, it is the only way to put a `timeline_id` into an
;; [[EventUpdate]], so moving an event to a timeline nobody checked is not something the update can say.
(defrecord TimelineWrite [user-id timeline-id]
  validated/Validatable
  (declaration [_] timeline-write-declaration))

(def ^:private event-update-declaration
  {:checks  [{:name  ::event-id-positive
              :doc   "The event id is a positive integer."
              :kind  :pure
              :reads [:event-id]
              :f     pos-int?}
             {:name  ::changes-persistent-map
              :doc   "The changes are a Clojure persistent map, so they cannot change after the checks read them."
              :kind  :pure
              :reads [:changes]
              ;; the exact class, not `instance?`: neither class is final, and a proxy subclass can be mutable
              :f     (fn [changes]
                       (contains? #{clojure.lang.PersistentArrayMap clojure.lang.PersistentHashMap} (class changes)))}
             {:name  ::changes-match-schema
              :doc   "The update sets only the columns it may, with values of their types."
              :kind  :pure
              :reads [:changes]
              :f     (fn [changes]
                       (or (me/humanize (mr/explain changes-schema changes)) ; nil when valid
                           true))}
             {:name  ::new-timeline-checked
              :doc   "A move holds a parsed TimelineWrite for the same user."
              :kind  :pure
              :reads [:user-id :new-timeline]
              :f     (fn [user-id new-timeline]
                       (or (nil? new-timeline)
                           (and (validated/validated? TimelineWrite new-timeline)
                                (= user-id (.-user-id ^TimelineWrite new-timeline)))))}
             {:name    ::may-write-event
              :doc     "The current user may write the event."
              :kind    :external
              :fetches [::event]
              :f       may-write?}
             acting-user-is-current-user]
   :fetches [{:name  ::event
              :reads [:event-id]
              :f     #(rows-by-id timeline.db.fetch/timeline-events-by-id %)}]})

;; `user-id` is who is acting, `event-id` the TimelineEvent to update, `changes` the columns to set, and `new-timeline`
;; nil or a parsed [[TimelineWrite]] for the timeline to move the event to. The checks fetch the event by `event-id`,
;; the same id the sink writes.
(defrecord EventUpdate [user-id event-id changes new-timeline]
  validated/Validatable
  (declaration [_] event-update-declaration))
