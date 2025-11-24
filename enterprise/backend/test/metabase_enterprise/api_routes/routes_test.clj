(ns metabase-enterprise.api-routes.routes-test
  (:require
   [clojure.test :refer :all]
   [metabase.api-routes.routes-test]))

(deftest ^:parallel check-route-map-test
  (metabase.api-routes.routes-test/check-routes-map
   {:filename                  "enterprise/backend/src/metabase_enterprise/api_routes/routes.clj"
    :map-def-name              'ee-routes-map
    :legacy-snake-cased-routes #{"/permission_debug"}}))
