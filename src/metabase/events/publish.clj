(ns metabase.events.publish
  "The builders of the lifecycle events that a write function publishes with `publish-event!`, inside its own
  transaction: [[create-event]] and [[update-event]] after its statements, [[delete-event]] right before the statement
  that deletes the rows, and [[touch-event]] for an owner whose parts changed."
  (:require
   [metabase.events.schema :as events.schema]
   [metabase.models.interface :as mi]
   [metabase.util.events :as u.events]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- event
  "The lifecycle event of `changes` by the current user, with the `:context` and the `:writer` of `opts`, the opts of
  the write function that publishes it."
  [changes {:keys [context writer]}]
  (cond-> {:changes changes :user-id (mi/current-user-id)}
    (seq context) (assoc :context context)
    writer        (assoc :writer writer)))

(mu/defn create-event :- ::events.schema/lifecycle
  "The lifecycle event of the creation of `rows`, the instances an insert returned, by the current user, to publish
  after the insert."
  ([rows :- [:sequential :map]]
   (create-event rows nil))
  ([rows    :- [:sequential :map]
    opts    :- [:maybe :map]]
   (event (u.events/create-changes rows) opts)))

(defn- stamped
  "The row `previous` with `changes` and, when its model is timestamped and a column that counts changes, a new
  `:updated_at`, as the timestamp hook sets it in the update."
  [previous changes]
  (let [model (t2/model previous)]
    (cond-> (merge previous changes)
      (and model
           (isa? model :hook/timestamped?)
           (not (contains? changes :updated_at))
           (some (fn [[k v]] (and (not= v (get previous k))
                                  (not (contains? (mi/non-timestamped-fields previous) k))))
                 changes))
      (assoc :updated_at (java.time.OffsetDateTime/now)))))

(mu/defn update-event :- ::events.schema/lifecycle
  "The lifecycle event of the update of the rows of `stored`, a map from id to the instance the write function read, by
  `rows`, each an `:id` and the columns to set, by the current user, to publish after the update. A row that is not
  stored or changes nothing is left out. `:objects` in `options`, a map from id to the row after the update, gives the
  rows whose columns a hook of the model derives or the database sets; `:context` is the context of the event."
  ([stored :- [:map-of [:or :int :string] :map]
    rows   :- [:sequential [:map [:id [:or :int :string]]]]]
   (update-event stored rows nil))
  ([stored                    :- [:map-of [:or :int :string] :map]
    rows                      :- [:sequential [:map [:id [:or :int :string]]]]
    {:keys [objects] :as opts} :- [:maybe [:map
                                           [:objects {:optional true} [:maybe [:map-of [:or :int :string] :map]]]]]]
   (event (u.events/update-changes stored
                                   rows
                                   (fn [previous changes]
                                     (or (get objects (:id previous)) (stamped previous changes))))
          (dissoc opts :objects))))

(mu/defn delete-event :- ::events.schema/lifecycle
  "The lifecycle event of the delete of `rows`, instances as the write function read them, by the current user, to
  publish right before the statement that deletes them, so that a consumer can still read what the delete cascades to."
  ([rows :- [:sequential :map]]
   (delete-event rows nil))
  ([rows    :- [:sequential :map]
    opts    :- [:maybe :map]]
   (event (u.events/delete-changes rows) opts)))

(mu/defn touch-event :- ::events.schema/lifecycle
  "The lifecycle event of an update of `rows`, instances of an owner such as a Dashboard, that changed none of their
  columns but changed their parts, such as its dashcards, by the current user, to publish as the last step of the
  write, so that the records of the owner, such as its Revision, are made once."
  ([rows :- [:sequential :map]]
   (touch-event rows nil))
  ([rows    :- [:sequential :map]
    opts    :- [:maybe :map]]
   (event (mapv (fn [row] {:previous-object row :object row}) rows) opts)))
