(ns metabase.metabot.usage-controls
  "The groups each mode of an AI usage controls page (Admin > AI > Usage controls) governs: simple mode sets one policy
  for All Users and All tenant users, group-level mode one per group."
  (:require
   [metabase.permissions.core :as perms]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defn simple-mode-group-ids
  "The IDs of the groups an AI usage controls page governs in simple mode and hides in group-level mode: All Users and
  All tenant users."
  []
  [(u/the-id (perms/all-users-group)) (u/the-id (perms/all-external-users-group))])

(defn visible-groups-clause
  "A HoneySQL condition matching, on `column`, the groups an AI usage controls page shows in the mode selected by
  `advanced?`: Administrators and the simple-mode groups in simple mode, every group but the simple-mode groups in
  group-level mode."
  [column advanced?]
  (if advanced?
    [:not-in column (simple-mode-group-ids)]
    [:in column (conj (simple-mode-group-ids) (u/the-id (perms/admin-group)))]))
