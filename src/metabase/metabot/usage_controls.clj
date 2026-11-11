(ns metabase.metabot.usage-controls
  "The groups each mode of an AI usage controls page (Admin > AI > Usage controls) governs: simple mode sets one policy
  for All Users and All tenant users, group-level mode one per group."
  (:require
   [metabase.permissions.core :as perms]
   [metabase.toucan.core :as t2]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defn simple-mode-group-ids
  "The IDs of the groups an AI usage controls page governs in simple mode and hides in group-level mode: All Users and
  All tenant users."
  []
  [(u/the-id (perms/all-users-group)) (u/the-id (perms/all-external-users-group))])

(defn visible-groups-clause
  "A fragment matching, on `column` (`:group_id` or `:id`), the groups an AI usage controls page shows in the mode
  selected by `advanced?`: Administrators and the simple-mode groups in simple mode, every group but the simple-mode
  groups in group-level mode."
  [column advanced?]
  (let [simple-ids (simple-mode-group-ids)
        shown-ids  (conj simple-ids (u/the-id (perms/admin-group)))]
    (case column
      :group_id (if advanced?
                  (t2/fragment [:not-in :group_id simple-ids])
                  (t2/fragment [:in :group_id shown-ids]))
      :id       (if advanced?
                  (t2/fragment [:not-in :id simple-ids])
                  (t2/fragment [:in :id shown-ids])))))
