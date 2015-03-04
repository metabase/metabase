(ns metabase.models.database
  (:require [clojure.data.json :as json]
            [clojure.java.jdbc :as jdbc]
            [clojure.tools.logging :as log]
            (korma [core :refer :all]
                   [db :as kdb])
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            [metabase.driver.connection :as conn]
            (metabase.models [hydrate :refer [realize-json]]
                             [org :refer [Org org-can-read org-can-write]])
            [metabase.util :refer :all]))

(defentity Database
  (table :metabase_database))


;; TODO - these implementations should be moved to `metabase.driver`. Since they can be reused by several drivers,
;; should we make a generic `metabase.driver.jdbc` driver?

(def ^:dynamic *jdbc-metadata*
  "JDBC metadata object for a database. This is set by `with-jdbc-metadata`."
  nil)

(defn with-jdbc-metadata
  "Call fn F with the JDBC Metadata for DATABASE.
   This will reuse `*jdbc-metadata*` if it's already set (to avoid opening extra connections).
   Otherwise it will open a new metadata connection and bind `*jdbc-metadata*` so it's available in subsequent calls to `with-jdbc-metadata` within F."
  [{:keys [connection]} f]
  (if *jdbc-metadata* (f *jdbc-metadata*)
      (jdbc/with-db-metadata [md @connection]
        (binding [*jdbc-metadata* md]
          (f *jdbc-metadata*)))))

(defn korma-db
  "Return a Korma database definition for DATABASE."
  [{:keys [connection]}]
  (log/debug "CREATING A NEW DB CONNECTION...")
  (kdb/create-db @connection))

(defn table-names
  "Fetch a list of table names for DATABASE."
  [database]
  (with-jdbc-metadata database
    (fn [md] (->> (-> md
                     (.getTables nil nil nil (into-array String ["TABLE"])) ; ResultSet getTables(String catalog, String schemaPattern, String tableNamePattern, String[] types)
                     jdbc/result-set-seq)
                 (mapv :table_name)))))

(defn- native-query
  "Perform a native (i.e. SQL) query against DATABASE.

    (let [db (sel :one Database :name \"spotguides\")]
      ((:native-query db) \"SELECT COUNT(*) FROM main_guide;\"))"
  [{:keys [korma-db]} sql]
  {:pre [korma-db]}
  (exec-raw @korma-db sql :results))

(defmethod post-select Database [_ {:keys [organization_id] :as db}]
  (-> db
      (realize-json :details) ; TODO wouldn't we want to actually strip this info instead of returning it?
      (assoc* :organization (sel-fn :one Org :id organization_id)
              :can_read (delay (org-can-read organization_id))
              :can_write (delay (org-can-write organization_id))
              :connection-details (delay (conn/connection-details <>))
              :connection (delay (conn/connection <>))
              :korma-db (delay (korma-db <>))
              :native-query (partial native-query <>)
              :table-names (delay (table-names <>)))))

(defmethod pre-insert Database [_ {:keys [details engine] :as database}]
  (assoc database
         :created_at (new-sql-timestamp)
         :updated_at (new-sql-timestamp)
         :details (json/write-str details)
         :engine (name engine)))

(defmethod pre-update Database [_ {:keys [details] :as database}]
  (assoc database
         :updated_at (new-sql-timestamp)
         :details (json/write-str details)))

(defn databases-for-org
  "Selects the ID and NAME for all databases available to the given org-id."
  [org-id]
  (when-let [org (sel :one Org :id org-id)]
    (if (:inherits org)
      ;; inheriting orgs see ALL databases
      (sel :many [Database :id :name] (order :name :ASC))
      ;; otherwise filter by org-id
      (sel :many [Database :id :name] :organization_id org-id (order :name :ASC)))))
