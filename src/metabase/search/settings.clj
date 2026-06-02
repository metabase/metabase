(ns metabase.search.settings
  (:require
   [metabase.appearance.core :as appearance]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n-be.core :as i18n-be]))

(defsetting search-typeahead-enabled
  (i18n-be/deferred-tru "Enable typeahead search in the {0} navbar?"
                        (setting/application-name-for-setting-descriptions appearance/application-name))
  :type       :boolean
  :default    true
  :visibility :authenticated
  :export?    true
  :audit      :getter)

(defsetting search-engine
  (i18n-be/deferred-tru "Which engine to use by default for search. Supported values are :in-place, :appdb, and :semantic")
  :visibility :authenticated
  :export?    false
  :setter     :none
  ;; TODO (Chris 2025-11-07) Would be good to remove the default and just use [search.engine/default-engine-precedence]
  :default    :appdb
  :type       :keyword)

(defsetting experimental-search-weight-overrides
  (i18n-be/deferred-tru "Used to override weights used for search ranking")
  :visibility :internal
  :encryption :no
  :export?    false
  :default    nil
  :type       :json
  :doc        false)

(defsetting search-language
  (i18n-be/deferred-tru "When using the appdb engine against postgresql, override the language used for stemming in to_tsvector.
  Value must be a valid configured language option in your database such as ''english'' or ''simple''")
  :visibility :internal
  :export?    false
  :encryption :no
  :default    nil
  :type       :string)
