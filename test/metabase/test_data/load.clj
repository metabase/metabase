(ns metabase.test-data.load
  "Functions for creating a test Database with some mock data."
  (:require [clojure.string :as s]
            (korma [core :refer :all]
                   [db :refer :all])
            [metabase.db :refer :all]
            [metabase.driver.sync :as sync]
            [metabase.test-data.data :as data]
            (metabase.models [database :refer [Database]]
                             [field :refer [Field]]
                             [table :refer [Table]]
                             [org :refer [Org]]
                             [org-perm :refer [OrgPerm]])))

(declare create-and-populate-tables)

(def ^:private db-name "Test Database")
(def ^:private org-name "Test Organization")
(def ^:private test-db-filename "t.db")
(def ^:private test-db-connection-string (format "file:%s;AUTO_SERVER=TRUE" test-db-filename))

;; # PUBLIC INTERFACE

(defn test-org
  "Returns a test `Organization` that the test database will belong to, creating it if needed."
  []
  (or (sel :one Org :name org-name)
      (ins Org
           :name org-name
           :slug "test"
           :inherits true)))

(defn test-db
  "Returns the test `Database`.
   If it does not exist, it creates it, loads relevant data, and calls `sync-tables`."
  []
  {:post [(map? %)]}
  (binding [*log-db-calls* false]
    (or (sel :one Database :name db-name)
        (do (when-not (.exists (clojure.java.io/file (str test-db-filename ".h2.db"))) ; only create + populate the test DB file if needed
              (create-and-populate-tables))
            (println "Creating new metabase Database object...")
            (let [db (ins Database
                          :organization_id (:id (test-org))
                          :name db-name
                          :engine :h2
                          :details {:conn_str test-db-connection-string})]
              (println "Syncing Tables...")
              (sync/sync-tables db)
              (println "Finished. Enjoy your test data <3")
              db)))))


;; ## Debugging/Interactive Development Functions

(defn add-perms-for-test-org
  "Create admin `OrgPerms` for USER for the test `Organization` if they don't yet exist."
  [{:keys [id] :as user}]
  (let [org-id (:id (test-org))]
    (or (exists? OrgPerm :organization_id org-id :user_id id)
        (ins OrgPerm :organization_id org-id :user_id id :admin true))))

(defn drop-test-db
  "Drop the test `Database` and `Fields`/`Tables` associated with it."
  []
  (when-let [{:keys [id]} (sel :one [Database :id] :name db-name)]
    (let [table-ids (->> (sel :many [Table :id] :db_id id)
                         (map :id)
                         set)]
      (delete Field (where {:table_id [in table-ids]}))
      (delete Table (where {:id [in table-ids]}))
      (del Database :id id)
      (recur)))) ; recurse and delete any other DBs named db-name in case we somehow created more than one


;; # INTERNAL IMPLENTATION DETAILS

(def ^:dynamic *test-db*
  "Korma DB entity for the Test Database."
  nil)

(defmacro with-test-db
  "Binds `*test-db*` if not already bound to a Korma DB entity and executes BODY."
  [& body]
  `(if *test-db* (do ~@body)
       (binding [*test-db* (create-db (h2 {:db test-db-connection-string
                                           :naming {:keys s/lower-case
                                                    :fields s/upper-case}}))]
         (println "CREATING H2 TEST DATABASE...")
         ~@body)))

(defn- exec-sql
  "Execute raw SQL STATEMENTS against the test database."
  [& statements]
  (with-test-db
    (mapv (fn [sql]
            {:pre [(string? sql)]}
            (exec-raw *test-db* sql))
          statements)))

(defn- format-fields
  "Convert a sequence of pairs `[field-name-kw field-sql-type]` FIELDS into a string suitable for use in a SQL \"CREATE TABLE\" statement."
  [fields]
  (->> fields
       (map (fn [[field-name field-type]]
              {:pre [(keyword? field-name)
                     (string? field-type)]}
              (let [field-name (-> field-name name s/upper-case)]
                (format "\"%s\" %s" field-name field-type))))
       (interpose ", ")
       (apply str)))

(defn- create-and-populate-table
  "Create a Table named TABLE-NAME and load its data."
  [[table-name {:keys [fields rows]}]]
  {:pre [(keyword? table-name)
         (sequential? fields)
         (sequential? rows)]}
  (with-test-db
    (let [table-name (-> table-name name s/upper-case)
          fields-for-insert (->> fields (map first))]               ; get ordered field names of data e.g. (:name :last_login)
      (println (format "CREATING TABLE \"%s\"..." table-name))
      (exec-sql (format "DROP TABLE IF EXISTS \"%s\";" table-name)
                (format "CREATE TABLE \"%s\" (%s, \"ID\" BIGINT AUTO_INCREMENT, PRIMARY KEY (\"ID\"));" table-name (format-fields fields)))
      (-> (create-entity table-name)
          (database *test-db*)
          (insert (values (map (partial zipmap fields-for-insert) ; data rows look like [name last-login]
                               rows))))                           ; need to convert to {:name name :last_login last-login} for insert
      (println (format "Inserted %d rows." (count rows))))))

(defn- create-and-populate-tables []
  (with-test-db
    (dorun (map create-and-populate-table
                data/test-data))))
