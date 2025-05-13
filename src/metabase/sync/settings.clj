(ns metabase.sync.settings
  (:require
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]
   [toucan2.core :as t2]))

(defsetting show-database-syncing-modal
  (deferred-tru
   (str "Whether an introductory modal should be shown after the next database connection is added. "
        "Defaults to false if any non-default database has already finished syncing for this instance."))
  :visibility :admin
  :type       :boolean
  :audit      :never
  :getter     (fn []
                (let [v (setting/get-value-of-type :boolean :show-database-syncing-modal)]
                  (if (nil? v)
                    (not (t2/exists? :model/Database
                                     :is_sample false
                                     :is_audit false
                                     :initial_sync_status "complete"))
                    ;; frontend should set this value to `true` after the modal has been shown once
                    v))))
