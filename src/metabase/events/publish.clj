(ns metabase.events.publish
  "The functions that a write function calls to publish the lifecycle events of its rows by hand, inside its own
  transaction and as its last step: [[publish-lifecycle!]] for the events of one user action, [[delete-changes]] for the
  changes of a delete."
  (:require
   [clojure.set :as set]
   [metabase.events.batch :as events.batch]
   [metabase.events.schema :as events.schema]
   [metabase.models.interface :as mi]
   [metabase.util.events :as u.events]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

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
  "The row event that the `change` of the lifecycle event `topic` is to the consumers."
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

(mu/defn publish-lifecycle!
  "Publish the lifecycle events of one user action, `events`, as `[topic changes]` pairs such as
  `[:event/card-update [{:object card :previous-object old-card}]]`, every change of one model's rows an instance:
  a create has only `:object`, an update both, a delete only `:previous-object`, with its `:captures` from
  [[delete-changes]].

  Call it once per action, as the last step of the write function, in its transaction, after every statement and
  cascade, so that consumers read the database as the action leaves it, and with all the topics of the action in one
  call, so that a consumer that makes one record per owner, such as a Revision of a Dashboard, sees its parts together.
  `:user-id` is the current user and `:context` is empty unless given. A consumer that throws fails the write."
  ([events :- Events]
   (publish-lifecycle! events nil))
  ([events                    :- Events
    {:keys [user-id context]} :- ::options]
   (let [user-id (if (some? user-id) user-id (mi/current-user-id))]
     (when-let [row-events (not-empty (into []
                                            (mapcat (fn [[topic changes]]
                                                      (map #(row-event topic user-id context %) changes)))
                                            events))]
       (events.batch/collect-published! row-events)))
   nil))

(mu/defn delete-changes :- [:sequential ::events.schema/lifecycle.change]
  "The changes of a delete of `rows`, instances of `model` as the write function read them, with what the captures of
  the consumers read from the database for the rows, such as the search documents and change-log rows that the
  database cascade removes, on the first change. Call it once, after the explicit deletes of the rows that depend on
  `rows` and right before the statement that deletes them, so that a row an explicit delete already logged is not read
  again as one the cascade removes."
  [model :- :keyword
   rows  :- [:sequential :map]]
  (let [captures (events.batch/delete-captures model rows)
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
