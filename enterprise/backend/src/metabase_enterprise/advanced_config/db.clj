(ns metabase-enterprise.advanced-config.db
  "Application database queries for the advanced-config module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.app-db.core :as mdb]
   [toucan2.core :as t2]))

(defn query-executions-in-month
  "The raw query execution rows started in `month` of `year`, newest first."
  [year month]
  (let [date-part (fn [part-key part-value]
                    (if (= (mdb/db-type) :postgres)
                      [:= [:date_part ^:allow-raw-sql [:inline (name part-key)] :started_at] part-value]
                      [:= [part-key :started_at] part-value]))]
    (t2/select :query_execution
               {:order-by [[:started_at :desc]]
                :where    [:and
                           (date-part :year year)
                           (date-part :month month)]})))

(defn api-key-by-name
  "The ApiKey named `api-key-name`, or nil."
  [api-key-name]
  (t2/select-one :model/ApiKey :name api-key-name))

(defn api-key-prefix-exists?
  "Whether an ApiKey with `prefix` exists."
  [prefix]
  (t2/exists? :model/ApiKey :key_prefix prefix))

(defn insert-api-key!
  "Insert `api-key` and return the new instance."
  [api-key]
  (t2/insert-returning-instance! :model/ApiKey api-key))

(defn user-by-email
  "The User with `email`, or nil."
  [email]
  (t2/select-one :model/User :email email))

(defn user-columns-by-email
  "The `columns` of the User with `email`, or nil."
  [columns email]
  (t2/select-one columns :email email))

(defn insert-user!
  "Insert `user` and return the new instance."
  [user]
  (t2/insert-returning-instance! :model/User user))

(defn update-user!
  "Apply `changes` to the User with `user-id`."
  [user-id changes]
  (t2/update! :model/User user-id changes))

(defn sample-database-exists?
  "Whether the sample Database exists."
  []
  (t2/exists? :model/Database :is_sample true))

(defn database-id-by-engine-and-name
  "The ID of the Database of `engine` named `database-name`, or nil."
  [engine database-name]
  (t2/select-one-pk :model/Database :engine engine :name database-name))

(defn insert-database!
  "Insert `database` and return the new instance."
  [database]
  (first (t2/insert-returning-instances! :model/Database database)))

(defn update-database!
  "Apply `changes` to the Database with `database-id`."
  [database-id changes]
  (t2/update! :model/Database database-id changes))

(defn delete-database!
  "Delete the Database with `database-id`."
  [database-id]
  (t2/delete! :model/Database database-id))
