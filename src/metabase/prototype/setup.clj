(ns metabase.prototype.setup
  "Seeds the prototype dataset and registers it as a Metabase Database at startup."
  (:require
   [clojure.string :as str]
   [metabase.app-db.core :as mdb]
   [metabase.config.core :as config]
   [metabase.prototype.dataset :as dataset]
   [metabase.prototype.db :as prototype.db]
   [metabase.prototype.seed :as seed]
   [metabase.sync.core :as sync]
   [metabase.util.log :as log]
   [ring.util.codec :as codec])
  (:import
   (java.net URI)))

(set! *warn-on-reflection* true)

(defn- query-params [^URI uri]
  (into {}
        (for [pair  (str/split (or (.getRawQuery uri) "") #"&")
              :let  [[k v] (str/split pair #"=" 2)]
              :when (seq k)]
          [k (codec/url-decode (or v ""))])))

(defn- connection-uri-details [connection-uri]
  (let [uri    (URI. (str/replace-first connection-uri #"^jdbc:" ""))
        params (query-params uri)
        ssl    (get params "sslmode")]
    {:host     (.getHost uri)
     :port     (when (pos? (.getPort uri)) (.getPort uri))
     :dbname   (subs (.getPath uri) 1)
     :user     (get params "user")
     :password (get params "password")
     :ssl      (or (= (get params "ssl") "true")
                   (contains? #{"require" "verify-ca" "verify-full"} ssl))}))

(defn- app-db-details
  "Connection details of the Postgres app DB in the form of Postgres Database `details`, limited to the prototype
  schema."
  []
  (let [uri-details (some-> (config/config-str :mb-db-connection-uri) connection-uri-details)]
    (into {:schema-filters-type     "inclusion"
           :schema-filters-patterns dataset/schema-name}
          (remove (comp nil? val))
          {:host     (or (config/config-str :mb-db-host) (:host uri-details) "localhost")
           :port     (or (config/config-int :mb-db-port) (:port uri-details) 5432)
           :dbname   (or (config/config-str :mb-db-dbname) (:dbname uri-details))
           :user     (or (config/config-str :mb-db-user) (:user uri-details))
           :password (or (config/config-str :mb-db-pass) (:password uri-details))
           :ssl      (:ssl uri-details)})))

(defn- apply-semantic-types!
  "Set the semantic types from the dataset definition as user values, so that they are the same everywhere and
  sync does not change them. Sync owns PKs and FKs."
  [database-id]
  (let [ids-by-name (prototype.db/table-ids-by-name database-id dataset/schema-name)]
    (doseq [{table-name :name, :keys [columns]} dataset/tables
            :let  [table-id (get ids-by-name table-name)]
            :when table-id
            :let  [field-ids (prototype.db/field-ids-by-name table-id)]
            [col-name _ semantic-type] columns
            :let  [field-id (get field-ids (name col-name))]
            :when (and field-id (not (#{:type/PK :type/FK} semantic-type)))]
      (prototype.db/set-field-semantic-type! field-id semantic-type))))

(defn- sync-and-apply-metadata!
  [database]
  (log/info "Prototype data: syncing the Database")
  (sync/sync-db-metadata! database)
  ;; Set the semantic types before the analysis, so that category fields get field values.
  (apply-semantic-types! (:id database))
  (sync/sync-database! database)
  (log/info "Prototype data: ready"))

(defn ensure-prototype-data!
  "Seed the prototype dataset when it is missing or out of date, then register and sync the prototype Database.
  Does nothing when the app DB is not Postgres."
  []
  (if-not (= :postgres (mdb/db-type))
    (log/warn "Prototype data: the app DB is not Postgres, so there is no prototype dataset. See PROTOTYPE.md.")
    (let [seeded?  (seed/ensure-seeded!)
          details  (app-db-details)
          existing (prototype.db/prototype-database)]
      (when (and existing (not= (:details existing) details))
        (prototype.db/update-database-details! (:id existing) details))
      (let [database (if existing
                       (prototype.db/prototype-database)
                       (prototype.db/insert-prototype-database! details))]
        (when (or seeded? (not existing) (not= "complete" (:initial_sync_status database)))
          (sync-and-apply-metadata! database))))))
