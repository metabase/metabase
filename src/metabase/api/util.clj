(ns metabase.api.util
  (:require [compojure.core :refer [defroutes GET POST]]
            [metabase.api.common :refer :all]
            [metabase.logger :as logger]
            [metabase.util.schema :as su]
            [metabase.util.stats :as stats]))

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

(defendpoint GET "/stats"
  "Anonymous usage stats. Endpoint for testing, and eventually exposing this to instance admins to let them see
  what is being phoned home."
  []
  (check-superuser)
  (stats/anonymous-usage-stats))

(define-routes)
