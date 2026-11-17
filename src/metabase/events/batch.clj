(ns metabase.events.batch
  "Delivery of the lifecycle events of rows: each write of a row of a model with the events trait collects an event,
  and the events are delivered when the batch they belong to ends, inside its transaction."
  (:require
   [metabase.events.hierarchy :as events.hierarchy]
   [metabase.events.impl :as events.impl]
   [metabase.events.schema :as events.schema]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [toucan2.connection :as t2.conn]))

(set! *warn-on-reflection* true)

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:private ^:dynamic *batch*
  "Within [[do-with-batched-events]], an atom of `{:events [collected-event ...]}`."
  nil)

(def ^:private topic-stems
  "The stem of the lifecycle topics of the models whose name is not it."
  {:model/Notification              "notification-row"
   :model/Pulse                     "pulse-row"
   :model/NativeQuerySnippet        "snippet"
   :model/PermissionsGroup          "group"
   :model/PermissionsGroupMembership "group-membership"})

(def ^:private Operation
  "The kind of a write of a row."
  [:enum :create :update :delete])

(mu/defn lifecycle-topic :- qualified-keyword?
  "The topic of the event for `operation` on a row of `model`, such as `:event/card-create`."
  [model     :- :keyword
   operation :- Operation]
  (keyword "event" (str (get topic-stems model (u/->kebab-case-en (name model))) "-" (name operation))))

(def ^:private CollectedEvent
  "A write of a row: its model, its kind, the row, the row before for an update or delete, and the changes."
  [:map
   [:model     :keyword]
   [:operation Operation]
   [:id        [:maybe [:or :int :string]]]
   [:object    [:fn map?]]
   [:previous-object {:optional true} [:maybe [:fn map?]]]
   [:changes   {:optional true} [:maybe [:fn map?]]]
   [:user-id   [:maybe :int]]
   [:context   {:optional true} [:maybe [:fn map?]]]
   [:captures  {:optional true} [:maybe [:map]]]])

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic *context*
  "The context that the events collected within it carry, such as the message of the revisions they cause."
  nil)

(defonce ^:private owned-consumers
  (atom {}))

(defonce ^:private capturers
  (atom {}))

(defonce ^:private publisher
  (atom events.impl/publish-event!))

(mu/defn set-publisher!
  "Have the events be delivered by `publish!`, a function of a topic and an event, which the event bus gives as its own
  `publish-event!`."
  [publish! :- ifn?]
  (reset! publisher publish!)
  nil)

(mu/defn register-owned-consumer!
  "Have `handle`, a function of an owner key, the vector of the events of that owner and the vector of all the events of
  the batch, called once per owner per batch, where `owner` is a function of an event giving its owner key, nil when the consumer ignores the event."
  [consumer-key :- :keyword
   owner        :- ifn?
   handle       :- ifn?]
  (swap! owned-consumers assoc consumer-key {:owner owner :handle handle})
  nil)

(mu/defn register-capture!
  "Have `capture`, a function of the collected event, called synchronously at the write, in its transaction and, for a
  delete, before the DELETE runs, so that it can read rows that the delete cascades to. A non-nil value it returns is
  attached to the event under `consumer-key` in `:captures`, for the handler of the consumer at the end of the batch."
  [consumer-key :- :keyword
   capture      :- ifn?]
  (swap! capturers assoc consumer-key capture)
  nil)

(defn- capture
  [event]
  (into {}
        (keep (fn [[consumer-key capture]]
                (when-some [value (capture event)]
                  [consumer-key value])))
        @capturers))

(defn- ensure-topic!
  [topic]
  (locking owned-consumers
    (when-not (events.hierarchy/isa? topic :metabase/event)
      (events.hierarchy/derive! topic :metabase/event)))
  (events.schema/register-lifecycle-topic! topic))

