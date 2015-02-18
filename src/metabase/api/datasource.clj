(ns metabase.api.datasource
  "/api/datasource endpoints."
  (:require [compojure.core :refer [GET]]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            (metabase.models [hydrate :as h]
                             [datasource :refer [DataSource]]
                             [org :refer [Org]])))

(defendpoint GET "/source" [org]
  (let-404 [{:keys [can_read]} (sel :one Org :id org)]
    (check-403 @can_read))
  (-> (sel :many DataSource :organization_id org)
      (h/hydrate :database)))

(define-routes)
