(ns metabase.permissions.settings
  (:require
   [java-time.api :as t]
   [metabase.db :as mdb]
   [metabase.models.setting :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]
   [toucan2.core :as t2]))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; v50 Permissions Tutorial settings
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Bryan (7/8/24): The following 2 settings are meant to mitigate any confusion for admins over the new and improved
;; permissions format. It looks different, so we want to make sure they know what's up.
;; We don't want to show the modal or banner to admins who started using MB after v50 or who have dismissed them.
;; We should come back around and delete them from the master branch in a few months.

(defn- instance-create-time []
  (->> (t2/select-one [:model/User [:%min.date_joined :min]]) :min t/local-date-time))

(defn- v-fifty-migration-time []
  (let [v50-migration-id "v50.2024-01-04T13:52:51"]
    (->> (mdb/changelog-by-id (mdb/app-db) v50-migration-id) :dateexecuted)))

(defsetting show-updated-permission-modal
  (deferred-tru
   "Whether an introductory modal should be shown for admins when they first upgrade to the new data-permissions format.")
  :visibility :admin
  :export?    false
  :default    true
  :user-local :only
  :getter (fn [] (if (t/after? (instance-create-time) (v-fifty-migration-time))
                   false
                   (setting/get-value-of-type :boolean :show-updated-permission-modal)))
  :type       :boolean
  :audit      :never)

(defsetting show-updated-permission-banner
  (deferred-tru
   "Whether an informational header should be displayed in the permissions editor about the new data-permissions format.")
  :visibility :admin
  :export?    false
  :default    true
  :user-local :only
  :getter (fn [] (if (t/after? (instance-create-time) (v-fifty-migration-time))
                   false
                   (setting/get-value-of-type :boolean :show-updated-permission-banner)))
  :type       :boolean
  :audit      :never)
