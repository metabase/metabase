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

(defn- add-suppressed!
  "Add each of `others` to `e` as suppressed, and return `e`."
  ^Throwable [^Throwable e others]
  (doseq [^Throwable other others
          ;; two listeners can throw one object (for example, a failed `delay`), and `(.addSuppressed e e)` throws
          :when (not (identical? e other))]
    (.addSuppressed e other))
  e)

(defn- invoke-all!
  "Call `invoke` on each of `methods`. If calls throw Exceptions, throw the first after all calls ran, with the others
  added to it as suppressed. An Error or an InterruptedException propagates at once, with the Exceptions before it
  added to it as suppressed; an InterruptedException also sets the interrupt flag of the thread again."
  [methods invoke]
  (let [errors (reduce (fn [errors method]
                         (try
                           (invoke method)
                           errors
                           (catch InterruptedException e
                             (.interrupt (Thread/currentThread))
                             (throw (add-suppressed! e errors)))
                           (catch Exception e
                             (conj errors e))
                           (catch Error e
                             (throw (add-suppressed! e errors)))))
                       []
                       methods)]
    (when-let [[e & more] (seq errors)]
      (throw (add-suppressed! e more)))))

;; Inside an open app-DB transaction, the first throw stops the listeners after it, as with `:do`: the transaction
;; rolls back, and a later listener must not act on rows that never commit (for example, send the invite email of a
;; user that rolls back).
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

  'Subscribe' to an event by adding a Methodical method implementation (a listener). Each call runs every listener
  that matches the topic. A listener on the topic runs before the listeners of its ancestors; the order of the other
  listeners is not defined. Return values are ignored.

  Outside an app-DB transaction, a listener that throws an `Exception` does not stop the others: after all ran,
  `publish-event!` throws an `ex-info` whose cause is the first exception, with the others added to it as suppressed.
  An `Error` or an `InterruptedException` stops the listeners after it, and is the cause, with the earlier exceptions
  added to it as suppressed; an `InterruptedException` also sets the interrupt flag of the thread again. Inside an
  app-DB transaction, the first throw stops the listeners after it.

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
