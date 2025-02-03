(ns metabase-enterprise.gsheets
  "/api/gsheets endpoints"
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase-enterprise.harbormaster.client :as hm.client]
   [metabase.analytics.snowplow :as snowplow]
   [metabase.api.auth :as api.auth]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.models.setting :as setting :refer [defsetting]]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;; # Google Sheets Integration
;;
;; ## Overview
;; Google Sheets Integration allows users to connect their Google Drive folders to Metabase. We sync any Google Sheets
;; inside of those folders, and make them avaliable to the user in their attached data warehouse. This integration is
;; implemented using Harbormaster, which is a service that manages instances of Metabase and also gives us a connection
;; to Google Sheets data. When a user connects a Google Drive folder to Metabase, Harbormaster creates a connection to
;; the folder and starts syncing the data to Metabase. This data is then available to the user in Metabase as tables.
;;
;; ## Steps to connect a new google drive folde
;;
;; - An admin clicks Add Data > Connect Google Sheets
;; - FE sends :get "api/ee/gsheets/service-account" to get service-account email
;; - FE shows instructions for how to connect a folder:
;;   - user shares their Google Drive folder w/ service-account email
;;   - user copies their Google Drive share link into MB and hits submit
;; - FE sends :post "api/ee/gsheets/folder" w/ folder url string as `request.body.url`
;;   - BE forwards request to :post "/api/v2/mb/connections" w/ body: `{:type "gdrive" :secret {:resources
;;   - ["the-url"]}}`
;;     - on unexceptional status:
;;       - BE sets `gsheets.status` to `"syncing"`
;;       - BE returns the gsheets shape: `{:status "syncing" :folder_url "the-url"}`
;;     - on exceptional status, BE returns a message like: "Unable to setup drive folder sync. Please check that the
;;       folder is shared with the proper service account email and sharing permissions."
;; - FE polls :get "api/ee/gsheets/folder" until `body.status` == `complete`
;;   - BE forwards requests to :get "/api/v2/mb/connections", filtering for the google drive connection
;;     - If the connection doesn't exist: `{:error "google drive connection not found."}`
;;     - If the connection exists and is NOT active, return loading state in the response
;;     - If the connection exists and is active AND the latest sync of the attached datawarehouse is AFTER the sync time
;;           on Harbormaster's gdrive connection, return `body.status` == "complete".
;;   - FE sees status == "complete"
;;
;; ## Steps to disconnect a google drive folder
;; - FE sends request to :delete "/folder"
;;   - MB checks that there _is_ one or more gdrive connections
;;     - gdrive conn not found: `"Unable to find google drive connection."`, + resets gsheets
;;     - gdrive conn exists: MB sends HM `:delete "/api/v2/mb/connections/<conn-id>"`
;;       - on exceptional status: returns error w/ message: `"Unable to disconnect google service account"`
;;         - FE shows error for delete action
;;       - on OK: MB resets gsheets to `{:status "not-connected"}` (and the user can reconnect one from `Step 2.`)
;;         - FE shows a confirmation for the delete + resets gsheets
;;
;; ## Why do we need to sync the attached datawarehouse before considering it ready?
;; - We need to sync the attached datawarehouse to make sure that the data from the Google Drive folder is available to
;;   the user in Metabase. Once the gdrive connection's status is set to 'active' by HM, they will call MB's
;;   `api/notify/db/attached_datawarehouse` endpoint to trigger a sync. The data from the Google Drive folder is already
;;   availiable in the attached datawarehouse, and when MB finishes the sync (and puts an item into :model/TaskHistory
;;   saying so), the user can start using their Google Sheets data in Metabase.
;;
;; ## Why do we check for multiple gdrive connections in the delete endpoint?
;; - We check for multiple gdrive connections in the delete endpoint to make sure that we are deleting all gdrive
;;   connections. As of Milestone 2 there are supposed to be only one gdrive connection, but we saw multiple being
;;   created and want the delete endpoint to basically reset us to a blank slate. If there are multiple gdrive
;;   connections, we will delete all of them.

