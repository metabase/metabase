(ns metabase.api.foreignkey
  "/api/foreignkey endpoints."
  (:require [compojure.core :refer [DELETE]]
            [metabase.api.common :refer :all]
            [metabase.db :as db]
            (metabase.models [foreign-key :refer [ForeignKey]])
            [metabase.driver :as driver]))

(defendpoint DELETE "/:id"
  "Delete a `ForeignKey`."
  [id]
  (write-check ForeignKey id)
  (db/cascade-delete ForeignKey :id id)
  {:success true})

(define-routes)
