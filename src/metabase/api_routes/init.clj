(ns metabase.api-routes.init
  (:require
   [metabase.api-routes.routes :as routes]))

;; Generate initial OpenAPI specification when the api-routes module is loaded
(routes/initialize-openapi-generation!)