(set! *warn-on-reflection* true)

(def ^:private not-connected {:status "not-connected"})

(defsetting gsheets
  #_"
  This value can have 3 states:

  1) The Google Sheets Folder is not setup.
  {:status \"not-connected\"}

  2) We have uploaded a Folder URL to HM, but have not synced it in MB yet.
  {:status \"loading\"
   :folder_url \"https://drive.google.com/drive/abc\"
   ;; in seconds from epoch:
   :folder-upload-time 1738266997}

  2)  Google Sheets Integration is enabled, and users can view their google sheets tables.
  {:status \"complete\"
   :folder_url \"https://drive.google.com/drive/abc\"}"
  (deferred-tru "Information about Google Sheets Integration")
  :encryption :when-encryption-key-set
  :export? true
  :visibility :public
  :type :json
  :getter (fn [] (or (setting/get-value-of-type :json :gsheets)
                     (u/prog1 not-connected
                       (setting/set-value-of-type! :json :gsheets <>)))))

(mr/def ::gsheets [:map
                   [:status                      [:enum "not-connected" "loading" "complete"]]
                   [:folder_url {:optional true} ms/NonBlankString]])

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; MB <-> HM APIs
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(mu/defn- hm-service-account-email :- [:or [:= false] :string]
  "Checks to see if Google service-account is setup in harbormaster."
  []
  (let [[_status {:keys [body] :as response}] (hm.client/make-request :get "/api/v2/mb/connections-google/service-account")]
    (if-let [email (:email body)]
      email
      (throw (ex-info (tru "Error checking service-account status.") {:status-code (:status-code response)})))))

(mr/def ::gdrive-conn [:map {:description "The Harbormaster Gdrive Connection"}
                       [:id :string]
                       [:type [:= "gdrive"]]
                       [:status [:enum "initializing" "syncing" "active" "error"]]
                       [:last-sync-at [:maybe :time/zoned-date-time]]
                       [:last-sync-started-at [:maybe :time/zoned-date-time]]
                       [:created-at :time/zoned-date-time]
                       [:updated-at :time/zoned-date-time]])

(defn- is-gdrive?
  "Is this connection a gdrive connection?"
  [{:keys [type] :as _conn}] (= "gdrive" type))

(def ^:private status-order
  "If there is an active connection, we just use it. But if there are no active connections, we want to see the errors
  first."
  {"active" 0 "error" 1 "syncing" 2 "initializing" 3})

(defn normalize-gdrive-conn [gdc]
  (-> gdc
      (dissoc :hosted-instance-resource)
      (m/update-existing :last-sync-at u.date/parse)
      (m/update-existing :last-sync-started-at u.date/parse)
      (m/update-existing :created-at u.date/parse)
      (m/update-existing :updated-at u.date/parse)))

(mu/defn- hm-get-gdrive-conns :- [:sequential ::gdrive-conn]
  "Get the harbormaster gdrive type connection.

  If the response fails, returns an empty list.
  If the response succeeds, returns a list of gdrive connections, sorted by status and created-at."
  []
  (let [[status response] (hm.client/make-request :get "/api/v2/mb/connections")]
    (if (= status :ok)
      (mapv normalize-gdrive-conn
           (filter is-gdrive? (or (some-> response :body) [])))
      [])))

(mu/defn hm-get-gdrive-conn [id]
  (when-not id
    (throw (ex-info "must have an id to lookup by id" {})))
  (hm.client/make-request :get (str "/api/v2/mb/connections/" id)))

(mu/defn- hm-create-gdrive-conn :- [:tuple [:enum :ok :error] :map]
  "Creating a gdrive connection on HM starts the sync w/ drive folder."
  [drive-folder-url]
  (hm.client/make-request :post "/api/v2/mb/connections" {:type "gdrive" :secret {:resources [drive-folder-url]}}))

