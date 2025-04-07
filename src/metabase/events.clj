(ns metabase.events
  "Provides a very simple Emacs Lisp hook-style events system using Methodical. See
  https://github.com/metabase/metabase/issues/19812 for more information.

  Publish an event, which consists of a [[Topic]] keyword and an event map using [[publish-event!]], 'subscribe' to
  events by writing method implementations of [[publish-event!]].

  On launch, all namespaces starting with `metabase.events.*` will get loaded automatically
  by [[initialize-events!]]."
  (:require
   [clojure.spec.alpha :as s]
   [malli.core :as mc]
   [malli.generator :as mg]
   [metabase.events.schema :as events.schema]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.methodical.null-cache :as u.methodical.null-cache]
   [metabase.util.methodical.unsorted-dispatcher :as u.methodical.unsorted-dispatcher]
   [methodical.core :as methodical]
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
    #(isa? % :metabase/event)]])

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
  (assert (not *compile-files*) "Calls to publish-event! are not allowed in the top level.")
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
          (format "Invalid event %s: event must be a map." (pr-str event)))
  (try
    (when-let [schema (and (mu/instrument-ns? *ns*) (events.schema/event-schema topic event))]
      (mu/validate-throw schema event))
    (next-method topic event)
    (catch Throwable e
      (throw (ex-info (i18n/tru "Error publishing {0} event: {1}" topic (ex-message e))
                      {:topic topic, :event event}
                      e))))
  event)

(defn- require-hydrate-keys
  "Hydrated keys are optional by default, but when generating examples, we want to include it as a required key."
  [schema]
  (mc/walk
   schema
   (fn [schema _path children _options]
     (if (= :map (mc/type schema))
       (mc/-set-children schema
                         (mapv (fn [[k p s]]
                                 [k (if (:hydrated-key? p)
                                      (dissoc p :optional)
                                      p)
                                  s]) children))
       schema))))

(defn event-info-example
  "Given a topic, return an example event info."
  [topic event]
  (-> (event-schema topic event) mr/resolve-schema require-hydrate-keys (mg/generate {:seed 42})))
