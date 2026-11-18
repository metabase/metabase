(ns metabase-enterprise.database-routing.audit
  "What the audit spec of a Database Router needs beyond its columns: the row of its write is recorded under the
  Database that it routes.")

(set! *warn-on-reflection* true)

(defn details
  "The details to store for the Database Router `row` of the write `event`: whether it enables or disables the routing
  of its Database and by which user attribute."
  [row {:keys [operation]}]
  (if (= :delete operation)
    {:db_routing :disabled}
    {:db_routing        :enabled
     :routing_attribute (:user_attribute row)}))

(defn subject
  "The `[model id]` under which the row of the Database Router `event` is recorded: its Database."
  [{:keys [object previous-object]}]
  [:model/Database (:database_id (or object previous-object))])
