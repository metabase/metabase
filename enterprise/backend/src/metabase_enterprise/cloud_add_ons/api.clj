(ns metabase-enterprise.cloud-add-ons.api
  "/api/ee/cloud-add-ons endpoints. "
  (:require
   [clj-http.client :as http]
   [metabase-enterprise.harbormaster.client :as hm.client]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.events.core :as events]
   [metabase.premium-features.core :as premium-features]
   [metabase.store-api.core :as store-api]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.log :as log]))

(def ^:private requires-terms-of-service?
  #{"metabase-ai" "metabase-ai-tiered"})

(def ^:private error-no-connection
  (deferred-tru "Could not establish a connection to Metabase Cloud."))
(def ^:private error-cannot-purchase
  (deferred-tru "Could not purchase this add-on."))
(def ^:private error-unexpected
  (deferred-tru "Unexpected error"))
(def ^:private error-not-hosted
  (deferred-tru "Can only access Store API for Metabase Cloud instances."))
(def ^:private error-not-eligible
  (deferred-tru "Can only purchase add-ons for eligible subscriptions."))
(def ^:private error-not-store-user
  (deferred-tru "Only Metabase Store users can purchase add-ons."))
(def ^:private error-terms-not-accepted
  (deferred-tru "Need to accept terms of service."))
(def ^:private error-no-quantity
  (deferred-tru "Purchase of add-on requires quantity."))

(def ^:private response-not-hosted
  {:status 400 :body error-not-hosted})
(def ^:private response-not-eligible
  {:status 400 :body error-not-eligible})
(def ^:private response-not-store-user
  {:status 403 :body error-not-store-user})
(def ^:private response-terms-not-accepted
  {:status 400 :body {:errors {:terms_of_service error-terms-not-accepted}}})
(def ^:private response-no-quantity
  {:status 400 :body {:errors {:quantity error-no-quantity}}})
(def ^:private response-success-empty
  {:status 200 :body {}})

(defn- handle-store-api-error
  "Handle exceptions from Store API calls and return appropriate error response."
  [exception & [extra-status-mappings]]
  (let [status-code (-> exception ex-data :status)
        default-mappings {404 error-no-connection
                          403 error-no-connection
                          401 error-no-connection}
        status-mappings (merge default-mappings extra-status-mappings)
        error-body (get status-mappings status-code error-unexpected)]
    {:status (or status-code 500) :body error-body}))

(defn- make-public-store-request!
  "Make a GET request to fetch publicly available info from Metabase Store API endpoints."
  [endpoint]
  (if-let [url (store-api/store-api-url)]
    (:body (http/get (str url "/api/v2" endpoint) {:as :json}))
    (throw (ex-info (tru "Please configure store-api-url") {:status-code 400}))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/plans"
  "Get plans information from the Metabase Store API."
  []
  (api/check-superuser)
  (cond
    (not (premium-features/is-hosted?))
    response-not-hosted

    :else
    (try
      {:status 200 :body (make-public-store-request! "/plan")}
      (catch Exception e
        (log/warn e "Error fetching plans information")
        (handle-store-api-error e)))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/addons"
  "Get addons information from the Metabase Store API."
  []
  (api/check-superuser)
  (cond
    (not (premium-features/is-hosted?))
    response-not-hosted

    :else
    (try
      {:status 200 :body (make-public-store-request! "/addons")}
      (catch Exception e
        (log/warn e "Error fetching addons information")
        (handle-store-api-error e)))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/:product-type"
  "Purchase an add-on."
  [{:keys [product-type]} :- [:map
                              [:product-type [:enum "metabase-ai" "metabase-ai-tiered" "python-execution" "transforms"]]]
   _query-params
   {:keys            [quantity]
    terms-of-service :terms_of_service} :- [:map
                                            [:quantity {:optional true} [:maybe :int]]
                                            [:terms_of_service {:optional true} [:maybe :boolean]]]]
  (api/check-superuser)
  (cond
    (not (premium-features/is-hosted?))
    response-not-hosted

    (and (requires-terms-of-service? product-type)
         (not terms-of-service))
    response-terms-not-accepted

    (and (= product-type "metabase-ai-tiered")
         (not quantity))
    response-no-quantity

    (and (= product-type "python-execution")
         (not (premium-features/enable-python-transforms?)))
    response-not-eligible

    (and (= product-type "transforms")
         (not (premium-features/enable-transforms?)))
    response-not-eligible

    (not (contains? (set (map :email (:store-users (premium-features/token-status))))
                    (:email @api/*current-user*)))
    response-not-store-user

    :else
    (try
      (let [add-on (cond-> {:product-type product-type}
                     quantity (assoc :prepaid-units quantity))]
        (events/publish-event! :event/cloud-add-on-purchase {:details {:add-on add-on}, :user-id api/*current-user-id*})
        (hm.client/call :change-add-ons :upsert-add-ons [add-on]))
      (premium-features/clear-cache!)
      response-success-empty
      (catch Exception e
        (log/warnf e "Error purchasing add-on '%s'" product-type)
        (handle-store-api-error e {400 error-cannot-purchase})))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/cloud-add-ons` routes."
  (api/+check-superuser
   (api.macros/ns-handler *ns* api/+check-superuser +auth)))
