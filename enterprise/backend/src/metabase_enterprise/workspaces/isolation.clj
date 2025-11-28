(ns metabase-enterprise.workspaces.isolation
  (:require
   ;; TODO: should we go with next.jdbc instead?
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [metabase-enterprise.workspaces.sync :as ws.sync]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.util :as driver.u]
   [metabase.system.core :as system]
   [toucan2.core :as t2]))

;;;; Naming

;; re-using https://github.com/metabase/metabase/pull/61887/commits/c92e4a9cc451c61a13fef19ed9d6107873b17f07
;; (original ws isolation code)
(defn- instance-uuid-slug
  "Create a slug from the site UUID, taking the first character of each section."
  [site-uuid-string]
  (apply str (map first (str/split site-uuid-string #"-"))))

(defn- isolation-schema-name
  "Generate schema/database name for workspace isolation following mb__isolation_<slug>_<workspace-id> pattern."
  [workspace-id]
  (assert (some? workspace-id))
  (let [instance-slug      (instance-uuid-slug (str (system/site-uuid)))
        clean-workspace-id (str/replace (str workspace-id) #"[^a-zA-Z0-9]" "_")]
    (format "mb__isolation_%s_%s" instance-slug clean-workspace-id)))

(defn- isolated-table-name
  "Generate name for a table mirroring transform target table in the isolated database namespace."
  [{:keys [schema name] :as _source-table}]
  ;; the schema that original transform target lives in
  (format "%s__%s" schema name))

(defn- isolation-user-name
  "Generate username for workspace isolation."
  [workspace-id]
  (let [instance-slug (instance-uuid-slug (str (system/site-uuid)))]
    (format "mb_isolation_%s_%s" instance-slug workspace-id)))

;;;; Dispatch for database/driver/... multimethods

;; I'm making this to have a var so var can be passed as dispatch to `duplicate-transform-table!` during
;; development as this is subject to change.
(defn dispatch-on-engine
  "Take engine from database `db` and dispatch on that."
  [database & _args]
  (driver.u/database->driver database))

;;;; Isolation init

(defmulti grant-read-access-to-tables!
  "Grant read access to these tables."
  {:added "0.59.0" :arglists '([database workspace tables])}
  #'dispatch-on-engine
  :hierarchy #'driver/hierarchy)

(defmethod grant-read-access-to-tables! :postgres
  [database workspace tables]
  (let [driver         (driver.u/database->driver database)
        jdbc-spec      (sql-jdbc.conn/connection-details->spec driver (:details database))
        read-user-name (-> workspace :database_details :user)
        sqls           (->> (for [table tables]
                              [(format "GRANT USAGE ON SCHEMA %s TO %s" (:schema table) read-user-name)
                               (format "GRANT SELECT ON TABLE %s.%s TO %s" (:schema table) (:name table) read-user-name)])
                            flatten
                            ;; drop mutliple grant usage on the same schema
                            distinct)]

    (doseq [sql sqls]
      (jdbc/execute! jdbc-spec [sql]))))

(defmulti init-workspace-database-isolation!
  "Create database isolation for a workspace. Return the database details."
  {:added "0.59.0" :arglists '([database workspace])}
  #'dispatch-on-engine
  :hierarchy #'driver/hierarchy)

(defmethod init-workspace-database-isolation! :postgres
  [database workspace]
  (let [driver        (driver.u/database->driver database)
        schema-name   (isolation-schema-name (:id workspace))
        read-user     {:user     (isolation-user-name (:id workspace))
                       :password (str (random-uuid))}
        jdbc-spec     (sql-jdbc.conn/connection-details->spec driver (:details database))]
    (doseq [sql [(format "CREATE SCHEMA %s" schema-name)
                 (format "CREATE USER %s WITH PASSWORD '%s'" (:user read-user) (:password read-user))
                 ;; grant all access on the destination schema
                 (format "GRANT USAGE ON SCHEMA %s TO %s" schema-name (:user read-user))
                 ;; need to be able insert and dropping, rename tables from this chema
                 (format "GRANT ALL PRIVILEGES ON SCHEMA %s TO %s" schema-name (:user read-user))]]
      (jdbc/execute! jdbc-spec [sql]))
    {:schema           schema-name
     :database_details read-user}))

;;;; Transform table duplication

(defmulti duplicate-output-table!
  "Create an isolated copy of the given output tables, for a workspace transform to write to."
  {:added "0.59.0" :arglists '([database transform])}
  #'dispatch-on-engine
  :hierarchy #'driver/hierarchy)

(defmethod duplicate-output-table! :postgres [database workspace output]
  (let [details            (:details database)
        driver*            (driver.u/database->driver database)
        jdbc-spec          (sql-jdbc.conn/connection-details->spec driver* details)
        source-schema      (:schema output)
        source-table       (:name output)
        isolated-schema    (:schema workspace)
        isolated-table     (isolated-table-name output)]
    (assert (every? some? [source-schema source-table isolated-schema isolated-table]) "Figured out table")
    ;; TODO: execute the following only if the transform was previously executed and its table exists.
    (doseq [sql [(format (str "CREATE TABLE \"%s\".\"%s\""
                              "  AS SELECT * FROM \"%s\".\"%s\""
                              "WITH NO DATA")
                         isolated-schema
                         isolated-table
                         source-schema
                         source-table)
                 (format "ALTER TABLE \"%s\".\"%s\" OWNER TO %s" isolated-schema isolated-table (-> workspace :database_details :user))]]
      (jdbc/execute! jdbc-spec [sql]))
    (let [table-metadata (ws.sync/sync-transform-mirror! database isolated-schema isolated-table)]
      (select-keys table-metadata [:id :schema :name]))))

;;;; To be public when things are settled

(defn create-isolated-output-tables!
  "Create new _isolated tables_ to correspond to the outputs of the upstream graph.
   Decorate the graph outputs with the mapping to the new tables."
  [workspace database graph]
  (let [output-ids    (map :id (:outputs graph))
        ;; TODO (Chris 2025-11-20) Avoid querying again here, let's have this data passed down as part of the graph
        table-by-id   (when (seq output-ids)
                        (into {}
                              (map (juxt :id identity))
                              (t2/select [:model/Table :id :name :schema] :id [:in output-ids])))]
    (assoc graph :outputs (vec
                           (for [upstream-output (:outputs graph)
                                 :let [hydrated-output (merge upstream-output
                                                              (get table-by-id (:id upstream-output)))]]
                             (let [isolated-table (duplicate-output-table! database workspace hydrated-output)]
                               (t2/insert! :model/WorkspaceMappingTable
                                           {:upstream_id   (:id upstream-output)
                                            :downstream_id (:id isolated-table)
                                            :workspace_id  (:id workspace)})
                               (assoc hydrated-output :mapping isolated-table)))))))

(defn ensure-database-isolation!
  "Wrapper around the driver method, to make migrations easier in future."
  [workspace database]
  ;; TODO: Make this check the ws existence aka fail closed ~atm
  (let [{:keys [schema database_details]} (init-workspace-database-isolation! database workspace)]
    (t2/update! :model/Workspace (:id workspace) {:schema           schema
                                                  :database_details database_details})
    {:schema           schema
     :database_details database_details}))
