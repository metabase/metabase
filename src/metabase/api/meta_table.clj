(ns metabase.api.meta-table
  "/api/meta/table endpoints."
  (:require [compojure.core :refer [GET]]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            (metabase.models [hydrate :refer [hydrate]]
                             [table :refer [Table]])))

(defendpoint GET "/:id/query_metadata" [id]
  (or-404-> (sel :one Table :id id)
    (hydrate :database :fields)))

(define-routes)
