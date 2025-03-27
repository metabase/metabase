(ns metabase-enterprise.gsheets.api
  (:require
   [java-time.api :as t]
   [medley.core :as m]
   [metabase-enterprise.gsheets.constants :as gsheets.constants]
   [metabase-enterprise.gsheets.settings
    :as gsheets.settings
    :refer [gsheets gsheets!]]
   [metabase-enterprise.harbormaster.client :as hm.client]
   [metabase.analytics.core :as analytics]
   [metabase.analytics.snowplow :as snowplow]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2])
  (:import (java.time Instant)))

;; # Google Sheets Integration
;;
;; ## Overview
;; Google Sheets Integration allows users to connect their Google Drive folders to Metabase. We sync any Google Sheets
;; inside of those folders, and make them available to the user in their attached data warehouse. This integration is
;; implemented using Harbormaster, which is a service that manages instances of Metabase and also gives us a connection
;; to Google Sheets data. When a user connects a Google Drive folder to Metabase, Harbormaster creates a connection to
;; the folder and starts syncing the data to Metabase. This data is then available to the user in Metabase as tables.
;;
;; ## Steps to connect a new google drive folder
;;
;; - An admin clicks Add Data > Connect Google Sheets
;; - FE sends :get "api/ee/gsheets/service-account" to get service-account email
;;   - If the FE cannot find the service-account email, it does not show the "connect to google sheets" (ctgs) button.
;; - user clicks ctgs button -> FE shows instructions for how to connect a folder:
;;   - user shares their Google Drive folder w/ service-account email
;;   - user copies their Google Drive share link into MB form and hits submit
;; - FE sends :post "api/ee/gsheets/folder" w/ folder url string as `request.body.url`
;;   - BE forwards request to :post "/api/v2/mb/connections" w/ body:
;;     `{:type "[gdrive|google_spreadsheet]" :secret {:resources ["the-url"]}}`
;;     - on unexceptional status:
;;       - BE returns the gsheets shape: `{:status "syncing" :url "the-url" :created_at <epoch-time>}}`
;;     - on exceptional status, BE returns a message like: "Unable to set up drive folder sync. Please check that the
;;       folder is shared with the proper service account email and sharing permissions."
;;
;; ## Polling
;; - FE polls :get "api/ee/gsheets/folder" until `body.status` == `active`
;; - BE forwards requests to :get "/api/v2/mb/connection/<gdrive-conn-id>", filtering for the google drive connection
;;   - If the connection doesn't exist: `{:error "google drive connection not found."}`
;;   - If the connection exists, return connection state in the response
;; - FE sees status == "active" or "syncing" and updates the UI accordingly, stopping polling when it sees "active"
;;
;; ## Steps to disconnect a google drive folder
;; - FE sends request to :delete "/folder"
;;   - MB loops over all gdrive connection ids and deletes them
;;
;; ## Why do we need to sync the attached datawarehouse before considering it ready?
;; We need to sync the attached datawarehouse to make sure that the data from the Google Drive folder is available to
;; the user in Metabase. Once the gdrive connection's status is set to 'active' by HM, they will call MB's
;; `api/notify/db/attached_datawarehouse` endpoint to trigger a sync. The data from the Google Drive folder is already
;; availiable in the attached datawarehouse, and when MB finishes the sync (and puts an item into :model/TaskHistory
;; saying so), the user can start using their Google Sheets data in Metabase.
;;
;; ## Why do we check for multiple gdrive connections in the delete endpoint? We check for multiple gdrive connections
;; in the delete endpoint to make sure that we are deleting _all_ gdrive connections. As of Milestone 2 there is
;; supposed to be only one gdrive connection, but we observed multiple being created (distributed systems amirite?) and
;; want the delete endpoint to basically reset us to a blank slate. If there are multiple gdrive connections, we will
;; delete all of them. If there are errors during the gdrive conn deletion we ignore them.

(set! *warn-on-reflection* true)

