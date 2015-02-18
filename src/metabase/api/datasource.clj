(ns metabase.api.datasource
  "/api/datasource endpoints."
  (:require [compojure.core :refer [GET]]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            (metabase.models [hydrate :as h]
                             [datasource :refer [DataSource]])))

(defendpoint GET "/source" [org]
  (-> (sel :many DataSource :organization_id org)
      (h/hydrate :database)))

(define-routes)
