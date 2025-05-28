(ns metabase.search.settings
  (:require
   [metabase.appearance.core :as appearance]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :as i18n]))

(defsetting search-typeahead-enabled
  (i18n/deferred-tru "Enable typeahead search in the {0} navbar?"
                     (setting/application-name-for-setting-descriptions appearance/application-name))
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

(defsetting search-language
  (i18n/deferred-tru "When using the appdb engine against postgresql, override the language used for stemming in to_tsvector.
  Value must be a valid configured langauge option in your database such as ''english'' or ''simple''")
  :visibility :internal
  :export?    false
  :encryption :no
  :default    nil
  :type       :string)
