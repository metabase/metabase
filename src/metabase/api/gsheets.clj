(ns metabase.api.gsheets
  "/api/gsheets endpoints"
  (:require
   [clojure.string :as str]
   [compojure.core :refer [PUT]]
   [metabase.api.common :as api]
   [metabase.harbormaster.client :as hm.client]
   [metabase.models.setting :as setting :refer [defsetting]]
   [metabase.public-settings :as public-settings]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

;; This is useful for documentation, but not used in the code itself:
;; (def ^:private ^:const Gsheets
;;   "This is the schema for the gsheets setting."
;;   [:multi {:closed true
;;            :dispatch :status}
;;    [:no-auth       :map]
;;    [:auth-complete :map]
;;    [:folder-saved  [:map [:folder_url :string]]]])

(defsetting gsheets
  (deferred-tru "Information about Google Sheets Integration")
  :encryption :when-encryption-key-set
  :export? true
  :visibility :internal
  :type :json
  :getter (fn []
            (or (setting/get-value-of-type :json :gsheets)
                {:status :no-auth})))

(defn- check-validate-drive-link-format
  "Checks if the given link is a valid Google Drive link. If not, throws an exception."
  [drive-link]
  (when-not (re-matches #".*drive\.google\.com.*" drive-link)
    (throw (ex-info "Invalid Google Drive link." {:drive-link drive-link})))
  drive-link)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; MB <-> HM APIs
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn- ->config
  "This config is needed to call hm.client/make-request.

   `->config` either gets the store-api-url and api-key from settings or throws an exception when one or both are
   unset or blank."
  []
  (let [store-api-url (setting/get-value-of-type :string :store-api-url)
        _ (when (str/blank? store-api-url)
            (log/error "Missing store-api-url. Cannot create hm client config.")
            (throw (ex-info "Missing store-api-url." {:store-api-url store-api-url})))
        api-key (setting/get-value-of-type :string :api-key)
        _ (when (str/blank? api-key)
            (log/error "Missing api-key. Cannot create hm client config.")
            (throw (ex-info "Missing api-key." {:api-key api-key})))]
    {:store-api-url store-api-url :api-key api-key}))

(defn- get-temp-url
  "Makes the request to get a temp OAuth url from harbormaster."
  [metabase-fe-url]
  (let [[status response] (hm.client/make-request
                           (->config)
                           :post
                           "/api/v2/mb/connections/temp-url"
                           {:body {:metabase_url metabase-fe-url}})]
    (if (= status :ok)
      (let [temp-url (get-in response [:body :url])]
        (log/infof "Temp Oauth url recieved: %s" temp-url)
        {:status 200
         :oauth_url (get-in response [:body :url])})
      (do
        (log/errorf "Error getting temp url: %s" (pr-str response))
        {:status 503}))))

(mu/defn google-sheet-connection :- [:maybe [:map [:status :keyword]]]
  "Looks for (the first) google spreadsheet connection in the list of harbormaster's connections.

   When found, returns the connection map. Otherwise, returns nil.

   Connection Map:
   {:created-at \"2024-12-16T19:23:20Z\",
    :type \"google_spreadsheet\",
    :status \"active\",
    :hosted-instance-id \"16f67bc4-520a-40f0-af79-5f6b9b8e77c1\",
    :id \"c3972fe8-23cd-4622-aab6-9fd17c552a85\",
    :hosted-instance-resource-id 6,
    :last-sync-at \"2024-12-16T19:24:50Z\",
    :updated-at \"2024-12-16T19:24:50Z\"}"
  []
  (let [[status {:keys [body]
                 :as _response}] (hm.client/make-request (->config) :get "/api/v2/mb/connections")]
    (when (= status :ok)
      (u/seek #(= "google_spreadsheet" (:type %)) body))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; FE <-> MB APIs
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(api/defendpoint GET "/oauth"
  "Checks with HM to see what the temporary, ephemeral oauth-signin url is, and returns it in the response."
  []
  {}
  ;; TODO: call HM with:
  (when false (get-temp-url (public-settings/site-url)))
  ;; When google drive oauth exists, set the gsheets setting to be auth-complete.
  (gsheets! {:status :auth-complete})
  {:oauth_url "http://store.metabase.com/oauth/abc123"})

(api/defendpoint POST "/folder"
  "Hook up a new google drive folder that will be watched and have its content ETL'd into Metabase."
  [:as {url :body}]
  {url :string}
  (check-validate-drive-link-format url)
  (gsheets! {:status :folder-saved :folder_url url})
  {:status :ok})

(api/define-routes)
