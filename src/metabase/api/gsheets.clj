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

;; Milestone 1: FE thoughts

;; Once things are setup, we need to show the user that the Gsheet is setup.
;; We only have the drive link, but we do know what user initiated the setup.
;; So, we could show the actual link to the user who set it up, and a reset link to everyone else.

;; You are setup guy
#_[:a "Your Gsheet is synced"
   {:href "https://drive.google.com/drive/folders/1KFNvWFz5ifat6pJqqNpCQvhO_uCWCJ3h"}]

;; You are not setup guy
#_[:span "Gsheet is set by X"
   [:a "reset it" {:href "restart the flow, with a 'force' param"}]]

(defsetting gsheets
 #_"Information about Google Sheets Integration.

  This value can have 4 states:

  1) nil
  Google Sheets Integration is not enabled.
  This is gated by the [[show-google-sheets-integration]] setting.

  2) {:status :no-auth}
  Google Sheets Integration is enabled, but not authenticated.

  3) {:status :auth-complete}
  Google Sheets Integration is enabled and oauth is authenticated.

  4) {:status :folder-saved
      :folder_url \"https://drive.google.com/drive/abc\"}
  Google Sheets Integration is enabled, authenticated, and a folder has been setup to sync."
  (deferred-tru "Information about Google Sheets Integration")
  :encryption :when-encryption-key-set
  :export? true
  :visibility :internal
  :type :json
  :getter (fn []
            (when
                ;; TEMP: check the setting when we are ready
              ;; (setting/get-value-of-type :boolean :show-google-sheets-integration)
              true
              (or (setting/get-value-of-type :json :gsheets)
                  {:status :no-auth}))))

(defn- check-validate-drive-link-format
  "Checks if the given link is a valid Google Drive link. If not, throws an exception."
  [drive-link]
  (when-not (re-matches #".*drive\.google\.com.*" drive-link)
    (throw (ex-info "Invalid Google Drive link." {:drive-link drive-link})))
  drive-link)

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

(defn- oauth-setup? [gsheets-status]
  ;; When google drive oauth exists, set the gsheets setting to be auth-complete.
  (or
   ;; It's already set it up, no need to ask HM or update the status:
   (contains? #{:auth-complete :folder-saved} gsheets-status)

   ;; Ask HM what the oauth status is:
   (if (hm-oauth-setup?)
     ;; When harbormaster acks that oauth exists,
     ;; set the gsheets status to `auth-complete`:
     (do (gsheets! {:status :auth-complete})
         true)
     false)))

(defn- get-temp-url
  "Makes the request to get a temp OAuth url from harbormaster.
   Also sends the redirection url to HM as well."
  ([] (get-temp-url (public-settings/site-url)))
  ([redirect-url]
   ;; TODO get redirect-url from FE
   (let [[status response] (hm.client/make-request
                            (->config)
                            :post
                            "/api/v2/mb/connections-google-oauth/temp-url"
                            {:redirect_url redirect-url})]
     (if (= status :ok)
       {:temp_url (get-in response [:body :url])}
       (do (log/error "Error getting temp url")
           (throw (ex-info "Error getting temp url." {:response (pr-str response)})))))))

(mu/defn- setup-drive-folder-sync :- [:enum :ok :error]
  "Start the sync w/ drive folder"
  [drive-folder-url]
  (check-validate-drive-link-format drive-folder-url)
  (let [[status _response] (hm.client/make-request
                            (->config)
                            :post
                            "/api/v2/mb/connections"
                            {:type "gdrive" :secret {:resources [drive-folder-url]}})]
    status))

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

(mu/defn- trigger-gdrive-resync :- [:sequential [:enum :ok :error]]
  []
  (if-let [gdrive-conn-ids (get-gdrive-connections*)]
    (into [] (for [gdrive-conn-id gdrive-conn-ids]
               (trigger-resync* gdrive-conn-id)))
    (throw (ex-info "No gdrive connections found." {}))))


;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; FE <-> MB APIs
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(api/defendpoint POST "/oauth"
  "Checks with HM to see what the temporary, ephemeral oauth-signin url is, and returns it in the response."
  [:as {redirect-url :body}]
  {redirect-url :string}
  ;; TEMP: call HM to get the temp-url with the site's url:
  (get-temp-url (or redirect-url (public-settings/site-url)))
  {:oauth_url "http://store.metabase.com/oauth/abc123"})

(api/defendpoint GET "/oauth"
  "Checks to see if oauth is setup or not, delegates to HM only if we haven't set it up before."
  [] {}
  (api/check-superuser)
  (when-not (setting/get-value-of-type :boolean :show-google-sheets-integration)
    (throw (ex-info "Google Sheets integration is not enabled." {})))

  ;; TEMP: we are pretending that oauth exists, remove this and uncomment below when it works:
  true

  #_(oauth-setup? (:status (gsheets))))

(api/defendpoint POST "/folder"
  "Hook up a new google drive folder that will be watched and have its content ETL'd into Metabase."
  [:as {url :body}]
  {url :string}
  (let [status (setup-drive-folder-sync url)]
    (if (= status :ok)
      (u/prog1 {:status :folder-saved :folder_url url}
        (gsheets! <>))
      (throw (ex-info "Unable to setup drive folder sync" {})))))

(api/define-routes)


;; Steps of how this works:
;;
;; 0. FE checks `show-google-sheets-integration`, if true, show the button.
;; 1. User clicks "Connect Google Sheets" button
;; 2. FE calls /api/gsheets/oauth to get oauth signin link
;; 3. MB calls HM to get the temp oauth url
;; 4. MB returns the temp oauth url to the FE
;; 5. FE opens a new tab with the temp oauth url
;; 6. User logs in and gives permission
;; 7. FE polls gsheets (through settings api) until it has auth-complete status
;; 8. User pastes a google drive folder url
;; 9. FE calls /api/gsheets/folder with the folder url (FE could do regex validation here.)
;; 10. MB soft-validates the folder url and forwards it to HM
;; 12. FE polls gsheets until it is `{:status :folder-saved :folder_url "https://drive.google.com/drive/folders/1KFNvWFz5ifat6pJqqNpCQvhO_uCWCJ3h"}`
;; 13. User sees a message that the folder is connected
;; 14. HM calls into MB starts syncing the folder
