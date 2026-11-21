(ns metabase.events.publish
  "The functions that a write function calls to publish the lifecycle events of its rows, inside its own transaction
  and as its last step: [[publish-lifecycle!]] for the events of one user action, [[delete-changes]] for the changes of
  a delete; and those that a consumer calls to hear of them: [[register-action-consumer!]] for one call per action,
  [[register-capture!]] and [[register-statement-capture!]] to read what a delete removes before it does."
  (:require
   [clojure.set :as set]
   [metabase.events.hierarchy :as events.hierarchy]
   [metabase.events.impl :as events.impl]
   [metabase.events.schema :as events.schema]
   [metabase.models.interface :as mi]
   [metabase.util.events :as u.events]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(events.hierarchy/derive! :metabase/lifecycle-event :metabase/event)

(defonce ^:private capturers
  (atom {}))

(defonce ^:private statement-capturers
  (atom {}))

(mu/defn register-capture!
  "Have `capture`, a function of the vector of the delete row events of the rows of one model that a write function is
  about to delete, called once per [[delete-changes]], so that it can read the rows that the delete cascades to, a
  non-nil value it returns being attached under `consumer-key` in `:captures` to one of those events."
  [consumer-key :- :keyword
   capture      :- ifn?]
  (swap! capturers assoc consumer-key capture)
  nil)

(mu/defn register-statement-capture!
  "Have `capture`, a function of a model and of `select-rows`, a function of columns selecting them from the rows that a
  write function is about to delete, called once per [[delete-changes]], and attach a non-nil value it returns as
  [[register-capture!]] attaches one."
  [consumer-key :- :keyword
   capture      :- ifn?]
  (swap! statement-capturers assoc consumer-key capture)
  nil)

(defn- delete-captures
  "What the captures read for a delete of `rows`, full rows of `model`, as `{consumer-key value}`."
  [model rows]
  (let [pk     (first (t2/primary-keys model))
        select (fn [columns] (mapv #(select-keys % (distinct (cons pk columns))) rows))
        events (mapv (fn [row] {:model model :operation :delete :previous-object row}) rows)]
    (into {}
          (concat (keep (fn [[consumer-key capture]]
                          (when-some [value (capture model select)]
                            [consumer-key value]))
                        @statement-capturers)
                  (keep (fn [[consumer-key capture]]
                          (when-some [value (capture events)]
                            [consumer-key value]))
                        @capturers)))))

(defn- ensure-topic!
  "Have `topic` be an event topic with the lifecycle schema that derives `:metabase/lifecycle-event`, the topic that a
  consumer of the lifecycle events of every model derives its own from."
  [topic]
  (when-not (events.hierarchy/isa? topic :metabase/lifecycle-event)
    (locking capturers
      (when-not (events.hierarchy/isa? topic :metabase/lifecycle-event)
        (events.hierarchy/derive! topic :metabase/lifecycle-event))))
  (events.schema/register-lifecycle-topic! topic))

(defn- operation-of
  "The operation of a change: a create has only `:object`, a delete only `:previous-object`."
  [{:keys [object previous-object]}]
  (cond
    (and object previous-object) :update
    object                       :create
    :else                        :delete))

(defn- timestamped-changes
  "`changed` and `:updated_at` when the model of the row is timestamped and a column other than those that do not count
  changed, as the timestamp hook sets it in the update."
  [model row changed]
  (cond-> changed
    (and (isa? model :hook/timestamped?)
         (seq (set/difference changed (mi/non-timestamped-fields row))))
    (conj :updated_at)))

(defn- row-event
  "The row event that the `change` of the lifecycle event `topic` is to a consumer."
  [topic user-id context {:keys [object previous-object captures] :as change}]
  (let [row       (or object previous-object)
        model     (or (t2/model row)
                      (throw (ex-info "The rows of a lifecycle event must be instances of a model" {:topic topic})))
        operation (operation-of change)
        primary   (first (t2/primary-keys model))]
    (cond-> {:topic     topic
             :model     model
             :operation operation
             :id        (get row primary)
             :user-id   user-id
             :context   context}
      object                  (assoc :object object)
      previous-object         (assoc :previous-object previous-object)
      (= :update operation)   (assoc :changed (or (:changed change)
                                                  (timestamped-changes model
                                                                       row
                                                                       (u.events/changed-keys change))))
      (seq captures)          (assoc :captures captures))))

(def Events
  "The schema of the events of one action: `[topic changes]` pairs, as [[publish-lifecycle!]] takes them."
  [:sequential [:tuple qualified-keyword? [:sequential [:ref ::events.schema/lifecycle.change]]]])

(mr/def ::options
  [:maybe [:map {:closed true}
           [:user-id {:optional true} [:maybe pos-int?]]
           [:context {:optional true} [:maybe ::events.schema/context]]]])

(mu/defn row-events :- [:sequential :map]
  "The changes of the lifecycle `event` of `topic`, each merged with what the event says of all of them, as
  `{:topic :model :operation :id :user-id :context :object :previous-object :changed :captures}`, for a consumer that
  works row by row: `:changed` is the set of columns an update changed."
  [topic                             :- qualified-keyword?
   {:keys [changes user-id context]} :- :map]
  (mapv #(row-event topic user-id context %) changes))

(mu/defn publish-lifecycle!
  "Publish the lifecycle events of one user action, `events`, as `[topic changes]` pairs, one event per topic, by the
  current user unless `:user-id` is given, with `:context`."
  ([events :- Events]
   (publish-lifecycle! events nil))
  ([events                    :- Events
    {:keys [user-id context]} :- ::options]
   (let [user-id (if (some? user-id) user-id (mi/current-user-id))
         context (not-empty context)]
     (doseq [topic (distinct (map first events))
             :let [changes (into [] (comp (filter #(= topic (first %))) (mapcat second)) events)]
             :when (seq changes)]
       (ensure-topic! topic)
       (events.impl/publish-event! topic (cond-> {:changes changes :user-id user-id}
                                           context (assoc :context context)))))
   nil))

(mu/defn delete-changes :- [:sequential ::events.schema/lifecycle.change]
  "The changes of a delete of `rows`, instances of `model` as the write function read them, with what the captures of
  the consumers read from the database for the rows, such as the search documents and change-log rows that the
  database cascade removes, on the first change. Call it once, after the explicit deletes of the rows that depend on
  `rows` and right before the statement that deletes them, so that a row an explicit delete already logged is not read
  again as one the cascade removes."
  [model :- :keyword
   rows  :- [:sequential :map]]
  (let [captures (delete-captures model rows)
        changes  (mapv (fn [row] {:previous-object row}) rows)]
    (cond-> changes
      (seq captures) (assoc-in [0 :captures] captures))))

(mu/defn created :- [:tuple qualified-keyword? [:sequential ::events.schema/lifecycle.change]]
  "The event `topic` of the creation of `rows`, the instances an insert returned, for [[publish-lifecycle!]]."
  [topic :- qualified-keyword?
   rows  :- [:sequential :map]]
  [topic (mapv (fn [row] {:object row}) rows)])

(mu/defn updated-row :- :map
  "The row `previous`, an instance as the function read it, as an update that applied `changes` to it leaves it. A column
  that a hook of the model derives is not in it, and `:updated_at` is the previous one: [[publish-lifecycle!]] marks it
  changed."
  [previous :- :map
   changes  :- :map]
  (t2/instance (t2/model previous) (merge previous changes)))

(mu/defn updated :- [:tuple qualified-keyword? [:sequential ::events.schema/lifecycle.change]]
  "The event `topic` of the update of the rows, `previous-rows` and the `objects` they became, in the same order."
  [topic         :- qualified-keyword?
   previous-rows :- [:sequential :map]
   objects       :- [:sequential :map]]
  [topic (mapv (fn [previous object] {:previous-object previous :object object}) previous-rows objects)])

(mu/defn deleted :- [:tuple qualified-keyword? [:sequential ::events.schema/lifecycle.change]]
  "The event `topic` of the delete of `rows`, instances of `model` as the function read them, with their captures, which
  [[delete-changes]] reads, so that the function calls it before it deletes."
  [topic :- qualified-keyword?
   model :- :keyword
   rows  :- [:sequential :map]]
  [topic (if (seq rows) (delete-changes model rows) [])])
