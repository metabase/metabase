(ns metabase-enterprise.impersonation.settings
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting impersonation-query-cache-retention-days
  (deferred-tru "Cached validation results of impersonated native queries are deleted once they are this many days old.")
  :encryption :no
  :visibility :internal
  :default    30
  :type       :positive-integer
  :export?    false
  :doc        false)
