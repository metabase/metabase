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

;; At this point this ns is responsible for
;; - duplication of entities gathered by `workspaces.artifacts`
;;
;; Aim is to add also functionality for
;; - dwh isolation,
;; - core app isolation (maybe).
;;
;; That said, as it will grow, it may be sliced, or dropped in favor
;; of other namespaces handling the isolation.

;; What this does
;; and how
;; entrypoint

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
  (let [instance-slug (instance-uuid-slug (str (system/site-uuid)))
        clean-workspace-id (str/replace (str workspace-id) #"[^a-zA-Z0-9]" "_")]
    (format "mb__isolation_%s_%s" instance-slug clean-workspace-id)))

(defn- isolated-transform-table-name
  "Generate name for a table mirroring transform target table in the isolated database namespace."
  [transform]
  ;; the schema that originla transform target lives in
  (format "%s__%s" (get-in transform [:target :schema]) (get-in transform [:target :name])))

;;;; Dispatch for database/driver/... multimethods

;; I'm making this to have a var so var can be passed as dispatch to `duplicate-transform-table!` during
;; development as this is subject to change.
(defn dispatch-on-engine
  "Take engine from database `db` and dispatch on that."
  [database & _args]
  (driver.u/database->driver database))

;;;; Isolation init

(defmulti init-workspace-database-isolation!
  "For now create only the new schema"
  {:added "0.59.0" :arglists '([database workspace])}
  #'dispatch-on-engine
  :hierarchy #'driver/hierarchy)

(defmethod init-workspace-database-isolation! :postgres [database workspace]
  (let [driver (driver.u/database->driver database)
        schema-name (isolation-schema-name (:id workspace))
        jdbc-spec (sql-jdbc.conn/connection-details->spec driver (:details database))]
    (jdbc/execute! jdbc-spec [(format "CREATE SCHEMA %s" schema-name)])))

;;;; Transform table duplication

(defmulti duplicate-transform-table!
  "ahoj"
  {:added "0.59.0" :arglists '([database transform])}
  #'dispatch-on-engine
  :hierarchy #'driver/hierarchy)

(defmethod duplicate-transform-table! :postgres [database workspace transform]
  (let [details (:details database)
        driver* (driver.u/database->driver database)
        jdbc-spec (sql-jdbc.conn/connection-details->spec driver* details)
        mirror-schema-name (isolation-schema-name (:id workspace))
        mirror-table-name (isolated-transform-table-name transform)]
    (jdbc/execute! jdbc-spec [(format (str "CREATE TABLE \"%s\".\"%s\""
                                           "  AS SELECT * FROM \"%s\".\"%s\""
                                           "WITH NO DATA")
                                      mirror-schema-name
                                      mirror-table-name
                                      (-> transform :target :schema)
                                      (-> transform :target :name))])
    (let [metabase-table (ws.sync/sync-transform-mirror!
                          database mirror-schema-name mirror-table-name)]
      {:mirror-schema-name mirror-schema-name
       :mirror-table-name mirror-table-name
       :metabase-table metabase-table})))

;;;; To be public when things are settled

(defn create-transform-tables!
  "Create _isolated tables_ for transforms and add note about it into `entities-info`."
  [workspace database entities-info]
  (let [transforms* (mapv
                     (fn [transform]
                       (let [mirror (duplicate-transform-table! database workspace transform)]
                         (assoc transform :mirror mirror)))
                     (:transforms entities-info))]
    (assoc entities-info :transforms transforms*)))

(defn ensure-database-isolation!
  "tbd"
  [workspace database]
  ;; TODO: Make this check the ws existence aka fail closed ~atm
  (init-workspace-database-isolation! database workspace))