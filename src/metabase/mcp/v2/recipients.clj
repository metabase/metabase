(ns metabase.mcp.v2.recipients
  "The recipient vocabulary shared by the v2 MCP tools that deliver email — `alert_write` and
   `subscription_write`. Both accept the same two shapes from an agent, a Metabase user id or a
   bare email address, and must reject the same inputs; they differ only in how the accepted
   recipient is stored (a notification recipient vs. a pulse channel recipient), which is why the
   validation lives here and the shaping stays in each tool."
  (:require
   [metabase.mcp.v2.common :as common]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn classify
  "Classify one entry of a tool's `recipients` list as `[:user user-id]` or `[:email address]`.
   Throws a teaching error for anything else, including an id no active user has — that one would
   otherwise surface as a foreign key violation at insert time."
  [recipient]
  (cond
    (int? recipient)
    (do
      (when-not (t2/exists? :model/User :id recipient :is_active true)
        (common/throw-teaching-error
         (format "No active user with id %d — pass a user id from the people list, or an email address."
                 recipient)))
      [:user recipient])

    (u/email? recipient)
    [:email recipient]

    :else
    (common/throw-teaching-error
     (format "Recipient %s is neither a user id nor an email address." (pr-str recipient)))))
