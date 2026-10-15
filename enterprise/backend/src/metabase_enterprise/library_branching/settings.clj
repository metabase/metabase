(ns metabase-enterprise.library-branching.settings
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(set! *warn-on-reflection* true)

(defsetting library-branching-enabled
  (deferred-tru "Whether this instance syncs its Library with library branching.")
  :type :boolean
  :default false
  :visibility :admin
  :export? false
  :encryption :no
  :audit :getter
  :doc false)
