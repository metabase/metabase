(ns metabase-enterprise.workspaces.request-workspace
  "The workspace that a request names with its `X-Metabase-Workspace-Id` header, as its queries and transforms use it:
   for each of its provisioned Databases, the output schema and the login. Every new warehouse connection of such a
   request reads it, so this process caches it for a few seconds.

   A leaf namespace, so that the WorkspaceDatabase model can drop the cache when a row changes."
  (:require
   [metabase-enterprise.workspaces.db :as ws.db]
   [metabase-enterprise.workspaces.login :as ws.login]
   [metabase.app-db.core :as app-db]
   [metabase.driver :as driver]))

(set! *warn-on-reflection* true)

(defn engine-problem
  "Why a request can't use the Database `db` with a workspace's login because of its engine, or nil. A request's
  connections get the workspace's login from a JDBC connection pool
  ([[metabase.driver.connection.workspaces/maybe-swap-details]]). Nothing checks that the connections of another
  engine do the same."
  [db]
  (when-not (isa? driver/hierarchy (keyword (:engine db)) :sql-jdbc)
    (format (str "Database %s uses engine %s. A request can name a workspace only for engines that connect through a "
                 "JDBC connection pool.")
            (pr-str (:name db)) (name (:engine db)))))

(defn- database-entry
  "What a request in the workspace uses for the Database of the provisioned WorkspaceDatabase `workspace-database`.
  `:problem` says why the Database can't be used with the workspace's login ([[engine-problem]],
  [[ws.login/login-problem]]), or is nil."
  [{:keys [database_id output_namespace] :as workspace-database}]
  {:output-namespace output_namespace
   :details          (ws.login/workspace-login-details workspace-database)
   :problem          (when-let [db (ws.db/database database_id)]
                       (or (engine-problem db) (ws.login/login-problem db)))})

(defn- load-workspace
  "The workspace with `workspace-id` as [[request-workspace]] gives it, read from the app DB."
  [workspace-id]
  (when (ws.db/workspace-exists? workspace-id)
    (let [{provisioned true, others false} (group-by #(= :provisioned (:status %))
                                                     (ws.db/workspace-databases workspace-id))]
      {:mode                       :bound
       :workspace-id               workspace-id
       :databases                  (into {} (map (juxt :database_id database-entry)) provisioned)
       :unprovisioned-database-ids (into #{} (map :database_id) others)})))

;; `{workspace-id {:value <load-workspace> :read-at <nanoTime>}}`.
(defonce ^:private cache (atom {}))

(def ^:private max-age-ns
  "How long a cached workspace is used. Bounds how long this process uses a workspace that another node changed."
  (* 5 1000 1000 1000))

(defn invalidate!
  "Drop this process's cache of every workspace. Call it after a WorkspaceDatabase or a Database changes."
  []
  (reset! cache {}))

(defn request-workspace
  "The workspace with `workspace-id`, or nil when there is none:

   `{:mode :bound, :workspace-id <id>, :databases {<db-id> {:output-namespace <ns>, :details <login>, :problem <msg>}},
     :unprovisioned-database-ids #{<db-id>}}`

  Only the Databases whose WorkspaceDatabase is provisioned are in `:databases`; the others are in
  `:unprovisioned-database-ids`. Cached for a few seconds. Inside an app-DB transaction it reads the app DB and leaves
  the cache alone: the transaction may have written rows that it later rolls back."
  [workspace-id]
  (if (app-db/in-transaction?)
    (load-workspace workspace-id)
    (let [now                     (System/nanoTime)
          {:keys [value read-at]} (get @cache workspace-id)]
      (if (and read-at (< (- now (long read-at)) (long max-age-ns)))
        value
        (let [value (load-workspace workspace-id)]
          ;; A workspace that does not exist is not cached: one created later must be read at once. Entries past the
          ;; maximum age go, so the cache holds only the workspaces that requests named recently.
          (swap! cache (fn [entries]
                         (cond-> (into {}
                                       (filter (fn [[_ {:keys [read-at]}]] (< (- now (long read-at)) (long max-age-ns))))
                                       entries)
                           value       (assoc workspace-id {:value value :read-at now})
                           (nil? value) (dissoc workspace-id))))
          value)))))
