(ns metabase.api-routes.core
  (:require
   [metabase.api-routes.events]
   [metabase.api-routes.routes]
   [potemkin :as p]))

(comment metabase.api-routes.routes/keep-me)

(p/import-vars
 [metabase.api-routes.routes
  routes])
