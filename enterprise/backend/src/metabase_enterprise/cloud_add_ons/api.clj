(ns metabase-enterprise.cloud-add-ons.api
  "/api/ee/cloud-add-ons endpoints. "
  (:require
   [metabase-enterprise.harbormaster.client :as hm.client]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.premium-features.core :as premium-features]))

(api.macros/defendpoint :post "/:product-type"
  "Purchase an add-on."
  [{:keys [product-type]} :- [:map
                              [:product-type [:enum "metabase-ai"]]]
   _query-params
   {:keys [terms_of_service]} :- [:map
                                  [:terms_of_service :boolean]]]
  (api/check-superuser)
  (cond
    (not terms_of_service)
    {:status 400 :body {:errors {:terms_of_service "Need to accept terms of service."}}}

    (not (premium-features/is-hosted?))
    {:status 400 :body "Can only purchase add-ons for Metabase Cloud instances."}

    (not (premium-features/offer-metabase-ai?))
    {:status 400 :body "Can only purchase add-ons for eligible subscriptions."}

    (not (contains? (set (map :email (:store-users (premium-features/token-status))))
                    (:email @api/*current-user*)))
    {:status 403 :body "Only Metabase Store users can purchase add-ons."}

    :else
    (try
      (hm.client/call :change-add-ons, :upsert-add-ons [{:product-type product-type}])
      (premium-features/clear-cache)
      {:status 200 :body {}}
      (catch Exception e
        (case (-> e ex-data :status)
          404 {:status 404 :body "Could not establish a connection to Metabase Cloud."}
          403 {:status 403 :body "Could not establish a connection to Metabase Cloud."}
          401 {:status 401 :body "Could not establish a connection to Metabase Cloud."}
          400 {:status 400 :body "Could not purchase this add-on."}
          {:status 500 :body "Unexpected error"})))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/cloud-add-ons` routes."
  (api/+check-superuser
   (api.macros/ns-handler *ns* api/+check-superuser +auth)))
