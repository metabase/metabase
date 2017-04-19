(ns metabase.api.util
  "Random utilty endpoints for things that don't belong anywhere else in particular, e.g. endpoints for certain admin page tasks."
  (:require [compojure.core :refer [defroutes GET POST]]
            [crypto.random :as crypto-random]
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

(defendpoint GET "/random_token"
  "Return a cryptographically secure random 32-byte token, encoded as a hexidecimal string.
   Intended for use when creating a value for `embedding-secret-key`."
  []
  {:token (crypto-random/hex 32)})


(define-routes)