(defn error-response-in-body
  "We've decided to return errors as a map with an `:error` key. This function is a helper to make that map.

  This formats and throws an ex-info that will put the message into the body of the response."
  ([message] (error-response-in-body message {}))
  ([message data]
   (throw (ex-info message (merge data {;; the `:errors true` bit informs the exception middleware to return the message
                                        ;; in the body, even if we want to pass a status code. Without `:errors true`,
                                        ;; sending a status code will elide the message from the response.
                                        :errors true
                                        :message message})))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; MB <-> HM APIs
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(mu/defn- hm-service-account-email :- :string
  "Checks to see if Google service-account is setup in harbormaster, and returns the email."
  []
  (let [[status {:keys [body] :as response}] (hm.client/make-request :get "/api/v2/mb/connections-google/service-account")
        email (:email body)]
    (cond
      email
      email

      (= :error status)
      (error-response-in-body
       (tru "Harbormaster returned an error.")
       {:hm/response response :status-code 502})

      :else
      (error-response-in-body
       (tru "Google service-account is not setup in harbormaster.")
       {:status-code 502}))))

(mr/def :gdrive/connection
  [:map {:description "A Harbormaster Gdrive Connection"}
   [:id :string]
   [:type [:enum "gdrive" "google_spreadsheet"]]
   [:status [:enum "initializing" "syncing" "active" "error"]]
   [:last-sync-at [:maybe :time/zoned-date-time]]
   [:last-sync-started-at [:maybe :time/zoned-date-time]]
   [:created-at :time/zoned-date-time]
   [:updated-at :time/zoned-date-time]])

(defn- is-gdrive?
  "Is this connection a gdrive connection?"
  [{:keys [type] :as _conn}] (or (= "google_spreadsheet" type) (= "gdrive" type)))

(defn- normalize-gdrive-conn
  "Normalize the gdrive connection shape from harbormaster, mostly parsing times."
  [gdc]
  (-> gdc
      (dissoc :hosted-instance-resource)
      (m/update-existing :last-sync-at u.date/parse)
      (m/update-existing :last-sync-started-at u.date/parse)
      (m/update-existing :created-at u.date/parse)
      (m/update-existing :updated-at u.date/parse)))

(mu/defn- hm-get-gdrive-conns :- [:sequential :gdrive/connection]
  "Get the harbormaster gdrive type connection.

  If the response fails:    return an empty list.
  If the response succeeds: return a list of all gdrive-type connections."
  []
  (let [[status response] (hm.client/make-request :get "/api/v2/mb/connections")]
    (if (= status :ok)
      (mapv normalize-gdrive-conn
            (filter is-gdrive? (or (some-> response :body) [])))
      [])))

(mu/defn- hm-delete-conn! :- :hm-client/http-reply
  "Delete (presumably a gdrive) connection on HM."
  [conn-id]
  (hm.client/make-request :delete (str "/api/v2/mb/connections/" conn-id)))

(defn- reset-gsheets-status!
  "Reset the gsheets status to not-connected and delete all known gdrive connections."
  []
  (u/prog1 gsheets.constants/not-connected
    (gsheets! <>)
    (doseq [{:keys [id]} (hm-get-gdrive-conns)]
      (let [[delete-status _] (hm-delete-conn! id)]
        (when-not (= delete-status :ok)
          (log/debugf "Unable to delete gdrive connection %s." id))))))

(mu/defn hm-get-gdrive-conn :- :hm-client/http-reply
  "Get a specific gdrive connection by id."
  [id]
  (when-not id
    (throw (ex-info "Cannot fetch Google Drive connection: ID is nil" {})))
  (hm.client/make-request :get (str "/api/v2/mb/connections/" id)))

(defn- url-type [url]
  (cond
    (re-matches #"^(https|http)://docs.google.com/spreadsheets/.*" url)
    "google_spreadsheet"

    (re-matches #"^(https|http)://drive.google.com/file/.*" url)
    "google_spreadsheet"

    (re-matches #"^(https|http)://drive.google.com/drive/.*" url)
    "gdrive"

    :else
    (throw (ex-info (tru "Invalid URL: {0}" url) {:status-code 400}))))

(mu/defn- hm-create-gdrive-conn! :- :hm-client/http-reply
  "Creating a gdrive connection on HM starts the sync w/ drive folder or sheet."
  [resource-url]
  (hm.client/make-request :post "/api/v2/mb/connections" {:type (url-type resource-url) :secret {:resources [resource-url]}}))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; FE <-> MB APIs
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(api.macros/defendpoint :get "/service-account" :- [:map [:email [:maybe :string]]]
  "Checks to see if service-account is setup or not, delegates to HM only if we haven't set it from a metabase cluster
  before."
  []
  (when-not (gsheets.settings/show-google-sheets-integration)
    (reset-gsheets-status!)
    (error-response-in-body (tru "Google Sheets integration is not enabled.") {:status-code 402}))
  {:email (hm-service-account-email)})

(defn- seconds-from-epoch-now
  "This is used to track how long a folder has been syncing. We set gsheets.folder-upload-time to this value when we create a
  new gdrive connection, and on every :get /folder request we check if the current time is greater than this value plus
  [[*folder-setup-timeout-seconds*]]. If it is, that's a timeout."
  [] (.getEpochSecond (t/instant)))

(defn- setting->response
  "Returns the data in the setting which should be returned in API responses, correctly formatted"
  [setting]
  {:url           (:url setting)
   :created_at    (:created-by-id setting)
   :created_by_id (:created-by-id setting)})

(api.macros/defendpoint :post "/folder" :- :gsheets/gsheets-response
  "Hook up a new google drive folder that will be watched and have its content ETL'd into Metabase."
  [{} {} {:keys [url]} :- [:map [:url ms/NonBlankString]]]
  (let [[status response] (hm-create-gdrive-conn! url)
        created-at (seconds-from-epoch-now)
        created-by-id api/*current-user-id*]
    (if (= status :ok)
      (u/prog1 {:status          "syncing"
                :url             url
                :created_at      created-at
                :created_by_id   created-by-id
                :sync_started_at created-at}
        (gsheets! {:url            url
                   :created-at     created-at
                   :gdrive/conn-id (-> response :body :id)
                   :created-by-id  created-by-id})
        (analytics/inc! :metabase-gsheets/connection-creation-began))
      (do
        (reset-gsheets-status!)
        (error-response-in-body
         (tru "Unable to setup drive folder sync.\nPlease check that the folder is shared with the proper service account email and sharing permissions."))))))

(defn- gsheets-safe
  "Return the gsheets setting, or fetch it from the db if it's not in the cache."
  []
  (or (gsheets)
      (do (log/warn "CACHE MISS ON GSHEETS")
          (some-> (t2/select-one :model/Setting :key "gsheets")
                  :value
                  json/decode+kw))))

(defn- handle-get-folder [attached-dwh]
  (let [saved-setting (gsheets-safe)
        conn-id (:gdrive/conn-id saved-setting)
        hm-response (if (empty? saved-setting)
                      nil
                      (try (hm-get-gdrive-conn conn-id)
                           (catch Exception _
                             (reset-gsheets-status!)
                             (error-response-in-body
                              (tru "Unable to find google drive connection, please try again.")
                              {:gdrive/conn-id conn-id}))))
        [hm-status {hm-body :body}] hm-response]
    (if (= :ok hm-status)
      (let [{:keys [status last-sync-at last-sync-started-at]
             :as   _} (normalize-gdrive-conn hm-body)]
        (-> (cond
              (= "error" status)
              (do
                (reset-gsheets-status!)
                (analytics/inc! :metabase-gsheets/connection-creation-error {:reason "status_error"})
                (error-response-in-body (tru "Problem syncing google drive folder, please recreate the connection.")))

              (= "active" status)
              (assoc (setting->response saved-setting)
                     :status "active"
                     :last_sync_at (.getEpochSecond ^Instant (t/instant last-sync-at))
                     :next_sync_at (.getEpochSecond ^Instant (t/+ (t/instant last-sync-at) (t/minutes 15))))

              (or (= "syncing" status) (= "initializing" status))
              (assoc (setting->response saved-setting)
                     :status "syncing"
                     :sync_started_at (.getEpochSecond ^Instant (t/instant (or last-sync-started-at (t/instant)))))

              :else (throw (ex-info "Unexpected status" {:status status})))
            (assoc :db_id (:id attached-dwh))))
      (if (empty? saved-setting)
        {:status "not-connected"}
        (do
          (reset-gsheets-status!)
          (error-response-in-body
           (tru "Unable to find google drive connection.")
           {:status-code 404}))))))

(api.macros/defendpoint :get "/folder" :- :gsheets/gsheets-response
  "Check the status of a newly created gsheets folder creation. This endpoint gets polled by FE to determine when to
  stop showing the setup widget.

  Returns the gsheets shape, with the attached datawarehouse db id at `:db_id`."
  [] :- :gsheets/gsheets-response
  (let [attached-dwh (t2/select-one :model/Database :is_attached_dwh true)]
    (when-not (some? attached-dwh)
      (snowplow/track-event! :snowplow/simple_event {:event "sheets_connected" :event_detail "fail - no dwh"})
      (reset-gsheets-status!)
      (error-response-in-body (tru "No attached dwh found.")))
    (handle-get-folder attached-dwh)))

(mu/defn- hm-sync-conn! :- :hm-client/http-reply
  "Sync a (presumably a gdrive) connection on HM."
  [conn-id]
  (hm.client/make-request :put (str "/api/v2/mb/connections/" conn-id "/sync")))

(api.macros/defendpoint :post "/folder/sync"
  "Force a sync of the folder now.

  Returns the gsheets shape, with the attached datawarehouse db id at `:db_id`."
  []
  (let [sheet-config (gsheets-safe)]
    (if (empty? sheet-config)
      (do
        (snowplow/track-event! :snowplow/simple_event {:event "sheets_sync" :event_detail "fail - no config"})
        (error-response-in-body (tru "No attached google sheet(s) found.") {:status-code 404}))
      (do
        (snowplow/track-event! :snowplow/simple_event {:event "sheets_sync"})
        (analytics/inc! :metabase-gsheets/connection-manually-synced)
        (hm-sync-conn! (:conn-id sheet-config))
        (assoc (setting->response sheet-config)
               :status "syncing"
               :sync_started_at (seconds-from-epoch-now))))))

(api.macros/defendpoint :delete "/folder"
  "Disconnect the google service account. There is only one (or zero) at the time of writing."
  []
  (snowplow/track-event! :snowplow/simple_event {:event "sheets_disconnected"})
  (analytics/inc! :metabase-gsheets/connection-deleted)
  (reset-gsheets-status!)
  {:status "not-connected"})

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/gsheets` routes."
  (api/+check-superuser
   (api.macros/ns-handler *ns*)))

(comment

  ;; need an "attached dwh" locally?
  (t2/update! :model/Database 1
              {:is_attached_dwh true
               :settings
               (str "{\"auto-cruft-tables\":[\".*_dlt_loads$\",\".*_dlt_pipeline_state$\",\".*_dlt_sentinel_table$\",\".*_dlt_spreadsheet_info$\",\".*_dlt_version$\"],"
                    "\"auto-cruft-columns\":[\"^_dlt_id$\",\"^_dlt_load_id$\"]}")})

  (do
    ;; This is what the notify endpoint calls to do a sync on the attached dwh:
    #_{:clj-kondo/ignore [:metabase/modules]}
    (require '[metabase.sync.sync-metadata :as sync-metadata])

    (sync-metadata/sync-db-metadata!
     (t2/select-one :model/Database :is_attached_dwh true))))
