(ns metabase.api.util
  (:require [compojure.core :refer [defroutes GET POST]]
            [metabase.api.common :refer :all]
            [metabase.logger :as logger]
            [metabase.util.schema :as su]))

(defendpoint POST "/password_check"
  "Endpoint that checks if the supplied password meets the currently configured password complexity rules."
  [:as {{:keys [password]} :body}]
  {password su/ComplexPassword} ;; if we pass the su/ComplexPassword test we're g2g
  {:valid true})

(defendpoint GET "/logs"
  "Logs."
  []
  (check-superuser)
  (logger/get-messages))


(define-routes)
