(ns metabase.api.util
  (:require [compojure.core :refer [defroutes POST]]
            [metabase.api.common :refer :all]))


(defendpoint POST "/password_check"
  "Endpoint that checks if the supplied password meets the currently configured password complexity rules."
  [:as {{:keys [password]} :body}]
  {password   [Required ComplexPassword]}
  ;; checking happens in the
  {:valid true})


(define-routes)
