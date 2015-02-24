(ns metabase.api.meta.dataset
  "/api/meta/dataset endpoints."
  (:require [compojure.core :refer [POST]]
            [metabase.api.common :refer :all]
            [metabase.driver.query-processor :as qp]))

(defendpoint POST "/" [:as {:keys [body]}]
  (qp/process-and-run body))

(define-routes)
