(ns metabase.util.events
  "Pure functions over the map of a lifecycle event, which holds the row after a write as `:object` and the row before
  it as `:previous-object`."
  (:require
   [toucan2.core :as t2]))

(defn model-of
  "The model of the row that the lifecycle `event` is about, nil for a row of no model."
  [{:keys [model object previous-object]}]
  (or model (let [row (or object previous-object)]
              (when (t2/instance? row)
                (t2/model row)))))

(defn changed-keys
  "The columns whose value differs between `:previous-object` and `:object`, a missing row having no value."
  [{:keys [object previous-object]}]
  (into #{}
        (filter #(not= (get object %) (get previous-object %)))
        (into (set (keys object)) (keys previous-object))))

(defn changed?
  "Whether the value of `column` differs between `:previous-object` and `:object`, a missing row having no value."
  [{:keys [object previous-object]} column]
  (not= (get object column) (get previous-object column)))

(defn changed-any?
  "Whether the value of any of `columns` differs between `:previous-object` and `:object`."
  [event columns]
  (boolean (some #(changed? event %) columns)))

(defn touch?
  "Whether the lifecycle `event` is the touch of a row, the update of an owner, such as a Dashboard, that changed none of
  its columns but its parts."
  [{:keys [object previous-object]}]
  (and (some? object) (some? previous-object) (= (into {} object) (into {} previous-object))))

(defn operation
  "The operation of the `change` of a lifecycle event: a create has only `:object`, a delete only `:previous-object`."
  [{:keys [object previous-object]}]
  (cond
    (and object previous-object) :update
    object                       :create
    :else                        :delete))

(defn create-changes
  "The changes of a lifecycle event for the creation of `rows`, the instances an insert returned."
  [rows]
  (mapv (fn [row] {:object row}) rows))

(defn delete-changes
  "The changes of a lifecycle event for the delete of `rows`, instances as the write function read them."
  [rows]
  (mapv (fn [row] {:previous-object row}) rows))

(defn update-changes
  "The changes of a lifecycle event for the update of the rows of `stored`, a map from id to the instance the write
  function read, by `rows`, each an `:id` and the columns to set, where a row that is not stored or changes no column
  has no change and `after`, a function of the stored row and its columns to set, which is `merge` by default, gives
  the row after the update for a model whose hooks derive a column."
  ([stored rows]
   (update-changes stored rows merge))
  ([stored rows after]
   (into []
         (keep (fn [row]
                 (when-let [previous (get stored (:id row))]
                   (let [object (after previous (dissoc row :id))]
                     (when (not= (into {} previous) (into {} object))
                       {:previous-object previous :object object})))))
         rows)))

(defn row-events
  "The changes of the lifecycle `event` of `topic`, each merged with what the event says of all of them, as
  `{:topic :model :operation :id :user-id :context :object :previous-object :changed}`, for a consumer that works row by
  row: `:changed` is the set of columns whose value an update changed."
  [topic {:keys [changes user-id writer context]}]
  (mapv (fn [{:keys [object previous-object] :as change}]
          (let [row       (or object previous-object)
                model     (t2/model row)
                operation (operation change)]
            (cond-> {:topic     topic
                     :model     model
                     :operation operation
                     :id        (get row (first (t2/primary-keys model)))
                     :user-id   user-id
                     :writer    writer
                     :context   context}
              object                (assoc :object object)
              previous-object       (assoc :previous-object previous-object)
              (= :update operation) (assoc :changed (changed-keys change)))))
        changes))
