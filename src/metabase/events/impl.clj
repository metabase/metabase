(ns metabase.events.impl
  "Provides a very simple Emacs Lisp hook-style events system using Methodical. See
  https://github.com/metabase/metabase/issues/19812 for more information.

  Publish an event, which consists of a [[Topic]] keyword and an event map using [[publish-event!]], 'subscribe' to
  events by writing method implementations of [[publish-event!]].

  On launch, all namespaces starting with `metabase.events.*` will get loaded automatically
  by [[initialize-events!]]."
  (:require
   [clojure.spec.alpha :as s]
   [metabase.app-db.core :as mdb]
   [metabase.events.hierarchy :as events.hierarchy]
   [metabase.events.schema :as events.schema]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.methodical.null-cache :as u.methodical.null-cache]
   [metabase.util.methodical.unsorted-dispatcher :as u.methodical.unsorted-dispatcher]
   [methodical.core :as methodical]
   [methodical.impl.combo.operator :as combo.operator]
   [potemkin :as p]))

(p/import-vars
 [events.schema
  event-schema])

(set! *warn-on-reflection* true)

(def Topic
  "Malli schema for an event topic keyword."
  [:and
   qualified-keyword?
   [:fn
    {:error/message "Events should derive from :metabase/event"}
    #(events.hierarchy/isa? % :metabase/event)]])

(defn- invoke-all!
  "Call `invoke` on each of `methods`. If calls throw, throw the first exception after all calls ran, with the others
  added to it as suppressed."
  [methods invoke]
  (let [errors (into [] (keep (fn [method]
                                (try
                                  (invoke method)
                                  nil
                                  (catch Exception e
                                    e))))
                     methods)]
    (when-let [[^Throwable e & more] (seq errors)]
      (doseq [^Throwable other more
              :when (not (identical? e other))]
        (.addSuppressed e other))
      (throw e))))

;; Inside an open app-DB transaction, the first exception stops the listeners after it, as with `:do`: the transaction
;; rolls back, and a later listener must not act on rows that never commit (e.g. send the invite email of a user).
(combo.operator/defoperator ::publish-event [methods invoke]
  (if (mdb/in-transaction?)
    (run! invoke methods)
    (invoke-all! methods invoke)))

(s/def ::publish-event-dispatch-value
  (s/and
   (some-fn qualified-keyword? #(= % :default))
   #(not= (namespace %) "event")))

(methodical/defmulti publish-event!
  "'Publish' an event by calling [[publish-event!]] with a [[Topic]] and an `event` map, whose contents vary
  based on their `topic`. These calls return the original `event` object passed in, to support chaining.

    (events/publish-event! :event/database-create {:object database :user-id api/*current-user-id*})

  'Subscribe' to an event by add a Methodical method implementation. Every method implementation that matches the
  topic is called for a single invocation, from the most specific dispatch value to the least specific; return values
  are ignored. Outside an app-DB transaction, a method that throws does not stop the others: this throws after all of
  them ran, an `ex-info` whose cause is the first exception, with the others added to it as suppressed. Inside an
  app-DB transaction, the first exception stops the methods after it.

  Don't write method implementations for the event names themselves, e.g. `:event/database-create`, because these will
  stomp on other methods with the same key:

    ;; bad! If someone else writes a method for `:event/database-create`, it will stomp on this
    (methodical/defmethod events/publish-event! :event/database-create
      [topic event]
       ...)

  Instead, derive the event from another key in the event hierarchy, and write a method for that

    ;; Good
    (events/derive! :event/database-create ::events)
    (methodical/defmethod events/publish-event! ::events
      [topic event]
       ...)

  The schema for each event topic are defined in `metabase.events.schema`, makes sure to keep it up-to-date
  if you're working on a new event topic or updating an existing one."
  {:arglists            '([topic event])
   :defmethod-arities   #{2}
   :dispatch-value-spec ::publish-event-dispatch-value}
  :combo
  (combo.operator/operator-method-combination ::publish-event)
  ;; work around https://github.com/camsaul/methodical/issues/97
  :dispatcher
  (u.methodical.unsorted-dispatcher/unsorted-dispatcher
   (fn dispatch-fn [topic _event]
     (keyword topic))
   :hierarchy #'events.hierarchy/hierarchy)
  ;; work around https://github.com/camsaul/methodical/issues/98
  :cache
  (u.methodical.null-cache/null-cache))

(methodical/defmethod publish-event! :default
  [_topic _event]
  nil)

(methodical/defmethod publish-event! :around :default
  [topic event]
  (assert (not *compile-files*) "Calls to publish-event! are not allowed in the top level.")
  (let [{:keys [object]} event]
    (log/debugf "Publishing %s event (model and id): %s"
                (u/colorize :yellow (pr-str topic))
                (pr-str (let [model (mi/model object)]
                          (cond-> (select-keys object [:id])
                            model
                            (assoc :model model))))))
  (assert (and (qualified-keyword? topic)
               (events.hierarchy/isa? topic :metabase/event))
          (format "Invalid event topic %s: events must derive from :metabase/event" (pr-str topic)))
  (assert (map? event)
          (format "Invalid event %s: event must be a map." (pr-str event)))
  (try
    (when-let [schema (and (mu/instrument-ns? *ns*) (events.schema/event-schema topic))]
      (mu/validate-throw schema event))
    (next-method topic event)
    (catch Throwable e
      (throw (ex-info (i18n/tru "Error publishing {0} event: {1}" topic (ex-message e))
                      {:topic topic, :event event}
                      e))))
  event)

(defn object->metadata
  "Determine metadata, if there is any, for given `object`.
  Expand the object when we need more metadata."
  [object]
  {:cached       (:cached object)
   :ignore_cache (:ignore_cache object)
   ;; the :context key comes from qp middleware:
   ;; [[metabase.query-processor.middleware.process-userland-query/add-and-save-execution-info-xform!]]
   ;; and is important for distinguishing view events triggered when pinned cards are 'viewed'
   ;; when a user opens a collection.
   :context      (:context object)})
