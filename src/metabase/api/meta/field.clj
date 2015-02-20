(ns metabase.api.meta.field
  (:require [compojure.core :refer [GET]]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            (metabase.models [hydrate :refer [hydrate]]
                             [field :refer [Field]])))

(defendpoint GET "/:id" [id]
  (->404 (sel :one Field :id id)
         (hydrate [:table :db])))

(define-routes)
