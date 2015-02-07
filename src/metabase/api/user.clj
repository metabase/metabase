(ns metabase.api.user
  (:require [metabase.api.common :refer :all]
            [compojure.core :refer [defroutes GET PUT]]))


(def user-list
  (GET "/" []
       ;; TODO - implementation
       {:status 200
        :body {}}))

(def user-get
  (GET "/:user-id" [user-id]
       ;; TODO - implementation
       {:status 200
        :body {}}))

(def user-current
  (GET "/current" request
       (with-or-404 (*current-user*)
                    {:status 200
                     :body (*current-user*)})))

(def user-update
  (PUT "/:user-id" [user-id :as {body :body}]
       ;; TODO - implementation
       {:status 200
        :body {}}))

(def user-update-password
  (PUT "/:user-id/password" [user-id :as {body :body}]
       ;; TODO - implementation
       {:status 200
        :body {}}))


(defroutes routes
           ;; TODO - this feels bleh.  is it better to put the actual route data here
           ;;        and just have the endpoints be plain functions?
           ;;        best way to automate building this list?
           user-list
           user-current
           user-get
           user-update
           user-update-password)
