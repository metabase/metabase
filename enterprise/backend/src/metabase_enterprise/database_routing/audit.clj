(ns metabase-enterprise.database-routing.audit
  "What the audit spec of a Database Router needs beyond its columns: the row of its write is recorded under the
  Database that it routes.")

(set! *warn-on-reflection* true)

(defn details
  "The details to store for the Database Router `row` of the write `event`: the user attribute that it routes by, none
  for a deletion."
  [row {:keys [operation]}]
  (if (= :delete operation)
    {}
    {:routing_attribute (:user_attribute row)}))

(defn state
  "What the row of the write `event` of a Database Router stores whole: whether the routing of its Database is enabled
  or disabled."
  [_row {:keys [operation]}]
  {:db_routing (if (= :delete operation) :disabled :enabled)})

(defn subject
  "The `[model id]` under which the row of the Database Router `event` is recorded: its Database."
  [{:keys [object previous-object]}]
  [:model/Database (:database_id (or object previous-object))])
