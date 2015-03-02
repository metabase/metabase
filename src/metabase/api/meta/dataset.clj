(ns metabase.api.meta.dataset
  "/api/meta/dataset endpoints."
  (:require [compojure.core :refer [POST]]
            [metabase.api.common :refer :all]
            [metabase.driver :as driver]))

(defendpoint POST "/" [:as {:keys [body]}]
  (driver/dataset-query body {:executed_by *current-user-id*}))

(define-routes)
