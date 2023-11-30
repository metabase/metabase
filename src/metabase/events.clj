(ns metabase.events
  "Provides a very simple Emacs Lisp hook-style events system using Methodical. See
  https://github.com/metabase/metabase/issues/19812 for more information.

  Publish an event, which consists of a [[Topic]] keyword and an event map using [[publish-event!]], 'subscribe' to
  events by writing method implementations of [[publish-event!]].

  On launch, all namespaces starting with `metabase.events.*` will get loaded automatically
  by [[initialize-events!]]."
  (:require
   [clojure.spec.alpha :as s]
   [metabase.events.schema :as events.schema]
   [metabase.models.interface :as mi]
   [metabase.plugins.classloader :as classloader]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.methodical.null-cache :as u.methodical.null-cache]
   [metabase.util.methodical.unsorted-dispatcher
    :as u.methodical.unsorted-dispatcher]
   [methodical.core :as methodical]
   [steffan-westcott.clj-otel.api.trace.span :as span]))

(set! *warn-on-reflection* true)

(def Topic
  "Malli schema for an event topic keyword."
  [:and
   qualified-keyword?
   [:fn
    {:error/message "Events should derive from :metabase/event"}
    #(isa? % :metabase/event)]])

(defonce ^:private events-initialized?
  (atom nil))

(defn- find-and-load-event-handlers!
  "Look for namespaces that start with `metabase.events.`, and call their `events-init` function if it exists."
  []
  (doseq [ns-symb u/metabase-namespace-symbols
          :when   (.startsWith (name ns-symb) "metabase.events.")]
    (log/info (i18n/trs "Loading events namespace:") (u/format-color 'blue ns-symb) (u/emoji "👂"))
    (classloader/require ns-symb)))

(defn- initialize-events!
  "Initialize the asynchronous internal events system."
  []
  (when-not @events-initialized?
    (locking events-initialized?
      (when-not @events-initialized?
        (find-and-load-event-handlers!)
        (reset! events-initialized? true)))))

(s/def ::publish-event-dispatch-value
  (s/and
   (some-fn qualified-keyword? #(= % :default))
   #(not= (namespace %) "event")))

(methodical/defmulti publish-event!
  "'Publish' an event by calling [[publish-event!]] with a [[Topic]] and an `event` map, whose contents vary
  based on their `topic`. These calls return the original `event` object passed in, to support chaining.

    (events/publish-event! :event/database-create {:object database :user-id api/*current-user-id*})

  'Subscribe' to an event by add a Methodical method implementation. Since this uses
  the [[methodical/do-method-combination]], all multiple method implementations can be called for a single invocation.
  The order is indeterminate, but return value is ignored.

  Don't write method implementations for the event names themselves, e.g. `:event/database-create`, because these will
  stomp on other methods with the same key:

    ;; bad! If someone else writes a method for `:event/database-create`, it will stomp on this
    (methodical/defmethod events/publish-event! :event/database-create
      [topic event]
       ...)

  Instead, derive the event from another key, and write a method for that

    ;; Good
    (derive :event/database-create ::events)
    (methodical/defmethod events/publish-event! ::events
      [topic event]
       ...)

  The schema for each event topic are defined in `metabase.events.schema`, makes sure to keep it up-to-date
  if you're working on a new event topic or updating an existing one."
  {:arglists            '([topic event])
   :defmethod-arities   #{2}
   :dispatch-value-spec ::publish-event-dispatch-value}

  :combo
  (methodical/do-method-combination)

  ;; work around https://github.com/camsaul/methodical/issues/97
  :dispatcher
  (u.methodical.unsorted-dispatcher/unsorted-dispatcher
   (fn dispatch-fn [topic _event]
     (keyword topic)))

  ;; work around https://github.com/camsaul/methodical/issues/98
  :cache
  (u.methodical.null-cache/null-cache))

(methodical/defmethod publish-event! :default
  [_topic _event]
  nil)

(methodical/defmethod publish-event! :around :default
  [topic event]
  (span/with-span!
    {:name       "publish-event!"
     :attributes {:event/topic topic
                  :events/initialized (some? @events-initialized?)}}
    (assert (not *compile-files*) "Calls to publish-event! are not allowed in the top level.")
    (if-not @events-initialized?
      ;; if the event namespaces aren't initialized yet, make sure they're all loaded up before trying to do dispatch.
      (do
        (initialize-events!)
        (publish-event! topic event))
      (do
        (span/with-span!
          {:name       "publish-event!.logging"
           :attributes {}}
          (let [{:keys [object]} event]
            (log/debugf "Publishing %s event (name and id):\n\n%s"
                       (u/colorize :yellow (pr-str topic))
                       (u/pprint-to-str (let [model (mi/model object)]
                                          (cond-> (select-keys object [:name :id])
                                            model
                                            (assoc :model model))))))
          (assert (and (qualified-keyword? topic)
                       (isa? topic :metabase/event))
                  (format "Invalid event topic %s: events must derive from :metabase/event" (pr-str topic)))
          (assert (map? event)
                  (format "Invalid event %s: event must be a map." (pr-str event))))
        (try
          (when-let [schema (events.schema/topic->schema topic)]
            (mu/validate-throw schema event))
          (span/with-span!
            {:name       "publish-event!.next-method"
             :attributes {}}
            (next-method topic event))
          (catch Throwable e
            (throw (ex-info (i18n/tru "Error publishing {0} event: {1}" topic (ex-message e))
                            {:topic topic, :event event}
                            e))))
        event))))

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
