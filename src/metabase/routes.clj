(ns metabase.routes
  "Route definitions for the HTTP server."
  (:require (compojure [core :refer [context defroutes GET]]
                       [route :as route])
            [metabase.auth :as auth]
            [metabase.sample-pages :as sample-pages]))

(defroutes routes
  (GET "/" [] (auth/default-perms sample-pages/protected))
  (GET "/admin" [] (auth/admin-perms sample-pages/admin))
  (GET "/test.json" [] sample-pages/json-response)
  (context nil [] auth/routes)
  (route/resources "/")
  (route/not-found sample-pages/sample-404))
