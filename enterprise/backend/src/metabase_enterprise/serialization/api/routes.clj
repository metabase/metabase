(ns metabase-enterprise.serialization.api.routes
  "/api/ee/serialization/ routes"
  (:require
   [compojure.core :as compojure]
   [metabase-enterprise.serialization.api.serialize
    :as
    ee.api.serialization.serialize]))

;;; all these routes require the `:serialization` premium feature; this is done
;;; in [[metabase-enterprise.api.routes/routes]]
(compojure/defroutes ^{:doc "Routes for serialization endpoints."} routes
  (compojure/context
   "/serialize"
   []
   ee.api.serialization.serialize/routes))
