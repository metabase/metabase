(ns metabase.search.settings
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.settings.deprecated-grab-bag :as public-settings]
   [metabase.util.i18n :as i18n]))

(defsetting search-typeahead-enabled
  (i18n/deferred-tru "Enable typeahead search in the {0} navbar?"
                     (public-settings/application-name-for-setting-descriptions))
  :type       :boolean
  :default    true
  :visibility :authenticated
  :export?    true
  :audit      :getter)

(defsetting search-engine
  (i18n/deferred-tru "Which engine to use when performing search. Supported values are :in-place and :appdb")
  :visibility :internal
  :export?    false
  :default    :in-place
  :type       :keyword)

(defsetting experimental-search-weight-overrides
  (i18n/deferred-tru "Used to override weights used for search ranking")
  :visibility :internal
  :encryption :no
  :export?    false
  :default    nil
  :type       :json
  :doc        false)
