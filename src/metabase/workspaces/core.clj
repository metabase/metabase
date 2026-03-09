(ns metabase.workspaces.core
  "Workspace utilities that operate on the raw database tables (which exist in all editions).
   These must run regardless of whether the workspaces feature flag is enabled, because workspace
   data can exist from a previous period when it was enabled, and we need to maintain invariants
   on that data so it isn't corrupt when the feature is re-enabled."
  (:require
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(defn target->triple
  "Extracts `[db_id schema name]` from a target map."
  [{:keys [database schema name]}]
  [database schema name])

(defn- parse-target
  "Parses target JSON — raw query bypasses Toucan2 model transforms."
  [target]
  (if (string? target)
    (try (json/decode+kw target)
         (catch Exception _ nil))
    target))

(defn reducible-target-triples
  "Reducible of `[db_id schema name]` triples for workspace transforms targeting any of the given `db-ids`.
   Used by [[metabase.warehouse-schema.models.table/gc-transform-target-tables!]]."
  [db-ids]
  (eduction
   (map (fn [{:keys [target database_id]}]
          (-> (parse-target target)
              (update :database #(or % database_id))
              target->triple)))
   (t2/reducible-query {:select [[:wt.target :target], [:w.database_id :database_id]]
                        :from   [[:workspace_transform :wt]]
                        :join   [[:workspace :w] [:= :wt.workspace_id :w.id]]
                        :where  [:in :w.database_id db-ids]})))
