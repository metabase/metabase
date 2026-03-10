(ns metabase.collections-rest.settings
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :as i18n]))

(defsetting can-run-adhoc-query-check-threshold
  (i18n/deferred-tru (str "Maximum number of cards to compute can_run_adhoc_query for. When the number of cards exceeds "
                          "this threshold, can_run_adhoc_query will return true for all cards without computing actual "
                          "permissions. Set to 0 to always compute permissions. This only affects how cards are displayed"
                          " in the query builder and does not affect actual permission enforcement."))
  :type       :integer
  :export?    false
  :default    250
  :visibility :internal)
