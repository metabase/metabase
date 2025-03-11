(ns metabase-enterprise.gsheets.settings
  (:require
   [metabase-enterprise.gsheets.constants :as gsheets.constants]
   [metabase.models.setting :as setting :refer [defsetting]]
   [metabase.premium-features.core :as premium-features]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.json :as json]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mr/def :gsheets/gsheets
  [:multi {:dispatch :status}
   ["not-connected" [:map]]

   ["loading"
    [:map
     [:folder_url ms/NonBlankString]
     ;; time in seconds from epoch:
     [:folder-upload-time pos-int?]
     [:gdrive/conn-id ms/UUIDString]]]

   ["complete"
    [:map
     [:folder_url ms/NonBlankString]
     ;; time in seconds from epoch:
     [:folder-upload-time pos-int?]
     [:gdrive/conn-id ms/UUIDString]]]])

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
  :getter (fn [] (or
                  ;; This NEEDS to be up to date between instances on a cluster, so:
                  ;; we are going around the settings cache:
                  (some-> (t2/select-one :model/Setting :key "gsheets") :value json/decode+kw)
                  (u/prog1 gsheets.constants/not-connected
                    (setting/set-value-of-type! :json :gsheets <>)))))
