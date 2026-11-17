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
  "Within [[do-with-batched-events]], an atom of `{:events [collected-event ...], :pending [delete-event ...],
  :captures {[model id] {consumer-key value}}}`."
  nil)

(def ^:private Operation
  "The kind of a write of a row."
  [:enum :create :update :delete])

(defmulti spec
  "The lifecycle topics of a model deriving `:hook/events`, as `{operation topic}`, such as
  `{:create :event/card-create, :update :event/card-update, :delete :event/card-delete}`, where a write whose operation
  is missing publishes nothing."
  {:arglists '([model])}
  identity)

(defmethod spec :default
  [_model]
  nil)

(mu/defn lifecycle-topic :- [:maybe qualified-keyword?]
  "The topic of the event for `operation` on a row of `model`, such as `:event/card-create`, from its [[spec]], or nil
  when the spec leaves the operation out."
  [model     :- :keyword
   operation :- Operation]
  (if-let [model-spec (get (methods spec) model)]
    (get (model-spec model) operation)
    (throw (ex-info (format "%s derives :hook/events but has no metabase.events.core/spec method naming its topics"
                            model)
                    {:model model}))))

(def ^:private CollectedEvent
  "A write of a row: its model, its kind, the row after it for a create or an update, and the row before it for an
  update or a delete."
  [:map
   [:model     :keyword]
   [:operation Operation]
   [:id        [:maybe [:or :int :string]]]
   [:object    {:optional true} [:maybe [:map]]]
   [:previous-object {:optional true} [:maybe [:map]]]
   [:user-id   [:maybe :int]]
   [:context   {:optional true} [:maybe [:map]]]
   [:captures  {:optional true} [:maybe [:map]]]])

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic *context*
  "The context that the events collected within it carry, as `::events.schema/lifecycle` lists its keys: the
  `:revision-message` of the revisions they cause, or the `[model id]` of the entity whose archive or restore carried
  their rows, `:archived-with`."
  nil)

(defonce ^:private owned-consumers
  (atom {}))

(defonce ^:private capturers
  (atom {}))

(defonce ^:private statement-capturers
  (atom {}))

(defonce ^:private sinks
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
  the batch, called once per owner per batch, where `owner` is a function of an event giving its owner key, nil when
  the consumer ignores the event; with `{:last? true}` it is called after the other consumers, so that it sees the
  rows they write."
  ([consumer-key :- :keyword
    owner        :- ifn?
    handle       :- ifn?]
   (register-owned-consumer! consumer-key owner handle {}))
  ([consumer-key :- :keyword
    owner        :- ifn?
    handle       :- ifn?
    {:keys [last?]} :- [:map {:closed true} [:last? {:optional true} :boolean]]]
   (swap! owned-consumers assoc consumer-key {:owner owner :handle handle :last? (boolean last?)})
   nil))

(mu/defn register-capture!
  "Have `capture`, a function of the vector of the delete events of the rows of one model that one DELETE statement
  removes, called once per statement, in its transaction, after the before-delete hooks of the model and before the
  DELETE runs, so that it can read the rows that the delete cascades to. A non-nil value it returns is attached under
  `consumer-key` in `:captures` to one of those events that the batch delivers, for the handler of the consumer at the
  end of the batch."
  [consumer-key :- :keyword
   capture      :- ifn?]
  (swap! capturers assoc consumer-key capture)
  nil)

(mu/defn register-sink!
  "Have `flush`, a function of a vector of items, called once at the end of each batch, in its transaction and after its
  events are delivered, with the items [[add-to-sink!]] gave `sink-key` in the batch, in their order; outside a batch
  it is called at once with the one item."
  [sink-key :- :keyword
   flush    :- ifn?]
  (swap! sinks assoc sink-key flush)
  nil)

(mu/defn add-to-sink!
  "Give `item`, a map, to the sink `sink-key`, to be flushed with the other items of the batch, or at once outside a
  batch."
  [sink-key :- :keyword
   item     :- [:map]]
  (if-let [batch *batch*]
    (swap! batch update-in [:sinks sink-key] (fnil conj []) item)
    ((get @sinks sink-key) [item]))
  nil)

(defn- flush-sinks!
  "Flush the items that the sinks of `by-sink`, `{sink-key items}`, collected."
  [by-sink]
  (doseq [[sink-key items] by-sink]
    ((get @sinks sink-key) items)))

(defn- capture
  "The values that the captures give for `events`, deletes of rows of one model, by consumer key."
  [events]
  (into {}
        (keep (fn [[consumer-key capture]]
                (when-some [value (capture events)]
                  [consumer-key value])))
        @capturers))

(defn- carrier
  "The `[model id]` of the delete event that carries the captures of `events`."
  [events]
  ((juxt :model :id) (peek events)))

(mu/defn capture-deletes!
  "Run the captures over the deletes of rows of `model` that the batch collected since the last call, before the
  DELETE statement that removes those rows runs."
  [model :- :keyword]
  (when-let [batch *batch*]
    (let [[old _] (swap-vals! batch update :pending #(filterv (fn [event] (not= model (:model event))) %))
          events  (filterv #(= model (:model %)) (:pending old))]
      (when (seq events)
        (when-let [captured (not-empty (capture events))]
          (swap! batch update-in [:captures (carrier events)] merge captured))))))

(mu/defn register-statement-capture!
  "Have `capture`, a function of a model and of `select-rows`, called once per DELETE statement of that model, in its
  transaction and before the before-delete hooks of the model, so that it can read the rows that the hooks or the
  delete remove. `select-rows`, a function of columns, selects those columns of the rows that the statement matches. A
  non-nil value `capture` returns is attached as [[register-capture!]] attaches one."
  [consumer-key :- :keyword
   capture      :- ifn?]
  (swap! statement-capturers assoc consumer-key capture)
  nil)

(mu/defn capture-statement!
  "Run the statement captures of a DELETE of `model`, whose primary key is `pk`, with `select-rows`, a function of
  columns selecting them from the rows the statement matches, before the before-delete hooks of the model run."
  [model       :- :keyword
   pk          :- :keyword
   select-rows :- ifn?]
  (when-let [batch (and (lifecycle-topic model :delete) *batch*)]
    (let [selected (atom nil)
          select   (fn [columns]
                     (reset! selected (select-rows (vec (distinct (cons pk columns))))))
          captured (into {}
                         (keep (fn [[consumer-key capture]]
                                 (when-some [value (capture model select)]
                                   [consumer-key value])))
                         @statement-capturers)]
      (when-let [carrier-id (and (seq captured) (get (last @selected) pk))]
        (swap! batch update-in [:captures [model carrier-id]] merge captured)))))

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
  (let [create (first (filter #(= :create (:operation %)) events))
        fst    (first events)
        lst    (peek events)
        shared {:user-id  (some :user-id (rseq events))
                :context  (apply merge (map :context events))
                :captures (apply merge (map :captures events))}
        object (:object (peek (filterv :object events)))]
    (cond
      (and create (some #(= :delete (:operation %)) events))
      nil

      create
      (merge create shared {:object object})

      (= :delete (:operation lst))
      (merge (dissoc lst :object) shared {:previous-object (:previous-object fst)})

      :else
      (merge lst shared {:operation       :update
                         :object          object
                         :previous-object (:previous-object fst)}))))

(defn- compact
  "One event per row, in the order of the first write of the row."
  [events]
  (let [order   (distinct (map (juxt :model :id) events))
        by-row  (group-by (juxt :model :id) events)]
    (into [] (keep #(merge-events (vec (get by-row %)))) order)))

(defn- payload
  [{:keys [object previous-object user-id context]}]
  (cond-> {:user-id user-id}
    object          (assoc :object object)
    previous-object (assoc :previous-object previous-object)
    (seq context)   (assoc :context context)))

(defn- attach-captures
  "`events` with `captures`, `{[model id] {consumer-key value}}`, attached to the delivered delete of that row."
  [events captures]
  (let [carriers (into {}
                       (keep-indexed (fn [i {:keys [operation model id]}]
                                       (when (= :delete operation) [[model id] i])))
                       events)]
    (reduce-kv (fn [events k captured]
                 (if-let [i (carriers k)]
                   (update-in events [i :captures] merge captured)
                   events))
               events
               captures)))

(defn- deliver!
  [events captures]
  (let [events (attach-captures (compact events) captures)]
    (doseq [event events]
      (@publisher (lifecycle-topic (:model event) (:operation event)) (payload event)))
    (doseq [{:keys [owner handle]} (sort-by :last? (vals @owned-consumers))
            :let [by-owner (group-by owner events)]
            [owner-key owned] by-owner
            :when (some? owner-key)]
      (handle owner-key owned events))))

(defn- finish!
  "Deliver what the batch collected, and what the delivery makes it collect, then flush its sinks, until nothing is
  left."
  [batch]
  (loop []
    (let [[old _] (swap-vals! batch assoc :events [] :captures {})]
      (if (seq (:events old))
        (do (deliver! (:events old) (:captures old))
            (recur))
        (let [[old _] (swap-vals! batch assoc :sinks {})]
          (when (seq (:sinks old))
            (flush-sinks! (:sinks old))
            (recur)))))))

(mu/defn collect!
  "Collect the event of a write of a row, or deliver it at once outside a batch, when the spec of its model names a
  topic for its operation."
  [event :- CollectedEvent]
  (when-let [topic (lifecycle-topic (:model event) (:operation event))]
    (let [event   (assoc event :context *context*)
          delete? (= :delete (:operation event))]
      (ensure-topic! topic)
      (if-let [batch *batch*]
        (swap! batch #(cond-> (update % :events conj event)
                        delete? (update :pending conj event)))
        (deliver! [(cond-> event delete? (assoc :captures (capture [event])))] {})))))

(defn- run-batch
  "Run `thunk` in a batch, joining the batch there already is, in its transaction when `join-transaction?` and in a
  nested one that rolls back alone otherwise. A joined `thunk` that throws leaves no events behind in the batch, for
  the rows it wrote may be rolled back with a savepoint of its caller."
  [join-transaction? thunk]
  (let [run (fn []
              (let [batch (atom {:events [] :pending [] :captures {} :sinks {}})]
                (binding [*batch* batch]
                  (u/prog1 (thunk)
                    (finish! batch)))))]
    (cond
      *batch*           (let [batch   *batch*
                              mark    (count (:events @batch))
                              pending (count (:pending @batch))]
                          (try
                            (thunk)
                            (catch Throwable e
                              (swap! batch #(-> %
                                                (update :events subvec 0 (min mark (count (:events %))))
                                                (update :pending subvec 0 (min pending (count (:pending %))))))
                              (throw e))))
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
