(ns metabase.api.meta-db
  "/api/meta/db endpoints."
  (:require [compojure.core :refer [GET]]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            [metabase.models.database :refer [Database]]))

(defendpoint GET "/" [org]
  (sel :many Database :organization_id org))

(define-routes)
