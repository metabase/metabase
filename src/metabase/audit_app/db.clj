(ns metabase.audit-app.db
  "Application database queries for the audit app module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [clojure.string :as str]
   [metabase.app-db.core :as mdb]
   [toucan2.core :as t2]))

(defn cards
  "The Cards with `card-ids`."
  [card-ids]
  (t2/select :model/Card :id [:in card-ids]))

(defn audit-log-topic-exists?
  "Whether an AuditLog entry with `topic` exists."
  [topic]
  (t2/exists? :model/AuditLog :topic topic))

(defn collection-with-entity-id
  "The Collection with `entity-id`, or nil."
  [entity-id]
  (t2/select-one :model/Collection :entity_id entity-id))

(defn dashboard-with-entity-id
  "The Dashboard with `entity-id`, or nil."
  [entity-id]
  (t2/select-one :model/Dashboard :entity_id entity-id))

(defn card-name-and-description
  "The name and description of the Card with `card-id`, or nil."
  [card-id]
  (t2/select-one [:model/Card :name :description :card_schema], :id card-id))

(defn table-database-id
  "The Database id of the Table with `table-id`, or nil."
  [table-id]
  (t2/select-one-fn :db_id :model/Table, :id table-id))

(defn insert-audit-log!
  "Insert an AuditLog entry."
  [topic details model-name model-id user-id]
  (t2/insert! :model/AuditLog
              :topic    topic
              :details  details
              :model    model-name
              :model_id model-id
              :user_id  user-id))

(defn delete-oldest-by-id-subquery!
  "Delete up to `batch-size` of the `table` rows whose `time-column` is at or before `cutoff`, lowest ids first."
  [table time-column cutoff batch-size]
  (t2/query-one {:delete-from table
                 :where [:in
                         :id
                         ^:allow-subquery {:select [:id]
                                           :from table
                                           :where [:<= time-column cutoff]
                                           :order-by [[:id :asc]]
                                           :limit batch-size}]}))

(defn delete-oldest-with-limit!
  "Delete up to `batch-size` of the `table` rows whose `time-column` is at or before `cutoff`."
  [table time-column cutoff batch-size]
  (t2/query-one {:delete-from table
                 :where [:<= time-column cutoff]
                 :limit batch-size}))

;;; Audit-read role grants (Postgres only) -- see [[metabase.audit-app.grants]] for what is reconciled and why.

(defn role-exists?
  "Whether a database role named `role` exists. Postgres only."
  [role]
  (boolean (seq (t2/query {:select [[[:inline 1] :one]]
                           :from   [:pg_roles]
                           :where  [:= :rolname role]}))))

(def ^:private views-and-grants-sql
  ;; Read direct grants out of `relacl` rather than `information_schema.role_table_grants`, which shows only grants
  ;; the current user made or holds: a grant an operator made by hand would be invisible there, so every boot would
  ;; re-issue it and report a change that already existed. `aclexplode` also excludes privileges the role merely
  ;; inherits (via PUBLIC or role membership), which is right -- `REVOKE ... FROM <role>` cannot take those away, so
  ;; treating them as revocable would loop forever.
  (str "SELECT c.relname AS view_name,"
       "       EXISTS (SELECT 1 FROM aclexplode(c.relacl) a"
       "               WHERE a.privilege_type = 'SELECT' AND a.grantee = r.oid) AS granted"
       "  FROM pg_class c"
       "  JOIN pg_namespace n ON n.oid = c.relnamespace"
       " CROSS JOIN (SELECT oid FROM pg_roles WHERE rolname = ?) r"
       " WHERE n.nspname = current_schema() AND c.relkind = 'v'"))

(defn views-and-select-grants
  "Every view in the app DB's current schema as a `{:view_name, :granted}` row, where `:granted` is whether `role`
  holds a direct `SELECT` grant on it. Postgres only."
  [role]
  (t2/query [views-and-grants-sql role]))

(defn- select-grant-statement
  "A `GRANT`/`REVOKE SELECT` statement over `views`. Identifiers are quoted for the app DB rather than interpolated
  raw; `views` come from [[metabase.audit-app.purview]] and `role` from the environment, neither of which is
  user-supplied."
  [verb preposition role views]
  (format "%s SELECT ON %s %s %s"
          verb
          (str/join ", " (map mdb/quote-for-application-db (sort views)))
          preposition
          (mdb/quote-for-application-db role)))

(defn grant-select-on-views!
  "Grant `role` `SELECT` on `views`, in one statement. Postgres only."
  [role views]
  (t2/query (select-grant-statement "GRANT" "TO" role views)))

(defn revoke-select-on-views!
  "Revoke `role`'s `SELECT` on `views`, in one statement. Postgres only."
  [role views]
  (t2/query (select-grant-statement "REVOKE" "FROM" role views)))
