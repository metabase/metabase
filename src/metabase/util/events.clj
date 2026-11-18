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

(def ^:private common-bookkeeping-columns
  "The columns of any model that the product writes to keep count, time of use or position."
  #{:updated_at :view_count :last_used_at :last_viewed_at :cache_invalidated_at :last_query_start
    :collection_position :entity_id})

(def ^:private model-bookkeeping-columns
  "For a model, the columns it adds to [[common-bookkeeping-columns]]: state the product writes on its own, or that has
  a topic of its own."
  {:model/Dashboard #{:position}
   :model/Database  #{:initial_sync_status :dbms_version :timezone}
   :model/Transform #{:last_checkpoint_value :target_table_id :table_dependencies}
   :model/User      #{:last_login :deactivated_at :is_active :password :password_salt :reset_token :reset_triggered :is_qbnewb
                      :settings}})

(defn bookkeeping-columns
  "The columns of `model` whose update alone is not an edit by a user: nothing is recorded for it."
  [model]
  (into common-bookkeeping-columns (model-bookkeeping-columns model)))

(defn bookkeeping-only?
  "Whether the lifecycle `event` is an update that changes only the [[bookkeeping-columns]] of its model."
  [{:keys [object previous-object] :as event}]
  (let [columns (bookkeeping-columns (model-of event))]
    (boolean (and object previous-object (every? columns (changed-keys event))))))

(defn user-edit?
  "Whether the lifecycle `event` is a write whose record should say a user made it: not one that the archive or restore
  of another entity carried to its row (`:archived-with`), nor an update of only [[bookkeeping-columns]]."
  [{:keys [context] :as event}]
  (not (or (some? (:archived-with context))
           (bookkeeping-only? event))))
