(ns metabase.branding.api
  (:require
   [compojure.core :refer [GET]]
   [metabase.api.macros :as api.macros]
   [metabase.branding.config :as branding.config]))

(def ^{:arglists '([request respond raise])} routes
  (api.macros/routes
   (GET "/" []
     "Get branding configuration for the frontend."
     (if-let [branding (branding.config/get-branding-for-frontend)]
       {:status 200
        :body branding}
       {:status 200
        :body {:enabled false
               :brand_name "Metabase"
               :primary_color "#509EE3"}}))))

;; Export for external use
(comment branding.config/keep-me)