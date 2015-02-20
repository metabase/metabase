(ns metabase.models.database
  (:require [clojure.data.json :as json]
            [clojure.java.jdbc :as jdbc]
            [clojure.set :refer [rename-keys]]
            [clojure.string :as s]
            [korma.core :refer :all]
            [swiss.arrows :refer :all]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            (metabase.models [hydrate :refer [realize-json]]
                             [org :refer [Org org-can-read org-can-write]])
            [metabase.util :refer :all]))

(defentity Database
  (table :metabase_database))

(defn- connection-details
  "Return a map of connection details (in format usable by korma) for DATABASE."
  [database]
  (let [details (-<>> database :details :conn_str             ; get conn str like "password=corvus user=corvus ..."
                      (s/split <> #" ")                       ; split into k=v pairs
                      (map (fn [pair]                          ; convert to {:k v} pairs
                             (let [[k v] (s/split pair #"=")]
                               {(keyword k) v})))
                      (reduce conj {}))                       ; combine into single dict
        {:keys [host dbname port host]} details]
    (-> details
        (assoc :host host                                     ; e.g. "localhost"
               :db-type :postgres                             ; HACK hardcoded to postgres for time being until API has a way to choose DB type !
               :port (Integer/parseInt port))                 ; convert :port to an Integer
        (rename-keys {:dbname :db}))))

(defn- connection
  "Return a korma connection to DATABASE."
  [database]
  (let [{:keys [db-type] :as details} (-> @(:connection-details database)
                                          (assoc :host "localhost"     ; while we are still ghetto and connecting thru the docker DB fake our settings
                                                 :port 15432))
        korma-driver (->> db-type name (str "korma.db/") symbol eval)] ; e.g. korma.db/postgres
    (-> details
        (dissoc :db-type)
        korma-driver)))


(defn with-jdbc-metadata
  "Call fn F with the JDBC Metadata for DATABASE."
  [database f]
  (jdbc/with-db-metadata [md @(:connection database)]
    (f md)))

(defn table-names
  "Fetch a list of table names for DATABASE."
  [database]
  (with-jdbc-metadata database
    (fn [md] (->> (-> md
                     (.getTables nil nil nil (into-array String ["TABLE"])) ; ResultSet getTables(String catalog, String schemaPattern, String tableNamePattern, String[] types)
                     jdbc/result-set-seq)
                 (map :table_name)))))

(defn- native-query
  "Perform a native (i.e. SQL) query against DATABASE.

    (let [db (sel :one Database :name \"spotguides\")]
      ((:native-query db) \"SELECT COUNT(*) FROM main_guide;\"))"
  [database sql]
  (jdbc/query @(:connection database) sql))

(defmethod post-select Database [_ {:keys [organization_id] :as db}]
  (-> db
      (realize-json :details) ; TODO wouldn't we want to actually strip this info instead of returning it?
      (assoc* :organization (sel-fn :one Org :id organization_id)
              :can_read (delay (org-can-read organization_id))
              :can_write (delay (org-can-write organization_id))
              :connection-details (delay (connection-details <>))
              :connection (delay (connection <>))
              :native-query (partial native-query <>)
              :table-names (delay (table-names <>)))))

(defmethod pre-insert Database [_ {:keys [details] :as database}]
  (assoc database
         :created_at (new-sql-date)
         :updated_at (new-sql-date)
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
