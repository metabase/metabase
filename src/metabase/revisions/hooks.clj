(ns metabase.revisions.hooks
  "Hooks that record a Revision of what a user changes: the write of a row marks the entity it belongs to, and the
  Revision of each marked entity is written once the batch of writes ends, from the entity as it then is, so one
  operation on a Dashboard and its dashcards and tabs is one Revision. Nothing is recorded without a current user."
  (:require
   [metabase.api.common :as api]
   [metabase.revisions.db :as revisions.db]
   [metabase.revisions.models.revision :as revision]
   [metabase.util.log :as log]
   [metabase.util.write-batch :as write-batch]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic *revision-message*
  "The message that the Revisions written by the writes of [[with-revision-message]] get."
  nil)

(defn do-with-revision-message
  "Run `thunk`, with `message` the message of the Revisions its writes cause."
  [message thunk]
  (binding [*revision-message* message]
    (thunk)))

(defmacro with-revision-message
  "Run `body`, with `message` the message of the Revisions its writes cause."
  [message & body]
  `(do-with-revision-message ~message (fn [] ~@body)))

(def ^:private revisioned-models
  "The models whose rows have Revisions."
  #{:model/Card :model/CardTest :model/Dashboard :model/Document :model/Exploration :model/Measure
    :model/Segment :model/Transform :model/TransformTest})

(def ^:private creator-recorded
  "The models whose saved tests record their creator as the author of the creation Revision when no user is bound, and
  whose reversion writes a Revision of its own update."
  #{:model/CardTest :model/TransformTest})

(def ^:private ignored-columns
  "For each model, the columns whose update alone is not a change to record."
  {:model/Card      #{:updated_at :last_used_at :view_count :collection_position :cache_invalidated_at}
   :model/Dashboard #{:updated_at :last_viewed_at :view_count :collection_position :position}})

(defn- dashboard-id
  "The id of the Dashboard that `row` of `model`, a part of one, belongs to."
  [model row]
  (case model
    (:model/DashboardCard :model/DashboardTab) (:dashboard_id row)
    nil))

(defn- push!
  "Write the Revision of the entity `model` `id` as it is when `data` is its mark, if a user is bound."
  [model id {:keys [creation? message creator-id]}]
  (when-let [user-id (or api/*current-user-id* creator-id)]
    (try
      (when-let [object (revisions.db/entity model id)]
        (revision/push-revision! {:entity       model
                                  :id           id
                                  :object       object
                                  :user-id      user-id
                                  :is-creation? (boolean creation?)
                                  :message      message}))
      (catch Throwable e
        (log/warnf "Failed to record a revision of %s %s: %s" model id (ex-message e))))))

(defn- mark!
  "Have the Revision of the entity `model` `id` written once the batch of writes ends, by `creator-id` when no user is
  bound."
  [model id creation? creator-id]
  (when (and id (or (not revision/*reverting?*) (creator-recorded model)))
    (let [message *revision-message*]
      (write-batch/mark! [::revision model id]
                         (fn [data]
                           {:creation?  (or creation? (:creation? data))
                            :message    (or message (:message data))
                            :creator-id (or creator-id (:creator-id data))})
                         (partial push! model id)))))

(defn after-insert
  "Hook for `row` of `model` after it is inserted."
  [model row]
  (cond
    (contains? revisioned-models model) (mark! model (:id row) true (when (creator-recorded model) (:creator_id row)))
    (dashboard-id model row)            (mark! :model/Dashboard (dashboard-id model row) false nil)))

(defn before-update
  "Hook for `row` of `model` before it is updated."
  [model row]
  (let [changes (set (keys (t2/changes row)))]
    (cond
      (contains? revisioned-models model)
      (when-not (every? (get ignored-columns model #{:updated_at}) changes)
        (mark! model (:id row) false nil))

      (dashboard-id model row)
      (mark! :model/Dashboard (dashboard-id model row) false nil))))

(defn before-delete
  "Hook for `row` of `model` before it is deleted."
  [model row]
  (when-let [id (dashboard-id model row)]
    (mark! :model/Dashboard id false nil)))
