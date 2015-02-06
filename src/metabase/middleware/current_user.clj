(ns metabase.middleware.current-user
  "Middleware to make accessing user associated with a request easier."
  (:require [korma.core :refer :all]
            metabase.db
            [metabase.models.user :refer [User]]))

(defn wrap-current-user
  "Middleware that adds to keys to request:

   :current-user-id int ID or nil of user associated with request
   :current-user    memoized fn that fetches current user from DB"
  [handler]
  (fn [request]
    (let [current-user-id 1] ; TODO - Placeholder value
      (handler (assoc request
                      :current-user-id current-user-id
                      :current-user (memoize
                                     (fn [] (-> (select User
                                                       (where {:id current-user-id}))
                                               first))))))))
