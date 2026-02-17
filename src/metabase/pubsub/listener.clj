(ns metabase.pubsub.listener
  "Handler registry for pub/sub topics. Manages mapping of subscriber names to handler functions.")

(set! *warn-on-reflection* true)

(def ^:dynamic *handlers*
  "Atom containing a map of [topic-name subscriber-name] -> handler-fn."
  (atom {}))

(defn get-handler
  "Returns the handler function for the given topic and subscriber, or nil if not registered."
  [topic-name subscriber-name]
  (get @*handlers* [topic-name subscriber-name]))

(defn register-handler!
  "Registers a handler function for the given topic and subscriber.
  Throws if a handler is already registered for this combination."
  [topic-name subscriber-name handler]
  (when (get-handler topic-name subscriber-name)
    (throw (ex-info "Handler already registered for topic and subscriber"
                    {:topic topic-name :subscriber subscriber-name})))
  (swap! *handlers* assoc [topic-name subscriber-name] handler))

(defn unregister-handler!
  "Removes the handler function for the given topic and subscriber."
  [topic-name subscriber-name]
  (swap! *handlers* dissoc [topic-name subscriber-name]))
