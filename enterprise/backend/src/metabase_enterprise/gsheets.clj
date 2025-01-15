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

(def ^:private gsheets-not-connected {:status "not-connected"})

(defsetting gsheets
  #_"
  Information about Google Sheets Integration.

  This value can have 2 states:

  1) The Google Sheets Folder is not setup.
  {:status \"not-connected\"}


  2)  Google Sheets Integration is enabled, and a folder has been setup to sync.
  {:status \"connected\"
   :email \"service_account@email.com\"
   :folder_url \"https://drive.google.com/drive/abc\"}
  "
  (deferred-tru "Information about Google Sheets Integration")
  :encryption :when-encryption-key-set
  :export? true
  :visibility :public
  :type :json
  :getter (fn [] (or (setting/get-value-of-type :json :gsheets)
                     (u/prog1 gsheets-not-connected
                       (setting/set-value-of-type! :json :gsheets <>)))))

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

(mu/defn- maybe-hm-service-account-email :- [:or [:= false] :string]
  "Checks to see if Google service-account is setup in harbormaster."
  []
  (let [[_status response] (hm.client/make-request (->config) :get "/api/v2/mb/connections-google/service-account")]
    (if-let [sa-email (-> response :body :email)]
      (u/prog1 sa-email
        (let [old-gsheets (gsheets)]
          (gsheets! (assoc old-gsheets :email <>))))
      (throw (ex-info "Error checking service-account status." {:hm/body (:body response)})))))

(defn- maybe-service-account-email [gsheets]
  (or
   (:email gsheets) ;; It's already set-up! no need to ask HM or update the status:
   (when-let [email (maybe-hm-service-account-email)]
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

(mu/defn- get-gdrive-connection :- [:maybe [:map {:description "The Harbormaster Gdrive Connection"}
                                            [:id :string]
                                            [:type [:= "gdrive"]]
                                            [:status [:enum "syncing" "active" "initializing" "error"]]
                                            [:last-sync-at [:maybe :string]] ;; time fixme
                                            [:created-at :string] ;; time fixme
                                            [:updated-at :string]  ;; time fixme
                                            [:hosted-instance-resource-id :int] ;; unclear if `hosted-instance-resource-id` is relevant
                                            [:hosted-instance-id :string]]] ;; unclear if `hosted-instance-id` is relevant
  "Get the harbormaster gdrive type connection. This is used to verify the status of the folder sync.

  We should expect 0 or 1 gdrive accounts at this time."
  []
  (let [[status {:keys [body]
                 :as _response}] (hm.client/make-request (->config) :get "/api/v2/mb/connections")]
    (when (= status :ok)
      (some-> (filter #(= "gdrive" (:type %)) body)
              first))))

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
  {:email (maybe-service-account-email (gsheets))})

(api.macros/defendpoint :post "/folder" :- ::gsheets
  "Hook up a new google drive folder that will be watched and have its content ETL'd into Metabase."
  [{} {} {:keys [url]} :- [:map [:url ms/NonBlankString]]]
  (let [[status _resp] (setup-drive-folder-sync url)]
      (if (= status :ok)
        (u/prog1 {:status "connected" :folder_url url}
          ;; merge instead of overwrite because we need to keep the :email key
          (gsheets! (merge (gsheets) <>)))
        (throw (ex-info (str/join ["Unable to setup drive folder sync.\n"
                                   "Please check that the folder is shared with the proper service account email "
                                   "and sharing permissions."]) {})))))

(api.macros/defendpoint :get "/folder" :- ::gsheets
  "Check the status of a newly created gsheets folder creation. This endpoint gets polled by FE to determine when to
  stop showing the setup widget."
  []
  (if-let [{:keys [status] :as _gdrive-conn} (get-gdrive-connection)]
    (let [keep-polling? (cond
                          ;; Can we use these as a poorman's progress indicator?
                          (= :initializing status) true
                          (= :syncing status)      true
                          (= :active status)       false
                          ;; TODO: an `:error-detail` key may optionally be in the response. if it is, use it:
                          (= :error status)        (throw (ex-info "Error syncing service-account." {})))]
      {:status status :continue_polling keep-polling?})
    {:error "google drive connection not found."}))

(api.macros/defendpoint :delete "/folder"
  "Disconnect the google service account. There is only one (or zero) at the time of writing."
  []
  (if-let [conn-id (get-gdrive-connection)]
    (let [[status _] (hm.client/make-request (->config) :delete (str "/api/v2/mb/connections/" conn-id))]
      (if (= status :ok)
        (u/prog1 gsheets-not-connected (gsheets! <>))
        (throw (ex-info "Unable to disconnect google service account" {}))))
    (u/prog1 gsheets-not-connected
      (gsheets! <>)
      (throw (ex-info "Unable to find google drive connection." {})))))

(api/define-routes)

(comment

  (setting/set-value-of-type! :string :store-api-url "http://localhost:5010")

  ;; Flow for setting up gsheets With

  (hm.client/make-request (->config) :get "/api/v2/mb/connections")

  @(def sa-email (maybe-service-account-email (gsheets)))
  ;; => "service-account@elt-sync.iam.gserviceaccount.com"

  ;; share a folder w/ that email on gdrive
  ;; copy the link, for me it's:
  @(def url "https://drive.google.com/drive/folders/1H2gz8_TUsCNyFpooFeQB8Y7FXRZA_esH?usp=sharing")

  ;; :post "/folder":
  (let [[status _resp] (setup-drive-folder-sync url)]
    (if (= status :ok)
      (u/prog1 {:status "connected" :folder_url url} (gsheets! <>))
      (throw (ex-info (str/join ["Unable to setup drive folder sync.\n"
                                 "Please check that the folder is shared with the proper service account email "
                                 "and sharing permissions."]) {}))))
  ;; now Im connected:
  (gsheets)
  ;; => {:status "connected", :folder_url "https://drive.google.com/drive/folders/1H2gz8_TUsCNyFpooFeQB8Y7FXRZA_esH?usp=sharing"}

  ;; See the gdrive connection:
  (get-gdrive-connection)

  ;; it has a status. once it's active, it's good to go.

  (defn- trigger-resync* [gdrive-conn-id]
    (let [[status _response] (hm.client/make-request
                              (->config)
                              :put
                              (format "/api/v2/mb/connections/%s/sync" gdrive-conn-id))]
      status))

  #_:clj-kondo/ignore
  (defn- trigger-gdrive-resync
    []
    (if-let [gdrive-conn-id (get-gdrive-connection)]
      (trigger-resync* gdrive-conn-id)
      (throw (ex-info "No gdrive connections found." {}))))

  )
