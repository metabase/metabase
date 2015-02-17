(ns metabase.api.meta.dataset
  "/api/meta/dataset endpoints."
  (:require [compojure.core :refer [POST]]
            [metabase.api.common :refer :all]
            [metabase.query-processor :refer :all]))

(defendpoint POST "/" [:as {:keys [body]}]
  (process-and-run body))

(define-routes)
