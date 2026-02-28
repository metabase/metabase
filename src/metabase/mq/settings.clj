(ns metabase.mq.settings
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting queue-max-retries
  (deferred-tru "Maximum number of times a failed queue message will be retried before being dropped.")
  :type       :integer
  :default    5
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
                    (if (= (mdb/db-type) :postgres)
                      "postgres"
                      "memory")))
  :visibility :internal
  :export?    false)
