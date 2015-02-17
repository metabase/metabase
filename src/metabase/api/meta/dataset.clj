(ns metabase.api.meta.dataset
  "/api/meta/dataset endpoints."
  (:require [compojure.core :refer [POST]]
            [metabase.api.common :refer :all]
            [metabase.query-processor :refer :all]))

(defendpoint POST "/" [:as {:keys [body]}]
  (try
    (process-and-run body)
    (catch Exception e
      (clojure.stacktrace/print-stack-trace ^Exception e)
      {:status 500
       :body {:error (.getMessage ^Exception e)}})))

(define-routes)
