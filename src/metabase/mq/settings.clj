(ns metabase.mq.settings
  (:require
   [metabase.app-db.connection :as mdb.connection]
   [metabase.settings.core :refer [defsetting]]
   [metabase.settings.models.setting :as setting]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting queue-max-retries
  (deferred-tru "Maximum number of times a failed queue message will be retried before being dropped.")
  :type       :integer
  :default    5
  :visibility :internal
  :export?    false)

(defsetting topic-max-retries
  (deferred-tru "Maximum number of times a failed topic message delivery will be retried before being skipped.")
  :type       :integer
  :default    3
  :visibility :internal
  :export?    false)

(defsetting queue-backend
  (deferred-tru "Which queue backend to use. Valid values: appdb, memory.")
  :type       :string
  :default    "appdb"
  :visibility :internal
  :export?    false)

(defsetting topic-backend
  (deferred-tru "Which topic backend to use. Valid values: appdb, memory, postgres.")
  :type       :string
  :getter     (fn []
                (or (setting/get-value-of-type :string :topic-backend)
                    (if (= (mdb.connection/db-type) :postgres)
                      "postgres"
                      "memory")))
  :visibility :internal
  :export?    false)
