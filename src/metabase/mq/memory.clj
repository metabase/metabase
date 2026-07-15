(ns metabase.mq.memory
  "In-memory message store for the memory queue backend. Rather than a FIFO queue of opaque
  payloads, each `layer` tracks messages individually by a monotonically-increasing id (insertion
  order) — mirroring the appdb row / redis stream-entry model — so a per-message failure count
  lives on the message itself and the oldest message is simply the lowest id. Purely in-memory and
  non-durable.

  Tests construct isolated layers with [[make-layer]]; the poll context / poll thread lives on the
  backend record, driven by [[metabase.mq.queue.polling]]. This layer only owns the storage."
  (:require
   [metabase.util :as u]))

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

(defn take-pending!
  "Claims up to `n` not-yet-claimed messages for `channel-name`, marking each in-flight and returning them as
  `{:queue :payload :batch-id}` descriptors (possibly empty). A nil `n` means unbounded.

  Claiming is what makes it safe to fetch more than one batch per channel at a time: a message stays
  in the store until it's acked or dropped, so without an in-flight mark a second fetch — issued while
  the first is still being delivered — would hand out the same message again. `:claimed-at` starts a
  timer, so [[clear-stale-claims!]] can recover a claim whose delivery never completed.

  The claim is derived from `swap-vals!`'s before/after states rather than captured inside the swap
  fn, so a retried CAS can't report a message as claimed twice."
  [{:keys [messages]} channel-name n]
  (if (and n (not (pos? n)))
    []
    (let [claimable? (fn [msg] (and (= channel-name (:queue msg)) (not (:claimed-at msg))))
          timer      (u/start-timer)
          [old new]  (swap-vals! messages
                                 (fn [m]
                                   (let [available (filter claimable? (vals m))
                                         claiming  (if n (take n available) available)]
                                     (reduce #(assoc-in %1 [%2 :claimed-at] timer)
                                             m
                                             (map :id claiming)))))]
      (into []
            (comp (filter (fn [[id msg]] (and (:claimed-at msg)
                                              (not (:claimed-at (get old id))))))
                  (map (fn [[id msg]] {:queue channel-name :payload (:payload msg) :batch-id id})))
            new))))

(defn has-claim?
  "True if any message for `channel-name` is currently claimed — i.e. this backend has handed one out
  and has not yet seen it acked or retried.

  Lets a backend serialize a channel at the store, which is how [[metabase.mq.queue.memory]] implements
  `:exclusive`."
  [{:keys [messages]} channel-name]
  (boolean (some (fn [msg] (and (= channel-name (:queue msg)) (:claimed-at msg)))
                 (vals @messages))))

(defn clear-stale-claims!
  "Un-claims messages that have been in-flight longer than `stale-timeout-ms`, making them fetchable
  again. Returns the number recovered.

  Stands in for the visibility timeout a real broker gives you: without it, a delivery that never
  reaches its ack (its worker thread was killed, or the driver claimed a slot it then couldn't fill)
  would leave the message marked in-flight and unfetchable forever."
  [{:keys [messages]} stale-timeout-ms]
  (let [stale?    (fn [msg] (when-let [timer (:claimed-at msg)]
                              (> (u/since-ms timer) stale-timeout-ms)))
        [old new] (swap-vals! messages
                              (fn [m]
                                (reduce-kv (fn [acc id msg]
                                             (cond-> acc
                                               (stale? msg) (update id dissoc :claimed-at)))
                                           m
                                           m)))]
    (count (filter (fn [[id msg]] (and (:claimed-at msg) (not (:claimed-at (get new id)))))
                   old))))

(defn message-failures
  "Returns how many times message `id` has already failed, or nil if it's no longer stored."
  [{:keys [messages]} id]
  (:failures (get @messages id)))

(defn ack!
  "Removes message `id` from the store (on success or permanent failure)."
  [{:keys [messages]} id]
  (swap! messages dissoc id))

(defn retry!
  "Increments the failure count of message `id`, leaving it stored so it gets re-delivered.

  Clearing `:claimed-at` is what makes it re-deliverable: the failed delivery claimed the message,
  and a claim that is never released is never fetched again."
  [{:keys [messages]} id]
  (swap! messages (fn [m]
                    (if (contains? m id)
                      (-> m
                          (update-in [id :failures] inc)
                          (update id dissoc :claimed-at))
                      m))))

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
