(ns metabase-enterprise.gsheets
  "/api/gsheets endpoints"
  (:require
   [clojure.string :as str]
   [compojure.core :refer [PUT]]
   [metabase.api.auth :as api.auth]
   [metabase.api.common :as api]
   [metabase.harbormaster.client :as hm.client]
   [metabase.models.setting :as setting :refer [defsetting]]
   [metabase.public-settings :as public-settings]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(defsetting gsheets
  #_"Information about Google Sheets Integration.

  This value can have 3 states:

  1) {:status \"no-auth\"}
  Google Sheets Integration is enabled, but not authenticated.

  2) {:status \"auth-complete\"}
  Google Sheets Integration is enabled and oauth is authenticated.

  3) {:status \"folder-saved\"
      :folder_owner 8 ;; <-- user-id of whoever owns the folder
      :folder_url \"https://drive.google.com/drive/abc\"}
  Google Sheets Integration is enabled, authenticated, and a folder has been setup to sync."
  (deferred-tru "Information about Google Sheets Integration")
  :encryption :when-encryption-key-set
  :export? true
  :visibility :public
  :type :json
  :getter (fn [] (or (setting/get-value-of-type :json :gsheets)
                     (do (setting/set-value-of-type! :json :gsheets {:status "no-auth"})
                         {:status "no-auth"}))))

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

(mu/defn- hm-oauth-setup? :- :boolean
  "Checks to see if Google oauth is setup in harbormaster."
  []
  (let [[status _response] (hm.client/make-request
                            (->config)
                            :get
                            "/api/v2/mb/connections-google-oauth")]
    (= status :ok)))

#_{:clj-kondo/ignore [:unused-private-var]}
(defn- oauth-setup? [gsheets-status]
  ;; When google drive oauth exists, set the gsheets setting to be auth-complete.
  (or
   ;; It's already set up! no need to ask HM or update the status:
   (contains? #{"auth-complete" "folder-saved"} gsheets-status)
   (if (hm-oauth-setup?)
     ;; When harbormaster says oauth exists, set the gsheets status to `auth-complete`:
     (do (gsheets! {:status "auth-complete"})
         true)
     false)))

(mu/defn- setup-drive-folder-sync :- [:tuple [:enum :ok :error] :map]
  "Start the sync w/ drive folder"
  [drive-folder-url]
  (hm.client/make-request
   (->config)
   :post
   "/api/v2/mb/connections"
   {:type "gdrive" :secret {:resources [drive-folder-url]}}))

(mu/defn- get-gdrive-connections* :- [:maybe [:set :map]]
  "In practice there can be multiple connections here."
  []
  (let [[status {:keys [body]
                 :as _response}] (hm.client/make-request (->config) :get "/api/v2/mb/connections")]
    (when (= status :ok)
      (->> (filter #(= "gdrive" (:type %)) body)
           (map :id)
           set))))

(mu/defn- trigger-resync* [gdrive-conn-id] [:enum :ok :error]
  (let [[status _response] (hm.client/make-request
                            (->config)
                            :put
                            (format "/api/v2/mb/connections/%s/sync" gdrive-conn-id))]
    status))

#_{:clj-kondo/ignore [:unused-private-var]}
(mu/defn- trigger-gdrive-resync :- [:sequential [:enum :ok :error]]
  []
  (if-let [gdrive-conn-ids (get-gdrive-connections*)]
    (into [] (for [gdrive-conn-id gdrive-conn-ids]
               (trigger-resync* gdrive-conn-id)))
    (throw (ex-info "No gdrive connections found." {}))))

(defn- hm-post-temp-url [redirect-url]
  (let [[status response] (hm.client/make-request
                           (->config)
                           :post
                           "/api/v2/mb/connections-google-oauth/temp-url"
                           {:redirect_url (or redirect-url (public-settings/site-url))})]
    (if (= status :ok)
      {:oauth_url (get-in response [:body :url])}
      (do (log/error "Error getting temp url")
          (throw (ex-info "Error getting temp url." {:response (pr-str response)}))))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; FE <-> MB APIs
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(api/defendpoint POST "/oauth"
  "Checks with HM to see what the temporary, ephemeral oauth-signin url is, and returns it in the response."
  [:as {{redirect-url :redirect_url} :body :as _body}]
  {redirect-url :string}
  (hm-post-temp-url redirect-url))

(api/defendpoint GET "/oauth"
  "Checks to see if oauth is setup or not, delegates to HM only if we haven't set it up before."
  [] {}
  (api/check-superuser)
  (when-not (api.auth/show-google-sheets-integration)
    (throw (ex-info "Google Sheets integration is not enabled." {})))
  {:oauth_setup (oauth-setup? (:status (gsheets)))})

(api/defendpoint POST "/folder"
  "Hook up a new google drive folder that will be watched and have its content ETL'd into Metabase."
  [:as {{url :url} :body}]
  {url :string}
  (let [[status _resp] (setup-drive-folder-sync url)]
    (if (= status :ok)
      (u/prog1 {:status :folder-saved
                :folder_owner api/*current-user-id*
                :folder_url url}
        (gsheets! <>))
      (throw (ex-info "Unable to setup drive folder sync" {})))))

(api/define-routes)