(mu/defn- hm-delete-conn :- [:tuple [:enum :ok :error] :map]
  "Delete (presumably a gdrive) connection on HM."
  [conn-id]
  (hm.client/make-request :delete (str "/api/v2/mb/connections/" conn-id)))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; FE <-> MB APIs
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn error-response-in-body
  "We've decided to return errors as a map with an `:error` key. This function is a helper to make that map.

  This formats and throws an ex-info that will put the message into the body of the response."
  ([message] (error-response-in-body message {}))
  ([message data]
   (throw (ex-info message (merge data {:errors true
                                        :message message})))))

(api.macros/defendpoint :get "/service-account" :- [:map [:email [:maybe :string]]]
  "Checks to see if service-account is setup or not, delegates to HM only if we haven't set it from a metabase cluster
  before."
  []
  (api/check-superuser)
  (when-not (api.auth/show-google-sheets-integration)
    (error-response-in-body (tru "Google Sheets integration is not enabled.")))
  {:email (hm-service-account-email)})

(defn- seconds-from-epoch-now []
  (.getEpochSecond (t/instant)))

(defn- check-allowed-url [url]
  (when-not (re-matches #".*drive\.google\.com.*" url)
    (tru "Only Google Drive URLs are allowed at this time.") {}))

(api.macros/defendpoint :post "/folder" :- ::gsheets
  "Hook up a new google drive folder that will be watched and have its content ETL'd into Metabase."
  [{} {} {:keys [url]} :- [:map [:url ms/NonBlankString]]]
  (api/check-superuser)
  (check-allowed-url url)
  (let [[status response] (hm-create-gdrive-conn url)]
    (if (= status :ok)
      (u/prog1 {:status "loading"
                :folder_url url
                :folder-upload-time (seconds-from-epoch-now)
                :gdrive/conn-id (-> response :body :id)}
        (gsheets! <>))
      (error-response-in-body
       (tru "Unable to setup drive folder sync.\nPlease check that the folder is shared with the proper service account email and sharing permissions.")))))

(defn- sync-complete? [{:keys [status last-dwh-sync last-gdrive-conn-sync]}]
  (and (= status "active") ;; HM says the connection is active
       last-dwh-sync ;; make sure it's not nil
       last-gdrive-conn-sync ;; make sure it's not nil
       ;; We finished a sync of the dwh from metabase After the HM conn was synced:
       (t/after? (t/instant last-dwh-sync) (t/instant last-gdrive-conn-sync))))

(defn- get-last-mb-dwh-sync-time []
  (t2/select-one-fn :ended_at :model/TaskHistory
                    :db_id (t2/select-one-fn :id [:model/Database :id] :is_attached_dwh true)
                    :task "sync"
                    :status :success
                    {:order-by [[:ended_at :desc]]}))

(def ^:dynamic ^:private *folder-setup-timeout-seconds*
  "We want to avoid polling forever, even if harbormaster never finishes the sync, so if the sync does not happen
  during this window, we'll error out, reset the gsheets status, and suggest trying again."
  (* 5 60))

(defn- reset-gsheets-status []
  (gsheets! not-connected)
  (doseq [{:keys [id]} (hm-get-gdrive-conns)]
    (hm.client/make-request :delete (str "/api/v2/mb/connections/" id))))

(defn- handle-get-folder [attached-dwh]
  (let [[sstatus {conn :body}] (hm-get-gdrive-conn (:gdrive/conn-id (gsheets)))]
    (if (= :ok sstatus)
      (let [{:keys [status] last-gdrive-conn-sync :last-sync-at :as gdrive-conn}
            (normalize-gdrive-conn conn)

            last-dwh-sync
            (get-last-mb-dwh-sync-time)]
        (-> (cond
              (sync-complete? {:status status :last-dwh-sync last-dwh-sync :last-gdrive-conn-sync last-gdrive-conn-sync})
              (u/prog1 (assoc (gsheets) :status "complete")
                (gsheets! <>)
                (snowplow/track-event! ::snowplow/simple_event
                                       {:event "sheets_connected" :event_detail "success"}))

              (when-let [upload-time (:folder-upload-time (gsheets))]
                (> (seconds-from-epoch-now) (+ upload-time *folder-setup-timeout-seconds*)))
              (do (reset-gsheets-status)
                  (error-response-in-body (tru "Timeout syncing google drive folder, please try again.")
                                          {:status-code 408}))

              ;; Syncing failed
              (= "error" status)
              (do
                (reset-gsheets-status)
                (error-response-in-body (tru "Problem syncing google drive folder, please try again..")))

              ;; Continue waiting
              :else (gsheets))
            (assoc :db_id (:id attached-dwh)
                   ;; TEMP (gsheets)
                   ;; here is some debugging info to make sure we have it straight:
                   :hm/conn gdrive-conn
                   :mb/sync-info {:status status
                                  :last-dwh-sync last-dwh-sync
                                  :last-gdrive-conn-sync last-gdrive-conn-sync})))
      (error-response-in-body
       (tru "Unable to find google drive connection.")
       {:status-code 404}))))

(api.macros/defendpoint :get "/folder" :- ::gsheets
  "Check the status of a newly created gsheets folder creation. This endpoint gets polled by FE to determine when to
  stop showing the setup widget.

  Returns the gsheets shape, with the attached datawarehouse db id at `:db_id`."
  [] :- ::gsheets
  (api/check-superuser)
  (let [attached-dwh (t2/select-one :model/Database :is_attached_dwh true)]
    (when-not (some? attached-dwh)
      (snowplow/track-event! ::snowplow/simple_event {:event "sheets_connected" :event_detail "fail - no dwh"})
      (error-response-in-body (tru "No attached dwh found.")))
    (handle-get-folder attached-dwh)))

(api.macros/defendpoint :delete "/folder"
  "Disconnect the google service account. There is only one (or zero) at the time of writing."
  []
  (api/check-superuser)
  (snowplow/track-event! ::snowplow/simple_event {:event "sheets_disconnected"})
  (reset-gsheets-status))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/gsheets` routes."
  ;; TODO add api/+check-superuser +auth and +check-setting
  (api.macros/ns-handler *ns*))

(comment ;; TEMP (gsheets)

  (def drive-folder-url
    "https://drive.google.com/drive/folders/1H2gz8_TUsCNyFpooFeQB8Y7FXRZA_esH?usp=drive_link")

  (let [url drive-folder-url
        [status _resp] (hm-create-gdrive-conn url)]
    (if (= status :ok)
      (u/prog1 {:status "loading"
                :folder_url url
                :folder-upload-time (seconds-from-epoch-now)} (gsheets! <>))
      (throw (ex-info "[debug] uh o" {}))))

  ;; see the connection:
  (hm-get-gdrive-conns)

  ;; a polling loop on:
  (let [attached-dwh (t2/select-one :model/Database :is_attached_dwh true)]
    (when-not (some? attached-dwh)
      (snowplow/track-event! ::snowplow/simple_event {:event "sheets_connected" :event_detail "fail - no dwh"})
      (throw (ex-info "No attached dwh found." {})))
    (handle-get-folder attached-dwh))

  ;; once the connection status is active, sync on mb:
  (do
    ;; This is what the notify endpoint calls:
    ;; Do a sync on the attached dwh:
    (require '[metabase.sync.sync-metadata :as sync-metadata])

    (sync-metadata/sync-db-metadata!
     (t2/select-one :model/Database :is_attached_dwh true)))

  (gsheets)

  ;; check the polling loop again ^
  ;;  it should finish with: `{:status "complete"}`.

  ;; now, let's delete the connection:
  (reset-gsheets-status)

  ;; trigger gdrive scan resync on HM
  ;; (hm.client/make-request :put (format "/api/v2/mb/connections/%s/sync" (:id (get-gdrive-conn))))


  ;; need an "attached dwh" locally:
  (t2/update! :model/Database 1 {:is_attached_dwh true})

  )
