(ns metabase.events
  "Provides a very simply event bus using `core.async` to allow publishing and subscribing to intersting
   topics happening throughout the Metabase system in a decoupled way."
  (:require clojure.java.classpath
            [clojure.core.async :as async]
            [clojure.tools.logging :as log]
            [clojure.tools.namespace.find :as ns-find]))


;;; ## ---------------------------------------- LIFECYCLE ----------------------------------------


(defonce ^:private events-initialized
  (atom nil))

(defn- find-and-load-event-handlers
  "Search Classpath for namespaces that start with `metabase.events.`, then `require` them so initialization can happen."
  []
  (->> (ns-find/find-namespaces (clojure.java.classpath/classpath))
       (filter (fn [ns-symb]
                 (re-find #"^metabase\.events\." (name ns-symb))))
       set
       (map (fn [events-ns]
              (log/info "\tloading events namespace: " events-ns)
              (require events-ns)))
       dorun))

(defn initialize-events!
  "Initialize the asynchronous internal events system."
  []
  (when-not @events-initialized
    (log/info "Starting events system ...")
    (find-and-load-event-handlers)
    (reset! events-initialized true)))


;;; ## ---------------------------------------- PUBLICATION ----------------------------------------


(def ^:private events-channel
  "Channel to host events publications."
  (async/chan))

(def ^:private events-publication
  "Publication for general events channel.
   Expects a map as input and the map must have a `:topic` key."
  (async/pub events-channel #(:topic %)))

(defn publish-event
  "Publish an item into the events stream.
  Returns the published item to allow for chaining."
  [topic event-item]
  {:pre [(keyword topic)]}
  (async/go (async/>! events-channel {:topic (keyword topic) :item event-item}))
  event-item)


;;; ## ---------------------------------------- SUBSCRIPTION ----------------------------------------


(defn subscribe-to-topic
  "Subscribe to a given topic of the general events stream.
   Expects a topic to subscribe to and a `core.async` channel.
   Returns the channel to allow for chaining."
  [topic channel]
  {:pre [(keyword topic)]}
  (async/sub events-publication (keyword topic) channel)
  channel)

(defn subscribe-to-topics
  "Convenience method for subscribing to series of topics against a single channel."
  [topics channel]
  {:pre [(coll? topics)]}
  (loop [[topic & rest] (vec topics)]
    (subscribe-to-topic topic channel)
    (when rest (recur rest))))

(defn start-event-listener
  "Initialize an event listener which runs on a background thread via `go-loop`."
  [topics channel handler-fn]
  {:pre [(seq topics)
         (fn? handler-fn)]}
  ;; create the core.async subscription for each of our topics
  (subscribe-to-topics topics channel)
  ;; start listening for events we care about and do something with them
  (async/go-loop []
    ;; try/catch here to get possible exceptions thrown by core.async trying to read from the channel
    (try
      (let [evt (async/<! channel)]
        (handler-fn evt))
      (catch Exception e
        (log/error "Unexpected error listening on events" e)))
    (recur)))


;;; ## ---------------------------------------- HELPER FUNCTIONS ----------------------------------------


(defn topic->model
  "Determine a valid `model` identifier for the given `topic`."
  [topic]
  ;; just take the first part of the topic name after splitting on dashes.
  (first (clojure.string/split (name topic) #"-")))

(defn object->model-id
  "Determine the appropriate `model_id` (if possible) for a given `object`."
  [topic object]
  (if (contains? (set (keys object)) :id)
    (:id object)
    (let [model (topic->model topic)]
      (get object (keyword (format "%s_id" model))))))

(defn object->user-id
  "Determine the appropriate `user_id` (if possible) for a given `object`."
  [object]
  (or (:actor_id object) (:user_id object) (:creator_id object)))
