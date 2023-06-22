(ns metabase.events
  "Provides a very simply event bus using `core.async` to allow publishing and subscribing to interesting topics
  happening throughout the Metabase system in a decoupled way.

  ## Regarding Events Initialization:

  The most appropriate way to initialize event listeners in any `metabase.events.*` namespace is to implement the
  `events-init` function which accepts zero arguments. This function is dynamically resolved and called exactly once
  when the application goes through normal startup procedures. Inside this function you can do any work needed and add
  your events subscribers to the bus as usual via `start-event-listener!`."
  (:require
   [clojure.core.async :as a]
   [clojure.string :as str]
   [metabase.plugins.classloader :as classloader]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

;;; --------------------------------------------------- LIFECYCLE ----------------------------------------------------

(defmulti init!
  "Initialize event handlers. All implementations of this method are called once when the event system is started. Add a
  new implementation of this method to define new event initialization logic. All `metabase.events.*` namespaces are
  loaded automatically during event initialization before invoking implementations of `init!`.

  `unique-key` is not used internally but must be unique."
  {:arglists '([unique-key])}
  keyword)

(defonce ^:private events-initialized?
  (atom nil))

(defn- find-and-load-event-handlers!
  "Look for namespaces that start with `metabase.events.`, and call their `events-init` function if it exists."
  []
  (doseq [ns-symb u/metabase-namespace-symbols
          :when   (.startsWith (name ns-symb) "metabase.events.")]
    (classloader/require ns-symb))
  (doseq [[k f] (methods init!)]
    (log/info (trs "Starting events listener:") (u/format-color 'blue k) (u/emoji "👂"))
    (try
      (f k)
      (catch Throwable e
        (log/error e (trs "Error starting events listener"))))))

(defn initialize-events!
  "Initialize the asynchronous internal events system."
  []
  (when-not @events-initialized?
    (find-and-load-event-handlers!)
    (reset! events-initialized? true)))


;;; -------------------------------------------------- PUBLICATION ---------------------------------------------------


(defonce ^:private ^{:doc "Channel to host events publications."} events-channel
  (a/chan))

(defonce ^:private ^{:doc "Publication for general events channel. Expects a map as input and the map must have a
  `:topic` key."} events-publication
  (a/pub events-channel :topic))

(defn publish-event!
  "Publish an item into the events stream. Returns the published item to allow for chaining."
  {:style/indent 1}
  [topic event-item]
  {:pre [(keyword topic)]}
  (let [event {:topic (keyword topic), :item event-item}]
    (log/tracef "Publish event %s" (pr-str event))
    (a/put! events-channel event))
  event-item)


;;; -------------------------------------------------- SUBSCRIPTION --------------------------------------------------

(defn- subscribe-to-topic!
  "Subscribe to a given topic of the general events stream. Expects a topic to subscribe to and a `core.async` channel.
  Returns the channel to allow for chaining."
  [topic channel]
  {:pre [(keyword topic)]}
  (a/sub events-publication (keyword topic) channel)
  channel)

(defn subscribe-to-topics!
  "Convenience method for subscribing to a series of topics against a single channel."
  [topics channel]
  {:pre [(coll? topics)]}
  (doseq [topic topics]
    (subscribe-to-topic! topic channel)))

(defn start-event-listener!
  "Initialize an event listener which runs on a background thread via `go-loop`."
  [topics channel handler-fn]
  {:pre [(seq topics) (fn? handler-fn)]}
  ;; create the core.async subscription for each of our topics
  (subscribe-to-topics! topics channel)
  ;; start listening for events we care about and do something with them
  (a/go-loop []
    ;; try/catch here to get possible exceptions thrown by core.async trying to read from the channel
    (when-let [val (a/<! channel)]
      (try
        (handler-fn val)
        (catch Throwable e
          (log/error e (trs "Unexpected error listening on events"))))
      (recur))))


;;; ------------------------------------------------ HELPER FUNCTIONS ------------------------------------------------

(defn topic->model
  "Determine a valid `model` identifier for the given `topic`."
  [topic]
  ;; just take the first part of the topic name after splitting on dashes.
  (first (str/split (name topic) #"-")))

(defn object->model-id
  "Determine the appropriate `model_id` (if possible) for a given `object`."
  [topic object]
  (if (contains? (set (keys object)) :id)
    (:id object)
    (let [model (topic->model topic)]
      (get object (keyword (format "%s_id" model))))))

(def ^{:arglists '([object])} object->user-id
  "Determine the appropriate `user_id` (if possible) for a given `object`."
  (some-fn :actor_id :user_id :creator_id))

(defn object->metadata
  "Determine metadata, if there is any, for given `object`.
  Expand the object when we need more metadata."
  [object]
  {:cached       (:cached object)
   :ignore_cache (:ignore_cache object)
   ;; the :context key comes from qp middleware:
   ;; `metabase.query-processor.middleware.process-userland-query/add-and-save-execution-info-xform!`
   ;; and is important for distinguishing view events triggered when pinned cards are 'viewed'
   ;; when a user opens a collection.
   :context      (:context object)})
