(ns metabase.permissions.audit
  "What the audit spec of a Permissions Group Membership needs beyond its columns."
  (:require
   [metabase.util.events :as u.events]))

(set! *warn-on-reflection* true)

(defn membership-details
  "The details to store for the Membership `row`: its id when the event deletes it, as no row of its creation has one."
  [row event]
  (when (= :delete (:operation event))
    (select-keys row [:id])))

(defn membership-subject
  "The `[model id]` under which the row of the Membership `event` is recorded, the id of the Membership when it is
  deleted."
  [{:keys [operation previous-object] :as event}]
  [(u.events/model-of event) (when (= :delete operation) (:id previous-object))])
