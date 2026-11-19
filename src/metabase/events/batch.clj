(ns metabase.events.batch
  "Delivery of the lifecycle events of rows: each write of a row of a model with the events trait collects an event,
  and the events are delivered when the batch they belong to ends, inside its transaction. The batch is kept in the
  transaction state of the app DB, which a rolled back savepoint restores, so that a write rolled back leaves no event."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.events.hierarchy :as events.hierarchy]
   [metabase.events.impl :as events.impl]
   [metabase.events.schema :as events.schema]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.quick-task :as quick-task]
   [toucan2.connection :as t2.conn]))

(set! *warn-on-reflection* true)

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
  "The map of context keys that the events collected within it carry: `:revision-message`, the message of the revisions
  they cause; `:reverting?`, whether they are the writes of a revert; `:details`, a map the audit log records with them;
  and `:archived-with`, the `[model id]` of the entity whose archive or restore carried their rows."
  nil)

(quick-task/register-submission-wrapper! ::outside-batch
                                         (fn [thunk]
                                           (binding [*context* nil]
                                             (thunk))))

(def ^:private empty-batch
  "The batch before anything is collected: `{:events [collected-event ...], :statements [open-statement ...],
  :next-statement n, :pending {statement [delete-event ...]}, :captures {statement {consumer-key value}}, :sinks
  {sink-key [item ...]}}`, where a statement is the number of a DELETE statement, whose captures go with its deletes."
  {:events [] :statements [] :next-statement 0 :pending {} :captures {} :sinks {}})

(defn- batch-state
  "The transaction state of the app DB holding, under `::batch`, the batch that the writes of this thread join, or nil
  outside a batch."
  []
  (when-let [state (mdb/transaction-state)]
    (when (contains? @state ::batch)
      state)))

(defn- swap-batch!
  "Apply `f` and `args` to the batch held in `state`, returning the transaction state before and after, as
  `swap-vals!` does, and leaving `state` as it is when the batch has ended, as another thread that shares the
  transaction can end it."
  [state f & args]
  (swap-vals! state (fn [s]
                      (if (contains? s ::batch)
                        (apply update s ::batch f args)
                        s))))

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
  DELETE runs, so that it can read the rows that the delete cascades to, a non-nil value it returns being attached under
  `consumer-key` in `:captures` to one of those events that the batch delivers."
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
  (if-let [state (batch-state)]
    (swap-batch! state update-in [:sinks sink-key] (fnil conj []) item)
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

(defn- open-statement
  "The number of the innermost DELETE statement that `batch` runs, or nil."
  [batch]
  (peek (:statements batch)))

(defn capture-deletes!
  "Run the captures over the deletes of rows that the innermost DELETE statement of the batch collected, before that
  statement runs."
  []
  (when-let [state (batch-state)]
    (let [statement (open-statement (::batch @state))
          [old _]   (swap-batch! state update :pending dissoc statement)
          events    (get-in old [::batch :pending statement])]
      (when (seq events)
        (when-let [captured (not-empty (capture events))]
          (swap-batch! state update-in [:captures statement] merge captured))))))

(mu/defn register-statement-capture!
  "Have `capture`, a function of a model and of `select-rows`, a function of columns selecting them from the rows a
  DELETE statement matches, called once per DELETE statement of that model, in its transaction and before its
  before-delete hooks, so that it can read the rows that the hooks or the delete remove, and attach a non-nil value it
  returns as [[register-capture!]] attaches one."
  [consumer-key :- :keyword
   capture      :- ifn?]
  (swap! statement-capturers assoc consumer-key capture)
  nil)

(defn- run-statement-captures
  "The values that the statement captures give for a DELETE of `model`, whose primary key is `pk`, with `select-rows`,
  by consumer key."
  [model pk select-rows]
  (let [select (fn [columns]
                 (select-rows (vec (distinct (cons pk columns)))))]
    (into {}
          (keep (fn [[consumer-key capture]]
                  (when-some [value (capture model select)]
                    [consumer-key value])))
          @statement-capturers)))

(mu/defn do-with-delete-statement
  "Run `thunk`, a DELETE statement of `model`, whose primary key is `pk`, as one statement of the batch, so that its
  captures go with the deletes it collects: the statement captures run first, with `select-rows`, a function of columns
  selecting them from the rows the statement matches, before the before-delete hooks of the model."
  [model       :- :keyword
   pk          :- :keyword
   select-rows :- ifn?
   thunk       :- ifn?]
  (if-let [state (and (lifecycle-topic model :delete) (batch-state))]
    (let [[_ new] (swap-batch! state #(-> %
                                          (update :statements conj (:next-statement %))
                                          (update :next-statement inc)))
          statement (open-statement (::batch new))]
      (try
        (when-let [captured (not-empty (run-statement-captures model pk select-rows))]
          (swap-batch! state update-in [:captures statement] merge captured))
        (thunk)
        (finally
          (swap-batch! state update :statements #(filterv (fn [s] (not= statement s)) %)))))
    (thunk)))

(defn- ensure-topic!
  [topic]
  (when-not (events.hierarchy/isa? topic :metabase/event)
    (locking owned-consumers
      (when-not (events.hierarchy/isa? topic :metabase/event)
        (events.hierarchy/derive! topic :metabase/event))))
  (events.schema/register-lifecycle-topic! topic))

(defn- merge-events
  "The one event that the `events` of one row amount to, a deletion whenever the batch deleted the row, or nil when the
  batch both created and deleted it."
  [events]
  (let [create (first (filter #(= :create (:operation %)) events))
        delete (peek (filterv #(= :delete (:operation %)) events))
        fst    (first events)
        lst    (peek events)
        shared {:user-id  (some :user-id (rseq events))
                :context  (apply merge (map :context events))
                :captures (apply merge (map :captures events))}
        object (if create
                 (:object (or (peek (filterv #(= :update (:operation %)) events)) create))
                 (:object (peek (filterv :object events))))]
    (cond
      (and create delete)
      nil

      create
      (merge create shared {:object object})

      delete
      (merge (dissoc delete :object) shared {:previous-object (:previous-object fst)})

      :else
      (merge lst shared {:operation       :update
                         :object          object
                         :previous-object (:previous-object fst)}))))

(defn- compact
  "One event per row, in the order of the first write of the row."
  [events]
  (let [order   (distinct (map (juxt :model :id) events))
        by-row  (group-by (juxt :model :id) events)]
    (into [] (keep #(some-> (merge-events (vec (get by-row %))) (dissoc :statement))) order)))

(defn- payload
  [{:keys [object previous-object user-id context]}]
  (cond-> {:user-id user-id}
    object          (assoc :object object)
    previous-object (assoc :previous-object previous-object)
    (seq context)   (assoc :context context)))

(defn- statement-rows
  "The `[model id]`s of the rows that each DELETE statement deleted, by statement, from the collected `events`."
  [events]
  (reduce (fn [rows {:keys [statement model id]}]
            (cond-> rows
              statement (update statement (fnil conj []) [model id])))
          {}
          events))

(defn- attach-captures
  "The compacted `events` with `captures`, `{statement {consumer-key value}}`, attached to a delivered delete of a row
  that the statement deleted, by `rows`, `{statement [[model id] ...]}`; a statement none of whose deletes is
  delivered, for each of its rows came and went in the batch, has its captures dropped."
  [events captures rows]
  (let [carriers (into {}
                       (keep-indexed (fn [i {:keys [operation model id]}]
                                       (when (= :delete operation) [[model id] i])))
                       events)]
    (reduce-kv (fn [events statement captured]
                 (if-let [i (some carriers (get rows statement))]
                   (update-in events [i :captures] merge captured)
                   events))
               events
               captures)))

(defn- deliver!
  [events captures]
  (let [events (attach-captures (compact events) captures (statement-rows events))]
    (doseq [event events]
      (@publisher (lifecycle-topic (:model event) (:operation event)) (payload event)))
    (doseq [{:keys [owner handle]} (sort-by :last? (vals @owned-consumers))
            :let [by-owner (group-by owner events)]
            [owner-key owned] by-owner
            :when (some? owner-key)]
      (handle owner-key owned events))))

(def ^:private max-deliveries
  "The most rounds of delivery a batch runs, each delivering the events that the round before made consumers collect."
  100)

(defn- finish!
  "Deliver what the batch in `state` collected, and what the delivery makes it collect, then flush its sinks, until
  nothing is left, throwing when consumers keep collecting events past [[max-deliveries]] rounds."
  [state]
  (loop [round 0]
    (when (= round max-deliveries)
      (throw (ex-info (format "The consumers of a batch of events kept writing rows with events for %d deliveries"
                              max-deliveries)
                      {:topics (into #{}
                                     (map #(lifecycle-topic (:model %) (:operation %)))
                                     (get-in @state [::batch :events]))})))
    (let [[old _] (swap-batch! state assoc :events [] :captures {})
          batch   (::batch old)]
      (if (seq (:events batch))
        (do (deliver! (:events batch) (:captures batch))
            (recur (inc round)))
        (let [[old _] (swap-batch! state assoc :sinks {})
              by-sink (:sinks (::batch old))]
          (when (seq by-sink)
            (flush-sinks! by-sink)
            (recur (inc round))))))))

(mu/defn collect!
  "Collect the event of a write of a row, or deliver it at once outside a batch, when the spec of its model names a
  topic for its operation."
  [event :- CollectedEvent]
  (when-let [topic (lifecycle-topic (:model event) (:operation event))]
    (let [event   (assoc event :context *context*)
          delete? (= :delete (:operation event))]
      (ensure-topic! topic)
      (if-let [state (batch-state)]
        (swap-batch! state (fn [batch]
                             (let [statement (when delete? (open-statement batch))
                                   event     (cond-> event statement (assoc :statement statement))]
                               (cond-> (update batch :events conj event)
                                 statement (update-in [:pending statement] (fnil conj []) event)))))
        (deliver! [(cond-> event delete? (assoc :captures (capture [event])))] {})))))

(defn- run-batch
  "Run `thunk` in the batch there already is, or else in a new batch that delivers its events when `thunk` returns, in
  the transaction there already is when `join-transaction?` and in a nested one otherwise, a joined `thunk` that throws
  keeping its events, which follow its rows when a savepoint or transaction rolls back."
  [join-transaction? thunk]
  (let [run (fn []
              (let [state (or (mdb/transaction-state)
                              (throw (ex-info "A batch of events needs a transaction of the app DB" {})))]
                (swap! state assoc ::batch empty-batch)
                (try
                  (u/prog1 (thunk)
                    (finish! state))
                  (finally
                    (swap! state dissoc ::batch)))))]
    (cond
      (batch-state)     (thunk)
      join-transaction? (t2.conn/with-transaction [_conn nil {:nested-transaction-rule :ignore}]
                          (run))
      :else             (t2.conn/with-transaction [_conn]
                          (run)))))

(defn do-with-batched-events
  "Run `thunk` with the events of the writes in it delivered once, merged per row, before the transaction commits, and
  not at all when it throws; outside a batch, in a transaction, a savepoint of the one already open; inside a batch,
  joining it, so that its events stay with its rows when it throws, and go with them when a savepoint rolls back."
  [thunk]
  (run-batch false thunk))

(defn do-with-write-batch
  "Run `thunk`, the write of one statement, as [[do-with-batched-events]] does, but in the transaction there already is."
  [thunk]
  (run-batch true thunk))

(defmacro with-batched-events
  "Run `body` as [[do-with-batched-events]] runs a thunk."
  [& body]
  `(do-with-batched-events (fn [] ~@body)))

(defmacro with-event-context
  "Run `body`, with `context`, a map, in the events its writes collect."
  [context & body]
  `(binding [*context* (merge *context* ~context)]
     ~@body))
