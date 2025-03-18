(ns metabase-enterprise.database-routing.common
  (:require
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn- user-attribute
  "Which user attribute should we use for this RouterDB?"
  [db-or-id]
  (t2/select-one-fn :user_attribute :model/DatabaseRouter :database_id (u/the-id db-or-id)))

(defn router-db-or-id->mirror-db-id
  "Given a the current user and a database (or id), returns the ID of the mirror database that the user's query should
  ultimately be routed to. If the database is not a Router Database, returns `nil`. If the database is a Router
  Database but no current user exists, an exception will be thrown."
  [current-user db-or-id]
  (when-let [attr-name (user-attribute db-or-id)]
    (let [database-name (get (:login_attributes @current-user) attr-name)]
      (cond
        (nil? @current-user)
        (throw (ex-info "Anonymous access to a Router Database is prohibited." {}))

        (= database-name "__METABASE_ROUTER__")
        (u/the-id db-or-id)

        (nil? database-name)
        (throw (ex-info "User attribute missing, cannot lookup Mirror Database" {:database-name database-name
                                                                                 :router-database-id (u/the-id db-or-id)}))

        :else
        (or (t2/select-one-pk :model/Database
                              :router_database_id (u/the-id db-or-id)
                              :name database-name)
            (throw (ex-info "No Mirror Database found for user attribute" {:database-name database-name
                                                                           :router-database-id (u/the-id db-or-id)})))))))
