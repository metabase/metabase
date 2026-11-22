(ns metabase.events.publish
  "The functions that a write function calls to publish the lifecycle events of its rows, inside its own transaction
  and as its last step: [[publish-lifecycle!]] for the events of one user action, [[delete-changes]] for the changes of
  a delete; and those that a consumer calls to hear of them: [[register-action-consumer!]] for one call per action,
  [[register-capture!]] and [[register-statement-capture!]] to read what a delete removes before it does."
  (:require
   [clojure.set :as set]
   [metabase.events.impl :as events.impl]
   [metabase.events.schema :as events.schema]
   [metabase.models.interface :as mi]
   [metabase.util.events :as u.events]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

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
       (events.impl/publish-event! topic (cond-> {:changes changes :user-id user-id}
                                           context (assoc :context context)))))
   nil))

(defn- event
  "The lifecycle event of `changes` by the current user, with `context`."
  [changes context]
  (cond-> {:changes changes :user-id (mi/current-user-id)}
    (seq context) (assoc :context context)))

(mu/defn create-event :- ::events.schema/lifecycle
  "The lifecycle event of the creation of `rows`, the instances an insert returned, by the current user, to publish
  after the insert."
  ([rows :- [:sequential :map]]
   (create-event rows nil))
  ([rows    :- [:sequential :map]
    context :- [:maybe ::events.schema/context]]
   (event (u.events/create-changes rows) context)))

(defn- stamped
  "The row `previous` with `changes` and, when its model is timestamped and a column that counts changes, a new
  `:updated_at`, as the timestamp hook sets it in the update."
  [previous changes]
  (let [model (t2/model previous)]
    (cond-> (merge previous changes)
      (and model
           (isa? model :hook/timestamped?)
           (not (contains? changes :updated_at))
           (some (fn [[k v]] (and (not= v (get previous k))
                                  (not (contains? (mi/non-timestamped-fields previous) k))))
                 changes))
      (assoc :updated_at (java.time.OffsetDateTime/now)))))

(mu/defn update-event :- ::events.schema/lifecycle
  "The lifecycle event of the update of the rows of `stored`, a map from id to the instance the write function read, by
  `rows`, each an `:id` and the columns to set, by the current user, to publish after the update. A row that is not
  stored or changes nothing is left out. `:objects` in `options`, a map from id to the row after the update, gives the
  rows whose columns a hook of the model derives or the database sets; `:context` is the context of the event."
  ([stored :- [:map-of [:or :int :string] :map]
    rows   :- [:sequential [:map [:id [:or :int :string]]]]]
   (update-event stored rows nil))
  ([stored                    :- [:map-of [:or :int :string] :map]
    rows                      :- [:sequential [:map [:id [:or :int :string]]]]
    {:keys [objects context]} :- [:maybe [:map {:closed true}
                                          [:objects {:optional true} [:maybe [:map-of [:or :int :string] :map]]]
                                          [:context {:optional true} [:maybe ::events.schema/context]]]]]
   (event (u.events/update-changes stored
                                   rows
                                   (fn [previous changes]
                                     (or (get objects (:id previous)) (stamped previous changes))))
          context)))

(mu/defn delete-event :- ::events.schema/lifecycle
  "The lifecycle event of the delete of `rows`, instances as the write function read them, by the current user, to
  publish right before the statement that deletes them, so that a consumer can still read what the delete cascades to."
  ([rows :- [:sequential :map]]
   (delete-event rows nil))
  ([rows    :- [:sequential :map]
    context :- [:maybe ::events.schema/context]]
   (event (u.events/delete-changes rows) context)))

(mu/defn touch-event :- ::events.schema/lifecycle
  "The lifecycle event of an update of `rows`, instances of an owner such as a Dashboard, that changed none of their
  columns but changed their parts, such as its dashcards, by the current user, to publish as the last step of the
  write, so that the records of the owner, such as its Revision, are made once."
  ([rows :- [:sequential :map]]
   (touch-event rows nil))
  ([rows    :- [:sequential :map]
    context :- [:maybe ::events.schema/context]]
   (event (mapv (fn [row] {:previous-object row :object row}) rows) context)))

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