(defn- merge-events
  "The one event that the `events` of one row amount to, or nil when the row came and went. The insert of a row may
  collect after the writes its own hooks make, so a creation is told by any of the events, not by the first."
  [events]
  (let [create  (first (filter #(= :create (:operation %)) events))
        updates (remove #(#{:create :delete} (:operation %)) events)
        fst     (first events)
        lst     (peek events)
        shared  {:user-id  (some :user-id (rseq events))
                 :context  (apply merge (map :context events))
                 :captures (apply merge (map :captures events))}
        changes (apply merge (map :changes updates))]
    (cond
      (and create (some #(= :delete (:operation %)) events))
      nil

      create
      (merge create shared {:object (into (:object create) changes)})

      (= :delete (:operation lst))
      (merge (dissoc lst :changes) shared {:previous-object (:previous-object fst)})

      :else
      (merge (dissoc lst :previous-object) shared {:operation       :update
                                                   :previous-object (:previous-object fst)
                                                   :changes         changes}))))

(defn- compact
  "One event per row, in the order of the first write of the row."
  [events]
  (let [order   (distinct (map (juxt :model :id) events))
        by-row  (group-by (juxt :model :id) events)]
    (into [] (keep #(merge-events (vec (get by-row %)))) order)))

(defn- payload
  [{:keys [object previous-object changes user-id context]}]
  (cond-> {:object object :user-id user-id}
    previous-object (assoc :previous-object previous-object)
    changes         (assoc :changes changes)
    (seq context)   (assoc :context context)))

(defn- deliver!
  [events]
  (let [events (compact events)]
    (doseq [event events]
      (@publisher (lifecycle-topic (:model event) (:operation event)) (payload event)))
    (doseq [{:keys [owner handle]} (vals @owned-consumers)
            :let [by-owner (group-by owner events)]
            [owner-key owned] by-owner
            :when (some? owner-key)]
      (handle owner-key owned events))))

(defn- finish!
  "Deliver what the batch collected, and what the delivery makes it collect, until nothing is left."
  [batch]
  (loop []
    (let [[old _] (swap-vals! batch assoc :events [])]
      (when (seq (:events old))
        (deliver! (:events old))
        (recur)))))

(mu/defn collect!
  "Collect the event of a write of a row, or deliver it at once outside a batch."
  [event :- CollectedEvent]
  (let [topic (lifecycle-topic (:model event) (:operation event))
        event (assoc event :context *context*)
        event (assoc event :captures (capture event))]
    (ensure-topic! topic)
    (if-let [batch *batch*]
      (swap! batch update :events conj event)
      (deliver! [event]))))

(defn- run-batch
  "Run `thunk` in a batch, joining the batch there already is, in its transaction when `join-transaction?` and in a
  nested one that rolls back alone otherwise."
  [join-transaction? thunk]
  (let [run (fn []
              (let [batch (atom {:events []})]
                (binding [*batch* batch]
                  (u/prog1 (thunk)
                    (finish! batch)))))]
    (cond
      *batch*           (thunk)
      join-transaction? (t2.conn/with-transaction [_conn nil {:nested-transaction-rule :ignore}]
                          (run))
      :else             (t2.conn/with-transaction [_conn]
                          (run)))))

(defn do-with-batched-events
  "Run `thunk` in a transaction, with the events of the writes in it delivered once, merged per row, when it ends and
  before the transaction commits, and not at all when it throws; inside another batch, join it, and inside another
  transaction, have a nested one that rolls back alone."
  [thunk]
  (run-batch false thunk))

(defn do-with-write-batch
  "Run `thunk`, the write of a row, as [[do-with-batched-events]] does, but in the transaction there already is."
  [thunk]
  (run-batch true thunk))

(defmacro with-batched-events
  "Run `body` in a transaction, with the events of the writes in it delivered once, merged per row, when it ends and
  before the transaction commits."
  [& body]
  `(do-with-batched-events (fn [] ~@body)))

(defmacro with-event-context
  "Run `body`, with `context`, a map, in the events its writes collect."
  [context & body]
  `(binding [*context* (merge *context* ~context)]
     ~@body))
