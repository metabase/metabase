(ns metabase.api.gsheets
  "/api/gsheets endpoints"
  (:require
   [clj-http.client :as http]
   [clojure.tools.logging :as log]
   [compojure.core :refer [PUT]]
   [metabase.api.common :as api]
   [metabase.models.setting :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.malli :as mu]))

(defsetting gsheets
  (deferred-tru "Information about Google Sheets Integration")
  :encryption :when-encryption-key-set
  :visibility :internal
  :type :json
  :getter (fn []
            (or (setting/get-value-of-type :json :gsheets)
                {:status :no-auth})))

(def Gsheets
  [:multi {:closed true :dispatch :status}
   [:no-auth       :map]
   [:auth-complete :map]
   [:folder-saved  [:map [:folder_name :string]]]])

(defn- check-validate-drive-link-format
  "Checks if the given link is a valid Google Drive link. If not, throws an exception."
  [drive-link]
  (when-not (re-matches #".*drive\.google\.com.*" drive-link)
    (throw (ex-info "Invalid Google Drive link." {:drive-link drive-link})))
  drive-link)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; MB <-> Store API
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(mu/defn post-folder-link [drive-link]
  ;;POST /api/v2/mb/connections [type: gdrive, secret.resources = <drive-link>]
  (let [store-api-url (setting/get-value-of-type :string :store-api-url)
        api-key (setting/get-value-of-type :string :api-key)]
    (if (and store-api-url api-key)
      (let [drive-link (check-validate-drive-link-format drive-link)
            response (http/post
                      (str store-api-url "/api/v2/mb/connections")
                      {:headers {"Authorization" (str "Bearer " api-key)}
                       :body {:type "gdrive"
                              :secret {:resources drive-link}}})]
        ;; TODO can we get the folder_name back here?
        ;; if not, update this to use the link here. (and make it clickable on FE)
        (if (http/success? response)
          (gsheets! {:status :folder-saved :folder_name "My GDrive Folder"})
          (log/error "Failed to link folder.")))
      (log/warn "Missing store-api-url or api-key. Skipping folder link."))))

(mu/defn get-oauth-exist-request :- :boolean
  "Returns true if the OAuth connection for this instance exists on HarborMaster. False otherwise."
  []
  (let [store-api-url (setting/get-value-of-type :string :store-api-url)
        api-key (setting/get-value-of-type :string :api-key)]
    (if (and store-api-url api-key)
      (let [response (http/get
                      (str store-api-url "/api/v2/mb/connections/oauth")
                      {:headers {"Authorization" (str "Bearer " api-key)}})]
        (http/success? response))
      (log/warn "Missing store-api-url or api-key. Skipping OAuth check."))))

(defn get-temp-url []
  (let [store-api-url (setting/get-value-of-type :string :store-api-url)
        api-key (setting/get-value-of-type :string :api-key)]
    (if (and store-api-url api-key)
      (http/get
       (str store-api-url "/api/v2/mb/connections/temp-url")
       {:headers {"Authorization" (str "Bearer " api-key)}})
      (log/warn "Missing store-api-url or api-key. Skipping OAuth check."))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; FE <-> MB API
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(api/defendpoint GET "/oauth"
  []
  {}
  (gsheets! {:status :auth-complete})
  {:oauth_url "http://store.metabase.com/oauth/abc123"})

(api/defendpoint POST "/folder"
  "Create a new folder in Google Sheets"
  [:as {url :body}]
  {url [:string]}
  (gsheets! {:status :folder-saved :folder_name "My GDrive Folder"})
  "ok")

(api/define-routes)
