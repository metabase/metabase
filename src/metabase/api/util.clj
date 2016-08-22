(ns metabase.api.util
  (:require [compojure.core :refer [defroutes GET POST]]
            [metabase.api.common :refer :all]
            (metabase [logger :as logger]
                      [public-settings :as public-settings]
                      [util :as u])))


(defendpoint POST "/password_check"
  "Endpoint that checks if the supplied password meets the currently configured password complexity rules."
  [:as {{:keys [password]} :body}]
  {password   [Required ComplexPassword]}
  ;; checking happens in the
  {:valid true})

(defendpoint GET "/logs"
  "Logs."
  []
  (check-superuser)
  (logger/get-messages))

(defendpoint GET "/geojson"
  "Return the custom GeoJSON file specified by the user, if any."
  []
  (or (u/ignore-exceptions
        (when-let [url (public-settings/geojson-url)]
          {:status  200
           :headers {"Content-Type" "application/json"}
           :body    (slurp (public-settings/geojson-url))}))
      ;; return a generic 204 "no content" if there's no GeoJSON to return
      {:status 204
       :body   nil}))


(define-routes)
