(ns metabase.mq.memory
  "In-memory message store for the memory queue backend. Rather than a FIFO queue of opaque
  payloads, each `layer` tracks messages individually by a monotonically-increasing id (insertion
  order) — mirroring the appdb row / redis stream-entry model — so a per-message failure count
  lives on the message itself and the oldest message is simply the lowest id. Purely in-memory and
  non-durable.

  Tests construct isolated layers with [[make-layer]]; the poll context / poll thread lives on the
  backend record, driven by [[metabase.mq.queue.polling]]. This layer only owns the storage.")

(set! *warn-on-reflection* true)

(defn make-layer
  "Creates a fresh memory layer: a `sorted-map` of message id → message (ordered by id, so the
  oldest message is first) plus the id counter."
  []
  {:messages (atom (sorted-map))
   :next-id  (atom 0)})

(defonce ^{:doc "Process-wide singleton layer shared by the production memory backend."}
  default-layer
  (make-layer))

(defn publish!
  "Stores a new pending message for `channel-name` with the given opaque payload string."
  [{:keys [messages next-id]} channel-name payload]
  (let [id (swap! next-id inc)]
    (swap! messages assoc id {:id id :queue channel-name :payload payload :failures 0})))

(defn take-oldest
  "Returns the oldest stored message for `channel-name` as a `{:queue :payload :batch-id}`
  descriptor, or nil if there are none. The message stays in the store (tracked by id) until it's
  acked or dropped — the poll loop's channel-busy gate keeps it from being re-fetched while it's
  in-flight."
  [{:keys [messages]} channel-name]
  (when-let [{:keys [id payload]} (->> (vals @messages)
                                       (filter #(= channel-name (:queue %)))
                                       first)]
    {:queue channel-name :payload payload :batch-id id}))

(defn message-failures
  "Returns how many times message `id` has already failed, or nil if it's no longer stored."
  [{:keys [messages]} id]
  (:failures (get @messages id)))

(defn ack!
  "Removes message `id` from the store (on success or permanent failure)."
  [{:keys [messages]} id]
  (swap! messages dissoc id))

(defn retry!
  "Increments the failure count of message `id`, leaving it stored so it gets re-delivered."
  [{:keys [messages]} id]
  (swap! messages (fn [m] (if (contains? m id) (update-in m [id :failures] inc) m))))

(defn depths
  "Returns a `{:channel :status :count}` row per channel describing how many messages are stored."
  [{:keys [messages]}]
  (->> (vals @messages)
       (group-by :queue)
       (map (fn [[queue msgs]] {:channel (name queue) :status "pending" :count (count msgs)}))))

(defn drop-orphaned!
  "Removes stored messages whose `:queue` is not in `live-queues` (a set of channel keywords that
  currently have a registered listener). Returns the number of messages dropped. The memory backend
  is single-process and non-durable, so a message for a queue with no listener can never be
  consumed; dropping it keeps the store (and the queue-depth gauge) from growing without bound."
  [{:keys [messages]} live-queues]
  (let [[old new] (swap-vals! messages
                              (fn [m]
                                (into (sorted-map)
                                      (filter (fn [[_id msg]] (contains? live-queues (:queue msg))))
                                      m)))]
    (- (count old) (count new))))

(defn clear!
  "Clears all stored messages. Called by the backend's `shutdown!`."
  [{:keys [messages next-id]}]
  (reset! messages (sorted-map))
  (reset! next-id 0))
