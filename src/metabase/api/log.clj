(ns metabase.api.log
  "`/api/log` endpoints."
  (:require [compojure.core :refer [GET POST DELETE PUT]]
            [metabase.api.common :refer [defendpoint define-routes]]
            [metabase.logger :as logger]))

(defendpoint GET "/"
  "Logs."
  []
  (logger/get-messages))

(define-routes)
