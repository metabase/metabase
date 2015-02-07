(ns metabase.api.org
  (:require [metabase.api.common :refer :all]
            [compojure.core :refer [defroutes GET PUT POST DELETE]]))

(def org-list
  (GET "/" request
       ;; TODO - implementation
       {:status 200
        :body {}}))

(def org-post
  (POST "/" [:as {body :body}]
        ;; TODO - implementation
        {:status 200
         :body {}}))

(def org-get
  (GET "/:org-id" [org-id]
       ;; TODO - implementation
       {:status 200
        :body {}}))

(def org-get-byslug
  (GET "/slug/:org-slug" [org-slug]
       ;; TODO - implementation
       {:status 200
        :body {}}))

(def org-update
  (PUT "/:org-id" [org-id :as {body :body}]
       ;; TODO - implementation
       {:status 200
        :body {}}))

(def org-members-list
  (GET "/:org-id/members" [org-id]
       ;; TODO - implementation
       {:status 200
        :body {}}))

(def org-members-create
  (POST "/:org-id/members" [org-id :as {body :body}]
       ;; TODO - implementation
       {:status 200
        :body {}}))

(def org-members-adduser
  (GET "/:org-id/members/:user-id" [org-id user-id]
       ;; TODO - implementation
       {:status 200
        :body {}}))

(def org-members-updateuser
  (PUT "/:org-id/members/:user-id" [org-id user-id :as {body :body}]
       ;; TODO - implementation
       {:status 200
        :body {}}))

(def org-members-removeuser
  (DELETE "/:org-id/members/:user-id" [org-id user-id]
       ;; TODO - implementation
       {:status 200
        :body {}}))


(defroutes routes
           ;; TODO - this feels bleh.  is it better to put the actual route data here
           ;;        and just have the endpoints be plain functions?
           ;;        best way to automate building this list?
           org-list
           org-post
           org-get
           org-get-byslug
           org-update
           org-members-list
           org-members-create
           org-members-adduser
           org-members-updateuser
           org-members-removeuser)
