(ns metabase-enterprise.gsheets
  "/api/gsheets endpoints"
  (:require
   [clojure.string :as str]
   [metabase-enterprise.harbormaster.client :as hm.client]
   [metabase.api.auth :as api.auth]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.models.setting :as setting :refer [defsetting]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(defsetting gsheets
  #_"Information about Google Sheets Integration.

  This value can have 3 states:

  1) {:status \"not-connected\"}
  The Google Sheets Folder is not setup.

  2) {:status \"connected\"
      :email \"service_account@email.com\"
      :folder_url \"https://drive.google.com/drive/abc\"}
  Google Sheets Integration is enabled, and a folder has been setup to sync."
  (deferred-tru "Information about Google Sheets Integration")
  :encryption :when-encryption-key-set
  :export? true
  :visibility :public
  :type :json
  :getter (fn [] (or (setting/get-value-of-type :json :gsheets)
                     (do (setting/set-value-of-type! :json :gsheets {:status "not-connected"})
                         {:status "not-connected"}))))

(mr/def ::gsheets [:map
                   [:status                      [:enum "not-connected" "connected"]]
                   [:email      {:optional true} ms/NonBlankString]
                   [:folder_url {:optional true} ms/NonBlankString]])

(defn- ->config
  "This config is needed to call [[hm.client/make-request]].

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
    {:store-api-url store-api-url
     :api-key api-key}))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; MB <-> HM APIs
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(mu/defn- hm-service-account-setup? :- [:or [:= false] :string]
  "Checks to see if Google service-account is setup in harbormaster."
  []
  (let [[status response] (hm.client/make-request
                           (->config)
                           :get
                           ;; This is the endpoint that harbormaster uses to check if service-account is setup.
                           ;; n.b. try to ignore that it has 'oauth' in there.
                           "/api/v2/mb/connections-google/service-account")]
    (if (= status :ok)
      (:email response)
      false)))

(defn- service-account-email [gsheets]
  (or
   (:email gsheets) ;; It's already set-up! no need to ask HM or update the status:
   (when-let [email (hm-service-account-setup?)]
     ;; When harbormaster says service-account exists, set the gsheets status to `auth-complete`:
     (gsheets! {:status "connected" :email email})
     email)))

(mu/defn- setup-drive-folder-sync :- [:tuple [:enum :ok :error] :map]
  "Start the sync w/ drive folder"
  [drive-folder-url]
  (hm.client/make-request
   (->config)
   :post
   "/api/v2/mb/connections"
   {:type "gdrive"
    :secret {:resources [drive-folder-url]}}))

(mu/defn- get-gdrive-connection :- [:maybe :int]
  "In practice there can be multiple connections here."
  []
  (let [[status {:keys [body]
                 :as _response}] (hm.client/make-request (->config) :get "/api/v2/mb/connections")]
    (when (= status :ok)
      (->> (filter #(= "gdrive" (:type %)) body) first :id))))

(mu/defn- trigger-resync* [gdrive-conn-id] [:enum :ok :error]
  (let [[status _response] (hm.client/make-request
                            (->config)
                            :put
                            (format "/api/v2/mb/connections/%s/sync" gdrive-conn-id))]
    status))

#_{:clj-kondo/ignore [:unused-private-var]}
(mu/defn- trigger-gdrive-resync :- [:sequential [:enum :ok :error]]
  []
  (if-let [gdrive-conn-id (get-gdrive-connection)]
    (trigger-resync* gdrive-conn-id)
    (throw (ex-info "No gdrive connections found." {}))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; FE <-> MB APIs
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(api.macros/defendpoint :get "/service-account" :- [:map [:status [:maybe :string]]]
  "Checks to see if service-account is setup or not, delegates to HM only if we haven't set it from a metabase cluster
  before."
  []
  (api/check-superuser)
  (when-not (api.auth/show-google-sheets-integration)
    (throw (ex-info "Google Sheets integration is not enabled." {})))
  {:email (service-account-email (gsheets))})

(api.macros/defendpoint :post "/folder" :- ::gsheets
  "Hook up a new google drive folder that will be watched and have its content ETL'd into Metabase."
  [{} {} {:keys [url]} :- [:map [:url ms/NonBlankString]]]
  (let [[status _resp] (setup-drive-folder-sync url)]
    (if (= status :ok)
      (u/prog1 {:status "connected" :folder_url url} (gsheets! <>))
      (throw (ex-info (str/join ["Unable to setup drive folder sync.\n"
                                 "Please check that the folder is shared with the proper service account email "
                                 "and sharing permissions."]) {})))))

(api.macros/defendpoint :delete "/folder"
  "Disconnect the google service account"
  []
  (let [conn-id (get-gdrive-connection)
        [status resp] (hm.client/make-request (->config) :delete (str "/api/v2/mb/connections/" conn-id))]
    (if (= status :ok)
      (gsheets! {:status "not-connected"})
      (throw (ex-info "Unable to disconnect google service account" {:hm/resp resp})))))

(api/define-routes)
