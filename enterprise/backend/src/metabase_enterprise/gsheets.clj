(ns metabase-enterprise.gsheets
  "/api/gsheets endpoints"
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase-enterprise.harbormaster.client :as hm.client]
   [metabase.api.auth :as api.auth]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.models.setting :as setting :refer [defsetting]]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private gsheets-not-connected {:status "not-connected"})

(defsetting gsheets
  #_"
  Information about Google Sheets Integration.

  This value can have 3 states:

  1) The Google Sheets Folder is not setup.
  {:status \"not-connected\"}

  2) We have uploaded a Folder url to HM, but have not synced it in MB yet.
  {:status \"loading\"
   :folder_url \"https://drive.google.com/drive/abc\"}

  2)  Google Sheets Integration is enabled, and a folder has been setup to sync.
  {:status \"complete\"
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
                   [:status                      [:enum "not-connected" "loading" "complete"]]
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

(mu/defn- maybe-service-account-email :- [:or [:= false] :string]
  "Checks to see if Google service-account is setup in harbormaster."
  []
  (let [[_status {:keys [body] :as response}] (hm.client/make-request (->config) :get "/api/v2/mb/connections-google/service-account")]
    (if-let [email (:email body)]
      email
      (throw (ex-info "Error checking service-account status." {:hm/response response})))))

(mu/defn- setup-drive-folder-sync :- [:tuple [:enum :ok :error] :map]
  "Start the sync w/ drive folder"
  [drive-folder-url]
  (hm.client/make-request (->config)
                          :post
                          "/api/v2/mb/connections"
                          {:type "gdrive" :secret {:resources [drive-folder-url]}}))

(mu/defn- get-gdrive-connection :- [:maybe [:map {:description "The Harbormaster Gdrive Connection"}
                                            [:id :string]
                                            [:type [:= "gdrive"]]
                                            [:status [:enum "syncing" "active" "initializing" "error"]]
                                            [:last-sync-at [:maybe :time/zoned-date-time]]
                                            [:last-sync-started-at [:maybe :time/zoned-date-time]]
                                            [:created-at :time/zoned-date-time]
                                            [:updated-at :time/zoned-date-time]
                                             ;; unclear if `hosted-instance-resource-id` or `hosted-instance-id` are relevant
                                            [:hosted-instance-resource-id :int]
                                            [:hosted-instance-id :string]]]
  "Get the harbormaster gdrive type connection. This is used to verify the status of the folder sync.

  We should expect 0 or 1 gdrive accounts at this time."
  []
  (let [[status {:keys [body]
                 :as _response}] (hm.client/make-request (->config) :get "/api/v2/mb/connections")]
    (when (= status :ok)
      (some-> (filter #(= "gdrive" (:type %)) body)
              first
              (m/update-existing :last-sync-at u.date/parse)
              (m/update-existing :last-sync-started-at u.date/parse)
              (m/update-existing :created-at u.date/parse)
              (m/update-existing :updated-at u.date/parse)))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; FE <-> MB APIs
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(api.macros/defendpoint :get "/service-account" :- [:map [:email [:maybe :string]]]
  "Checks to see if service-account is setup or not, delegates to HM only if we haven't set it from a metabase cluster
  before."
  []
  (api/check-superuser)
  (when-not (api.auth/show-google-sheets-integration)
    (throw (ex-info "Google Sheets integration is not enabled." {})))
  {:email (maybe-service-account-email)})

(api.macros/defendpoint :post "/folder" :- ::gsheets
  "Hook up a new google drive folder that will be watched and have its content ETL'd into Metabase."
  [{} {} {:keys [url]} :- [:map [:url ms/NonBlankString]]]
  (let [[status _resp] (setup-drive-folder-sync url)]
    (if (= status :ok)
      (u/prog1 {:status "loading" :folder_url url} (gsheets! <>))
      (throw (ex-info (str/join ["Unable to setup drive folder sync.\n"
                                 "Please check that the folder is shared with the proper service account email "
                                 "and sharing permissions."]) {})))))

(api.macros/defendpoint :get "/folder" :- ::gsheets
  "Check the status of a newly created gsheets folder creation. This endpoint gets polled by FE to determine when to
  stop showing the setup widget.

  Returns the gsheets shape, with the attached datawarehouse's db id in db_id."
  [] :- [:or  [:map [:error :string]]]
  (let [attached-dwh (t2/select-one :model/Database :is_attached_dwh true)]
    (assert (some? attached-dwh) "No attached dwh found.")
    (def o (if-let [{:keys [status last-sync-at last-sync-started-at]
                     :as _gdrive-conn} #p (get-gdrive-connection)]
             (let [dwh-sync-ended-at (t2/select-one-fn :ended_at :model/TaskHistory
                                                       :db_id (:id (t2/select-one :model/Database :is_attached_dwh true))
                                                       :task "sync"
                                                       :status :success
                                                       {:order-by [[:ended_at :desc]]})]
               (def last-sync-started-at last-sync-started-at)
               (def last-sync-at last-sync-at)
               (def status status)
               (def dwh-sync-ended-at dwh-sync-ended-at)
               (-> (if (and
                        ;; HM says the connection is active
                        #p (= status :active)
                        ;; We have synced the dwh before (so we have ended_at time)
                        #p dwh-sync-ended-at
                        ;; make sure it's not nil:
                        #p last-sync-at
                        ;; We finished a sync of the dwh in metabase after the HM conn was synced.
                        #p (t/after? (t/instant dwh-sync-ended-at)
                                     (t/instant last-sync-at)))
                     (let [new-gsheets (assoc (gsheets) :status "complete")]
                       (gsheets! new-gsheets) new-gsheets)
                     (gsheets))
                   (assoc :db_id (:id attached-dwh))))
             {:error "google drive connection not found."}))
    o))

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
  (require '[metabase.sync.sync-metadata :as sync-metadata])

  (setting/set-value-of-type! :string :store-api-url "http://localhost:5010")

  ;; Flow for setting up gsheets With

  (hm.client/make-request (->config) :get "/api/v2/mb/connections")

  @(def sa-email (maybe-service-account-email))
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


  {:updated-at #t "2025-01-16T21:45:27Z[UTC]",
   :hosted-instance-resource-id 6,
   :last-sync-at nil,
   :error-detail nil,
   :type "gdrive",
   :hosted-instance-id "a6f2352d-c194-4d46-a46c-9ea616e9fc65",
   :last-sync-started-at "2025-01-16T21:45:27Z",
   :status "syncing",
   :id "a20ec80b-bff2-489e-925a-98a70a5ccf46",
   :created-at #t "2025-01-16T21:45:24Z[UTC]"}

  ;; it has a status. once it's active, it's good to go.

  (defn- trigger-resync* [gdrive-conn-id]
    (let [[status _response] (hm.client/make-request
                              (->config)
                              :put
                              (format "/api/v2/mb/connections/%s/sync" gdrive-conn-id))]
      status))

  (trigger-resync* (:id (get-gdrive-connection)))

  (t2/select-one-fn :ended_at :model/TaskHistory
                    :db_id (:id (t2/select-one :model/Database :is_attached_dwh true))
                    :task "sync"
                    :status :success
                    {:order-by [[:ended_at :desc]]})

  ;; trigger the notify call:
  (let [database (t2/select-one :model/Database :is_attached_dwh true)]
    (sync-metadata/sync-db-metadata! database))


  #_:clj-kondo/ignore
  (defn- trigger-gdrive-resync
    []
    (if-let [gdrive-conn-id (:id (get-gdrive-connection))]
      (trigger-resync* gdrive-conn-id)
      (throw (ex-info "No gdrive connections found." {}))))


  (defn reset-all! []
    (let [[_ connections] (hm.client/make-request (->config) :get "/api/v2/mb/connections")]
      (doseq [{:keys [id]} (:body connections)]
        (println "deleting" id)
        (hm.client/make-request (->config)
                                :delete
                                (str "/api/v2/mb/connections/" id)))
      (gsheets! gsheets-not-connected)
      [(:body (second (hm.client/make-request (->config) :get "/api/v2/mb/connections")))
       (gsheets)]))

  )
