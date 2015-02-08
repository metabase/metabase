(ns metabase.api.session
  (:require [metabase.api.common :refer :all]
            [compojure.core :refer [defroutes GET POST]]))


(def session-login
  (POST "/login" [:as {body :body}]
       ;; TODO - implementation
       {:status 200
        :body {}}))

(def session-logout
  (GET "/logout" []
       ;; TODO - implementation
       {:status 200
        :body {}}))


(defroutes routes
           ;; TODO - this feels bleh.  is it better to put the actual route data here
           ;;        and just have the endpoints be plain functions?
           ;;        best way to automate building this list?
           session-login
           session-logout)
