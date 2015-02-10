(ns metabase.api.meta-db
  "/api/meta/db endpoints."
  (:require [compojure.core :refer [GET]]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            (metabase.models [database :refer [Database]]
                             [table :refer [Table]])))

(defendpoint GET "/" [org]
  (sel :many Database :organization_id org))

(defendpoint GET "/:id/tables" [id]
  (sel :many Table :db_id id))

(define-routes)
