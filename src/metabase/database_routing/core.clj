(ns metabase.database-routing.core
  (:require
   [toucan2.core :as t2]
   [metabase.models.user :as user]
   [metabase.util :as u]))

(defn- user-attribute
  "Which user attribute should we use for this RouterDB?"
  [db-or-id]
  (t2/select-one-fn :user_attribute :model/DatabaseRouter :db_id (u/the-id db-or-id)))

(defn primary-db-or-id->router-db-id
  [current-user db-or-id]
  (when-let [attr-name (user-attribute db-or-id)]
    (let [database-name (get (:login_attributes @current-user) attr-name)]
      (if (= database-name "__METABASE_PRIMARY__")
        (u/the-id db-or-id)
        (or (t2/select-one-pk :model/Database
                              :primary_database_id (u/the-id db-or-id)
                              :name database-name)
            (throw (ex-info "No MirrorDB found for user attribute" {:database-name database-name
                                                                    :primary-database-id (u/the-id db-or-id)})))))))
(defn get-mirror-db
  [primary-database mirror-db-id]
  (t2/select-one :model/Database
                 :primary_database_id (u/the-id primary-database)
                 :id mirror-db-id))
