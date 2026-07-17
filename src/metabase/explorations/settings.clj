(ns metabase.explorations.settings
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting explorations-worker-count
  (deferred-tru "How many exploration queries a single Metabase node runs at once.")
  :type       :integer
  :default    2
  :visibility :internal
  :export?    false)
