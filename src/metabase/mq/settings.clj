(ns metabase.mq.settings
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting queue-max-retries
  (deferred-tru "Maximum number of times a failed queue message will be retried before being dropped.")
  :type       :integer
  :default    5
  :visibility :internal
  :encryption :no
  :export?    false)

(defsetting queue-backend
  (deferred-tru "Which queue backend to use. Valid values: `appdb`, `memory`, `redis`.")
  :type       :string
  :default    "appdb"
  :visibility :internal
  :encryption :no
  :export?    false)

(defsetting mq-redis-uri
  (deferred-tru "Connection URI for the Redis server, e.g. `redis://host:6379`. Used when `queue-backend` is `redis`.")
  :type       :string
  :default    "redis://localhost:6379"
  :visibility :internal
  :encryption :no
  :export?    false)

(defsetting mq-redis-username
  (deferred-tru "Username for the Redis server. Only used when `queue-backend` is `redis`.")
  :type       :string
  :default    ""
  :visibility :internal
  :encryption :no
  :export?    false)

(defsetting mq-redis-password
  (deferred-tru "Password for the Redis server. Only used when `queue-backend` is `redis`.")
  :type       :string
  :default    ""
  :visibility :internal
  :encryption :when-encryption-key-set
  :sensitive? true
  :export?    false)
