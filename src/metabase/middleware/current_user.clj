(ns metabase.middleware.current-user
  "Middleware to make accessing user associated with a request easier."
  (:require [korma.core :refer :all]
            metabase.db
            [metabase.api.common :refer [*current-user-id* *current-user*]]
            [metabase.models.user :refer [User]]))

(defn wrap-current-user
  "Middleware that binds `metabase.api.context`

   :current-user-id int ID or nil of user associated with request
   :current-user    memoized fn that fetches current user (or nil) from DB"
  [handler]
  (fn [request]
    (let [current-user-id 1] ; TODO - Placeholder value
         (binding [*current-user-id* current-user-id
                   *current-user* (if-not current-user-id (constantly nil)
                                          (memoize (fn [] (-> (select User (where {:id current-user-id}))
                                                             first))))]
           (handler request)))))
