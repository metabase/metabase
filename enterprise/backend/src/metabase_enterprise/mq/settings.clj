(ns metabase-enterprise.mq.settings
  "Settings for the enterprise Redis queue backend. Only relevant when `queue-backend` is `redis`;
  they register when the [[metabase-enterprise.mq.queue.redis]] namespace is lazily loaded for that
  backend."
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

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
