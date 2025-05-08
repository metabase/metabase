(ns metabase-enterprise.gsheets.settings
  (:require
   [clojure.set :as set]
   [metabase-enterprise.gsheets.constants :as gsheets.constants]
   [metabase.premium-features.core :as premium-features]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mr/def :gsheets/response
  [:or
   [:map
    [:error true?]
    [:message ms/NonBlankString]]
   [:multi {:dispatch :status}
    ["not-connected" [:map]]

    ["syncing"
     [:map
      [:url ms/NonBlankString]
      ;; time in seconds from epoch:
      [:created_at pos-int?]
      ;; time in seconds from epoch:
      [:sync_started_at pos-int?]
      [:created_by_id pos-int?]
      [:db_id pos-int?]]]

    ["active"
     [:map
      [:url ms/NonBlankString]
      ;; time in seconds from epoch:
      [:created_at pos-int?]
      ;; time in seconds from epoch:
      [:last_sync_at pos-int?]
      ;; time in seconds from epoch:
      [:next_sync_at pos-int?]
      [:created_by_id pos-int?]
      [:db_id pos-int?]]]
    ["error"
     [:map
      [:url ms/NonBlankString]
      ;; time in seconds from epoch:
      [:created_at pos-int?]
      [:error_message ms/NonBlankString]
      [:created_by_id pos-int?]
      [:db_id pos-int?]]]]])

(mr/def :gsheets/setting
  [:or
   [:map {}]
   [:map
    [:url ms/NonBlankString]
    ;; time in seconds from epoch:
    [:created-at pos-int?]
    [:created-by-id pos-int?]
    [:gdrive/conn-id ms/UUIDString]
    [:db-id pos-int?]]])

(defsetting show-google-sheets-integration
  "Whether or not to show the user a button that sets up Google Sheets integration."
  :visibility :public
  :type :boolean
  :export? false
  :doc "When enabled, we show users a button to authenticate with Google to import data from Google Sheets."
  :setter :none
  :getter (fn []
            (and
             (premium-features/is-hosted?)
             (premium-features/has-feature? :attached-dwh)
             (premium-features/has-feature? :etl-connections)
             ;; Need to know the store-api-url to make requests to HM
             (some? (setting/get :store-api-url))
             ;; Need [[api-key]] to make requests to HM
             (some? (setting/get :api-key)))))

(defn- migrate-gsheet-value
  "Migrate sheets in old formats to the current"
  [value]
  (-> value
      (set/rename-keys {:folder_url         :url
                        :folder-upload-time :created-at})
      (dissoc :status)
      (cond->
       (and (seq (dissoc value :status)) (nil? (:db-id value))) (assoc :db-id (t2/select-one-fn :id :model/Database :is_attached_dwh true)))
      (u/prog1 (when-not (= (set (keys <>)) (set (keys value)))
                 (setting/set-value-of-type! :json :gsheets <>)))))

(defsetting gsheets
  #_"
  This value has 3 states:

  1) The Google Sheets Folder is not setup.
  {:status \"not-connected\"}

  2) We have uploaded a Folder URL to HM, but have not synced it in MB yet.
  {:status \"loading\"
   :folder_url \"https://drive.google.com/drive/abc\"
   :gdrive/conn-id <uuid>
   ;; in seconds from epoch:
   :folder-upload-time 1738266997}

  3)  Google Sheets Integration is enabled, and users can view their google sheets tables.
  {:status \"complete\"
   :folder_url \"https://drive.google.com/drive/abc\"}"
  (deferred-tru "Information about Google Sheets Integration")
  :encryption :when-encryption-key-set
  :export? true
  :visibility :admin
  :type :json
  :getter (mu/fn :- :gsheets/setting []
            (or
              ;; This NEEDS to be up to date between instances on a cluster, so:
              ;; we are going around the settings cache:
             (some-> (t2/select-one :model/Setting :key "gsheets") :value json/decode+kw migrate-gsheet-value)
             (u/prog1 gsheets.constants/not-connected
               (setting/set-value-of-type! :json :gsheets <>)))))
