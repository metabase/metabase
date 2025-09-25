(ns metabase-enterprise.cloud-add-ons.api
  "/api/ee/cloud-add-ons endpoints. "
  (:require
   [metabase-enterprise.harbormaster.client :as hm.client]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.config.core :as config]
   [metabase.events.core :as events]
   [metabase.premium-features.core :as premium-features]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.log :as log]))

(def ^:private error-no-connection
  (deferred-tru "Could not establish a connection to Metabase Cloud."))
(def ^:private error-cannot-purchase
  (deferred-tru "Could not purchase this add-on."))
(def ^:private error-unexpected
  (deferred-tru "Unexpected error"))

(defn- version-supports-semantic-search?
  "Check if current Metabase version is >= 56.5"
  []
  (let [major (config/current-major-version)
        minor (config/current-minor-version)]
    (and major minor
         (or (> major 56)
             (and (= major 56) (>= minor 5))))))

(defn- build-addons-for-product
  "Build list of add-ons based on product type and version compatibility."
  [product-type]
  (let [base-addon {:product-type product-type}]
    (if (and (= product-type "metabase-ai")
             (version-supports-semantic-search?))
      [base-addon {:product-type "semantic-search"}]
      [base-addon])))

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
      (let [add-on {:product-type product-type}
            add-ons (build-addons-for-product product-type)]
        (events/publish-event! :event/cloud-add-on-purchase {:details {:add-on add-on}, :user-id api/*current-user-id*})
        (hm.client/call :change-add-ons :upsert-add-ons add-ons))
      (premium-features/clear-cache)
      {:status 200 :body {}}
      (catch Exception e
        (log/warnf e "Error adding purchasing add-on '%s'" product-type)
        (case (-> e ex-data :status)
          404 {:status 404 :body error-no-connection}
          403 {:status 403 :body error-no-connection}
          401 {:status 401 :body error-no-connection}
          400 {:status 400 :body error-cannot-purchase}
          {:status 500 :body error-unexpected})))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/cloud-add-ons` routes."
  (api/+check-superuser
   (api.macros/ns-handler *ns* api/+check-superuser +auth)))
