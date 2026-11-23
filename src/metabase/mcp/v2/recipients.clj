(ns metabase.mcp.v2.recipients
  "The recipient vocabulary shared by the v2 MCP tools that deliver email — `alert_write` and
   `subscription_write`. Both accept the same two shapes from an agent, a Metabase user id or a
   bare email address, and must reject the same inputs; they differ only in how the accepted
   recipient is stored (a notification recipient vs. a pulse channel recipient), which is why the
   validation lives here and the shaping stays in each tool."
  (:require
   [metabase.mcp.db :as mcp.db]
   [metabase.mcp.v2.common :as common]
   [metabase.mcp.v2.message :as message]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defn- classify
  "Classify one entry of a tool's `recipients` list as `[:user user-id]` or `[:email address]`, where
   `active-user-ids` holds the ids of active users among the list's.
   Throws a teaching error for anything else, including an id no active user has — that one would
   otherwise surface as a foreign key violation at insert time."
  [active-user-ids recipient]
  (cond
    (int? recipient)
    (do
      (when-not (contains? active-user-ids recipient)
        (common/throw-teaching-error
         (message/msg ["No active user with id %d — pass a user id from the people list, or an email address."]
                      recipient)))
      [:user recipient])

    (u/email? recipient)
    [:email recipient]

    :else
    (common/throw-teaching-error
     (message/msg ["Recipient %s is neither a user id nor an email address."] recipient))))

(defn classify-all
  "Classify each entry of a tool's `recipients` list as `[:user user-id]` or `[:email address]`, reading the active
   users among its ids once, and throw the teaching error of the first entry in order that is neither."
  [recipients]
  (let [user-ids (filterv int? recipients)]
    (mapv (partial classify (if (seq user-ids) (mcp.db/active-user-ids user-ids) #{})) recipients)))
