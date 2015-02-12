(ns metabase.middleware.current-user
  "Middleware to make accessing user associated with a request easier."
  (:require [korma.core :refer :all]
            [metabase.db :refer [sel]]
            [metabase.api.common :refer [*current-user* *current-user-id*]]
            [metabase.models.user :refer [User current-user-fields]]))

(defmacro sel-current-user [current-user-id]
  `(sel :one [User ~@current-user-fields]
        :id ~current-user-id))

(defn bind-current-user
  "Middleware that binds `metabase.api.common/*current-user*` and `*current-user-id*`

   *current-user-id* int ID or nil of user associated with request
   *current-user*    delay that returns current user (or nil) from DB"
  [handler]
  (fn [request]
    (let [current-user-id 1] ; TODO - Placeholder value
         (binding [*current-user-id* current-user-id
                   *current-user* (if-not current-user-id (atom nil)
                                          (delay (sel-current-user current-user-id)))]
           (handler request)))))
