(ns metabase.mq.settings
  (:require
   [metabase.settings.core :refer [defsetting]]
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
