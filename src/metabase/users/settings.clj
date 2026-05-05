(ns metabase.users.settings
  (:require
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]
   [toucan2.core :as t2]))

;; NB: Settings are also defined where they're used

(defsetting last-acknowledged-version
  (deferred-tru "The last version for which a user dismissed the ''What''s new?'' modal.")
  :encryption :no
  :user-local :only
  :type :string)

(defsetting last-used-native-database-id
  (deferred-tru "The last database a user has selected for a native query or a native model.")
  :user-local :only
  :visibility :authenticated
  :type :integer
  :getter (fn []
            (when-let [id (setting/get-value-of-type :integer :last-used-native-database-id)]
              (when (t2/exists? :model/Database :id id) id))))

(defsetting dismissed-excel-pivot-exports-banner
  (deferred-tru "Toggle which is true after a user has dismissed the excel pivot exports banner.")
  :user-local :only
  :export?    false
  :visibility :authenticated
  :type       :boolean
  :default    false
  :audit      :never)

(defsetting dismissed-custom-dashboard-toast
  (deferred-tru "Toggle which is true after a user has dismissed the custom dashboard toast.")
  :user-local :only
  :visibility :authenticated
  :type       :boolean
  :default    false
  :audit      :never)

(defsetting dismissed-browse-models-banner
  (deferred-tru "Whether the user has dismissed the explanatory banner about models that appears on the Browse Data page")
  :user-local :only
  :export?    false
  :visibility :authenticated
  :type       :boolean
  :default    false
  :audit      :never)

(defsetting notebook-native-preview-sidebar-width
  (deferred-tru "Last user set sidebar width for the native query preview in the notebook.")
  :user-local :only
  :visibility :authenticated
  :type       :integer
  :default    nil)

(defsetting expand-browse-in-nav
  (deferred-tru "User preference for whether the ''Browse'' section of the nav is expanded.")
  :user-local :only
  :export?    false
  :visibility :authenticated
  :type       :boolean
  :default    true)

(defsetting expand-bookmarks-in-nav
  (deferred-tru "User preference for whether the ''Bookmarks'' section of the nav is expanded.")
  :user-local :only
  :export?    false
  :visibility :authenticated
  :type       :boolean
  :default    true)

(defsetting expand-collections-in-nav
  (deferred-tru "User preference for whether the ''Collections'' section of the nav is expanded.")
  :user-local :only
  :export?    false
  :visibility :authenticated
  :type       :boolean
  :default    true)

(defsetting expand-library-in-nav
  (deferred-tru "User preference for whether the ''Library'' section of the nav is expanded.")
  :user-local :only
  :export?    false
  :visibility :authenticated
  :type       :boolean
  :default    true)

(defsetting browse-filter-only-verified-models
  (deferred-tru "User preference for whether the ''Browse models'' page should be filtered to show only verified models.")
  :user-local :only
  :export?    false
  :visibility :authenticated
  :type       :boolean
  :default    true)

(defsetting browse-filter-only-verified-metrics
  (deferred-tru "User preference for whether the ''Browse metrics'' page should be filtered to show only verified metrics.")
  :user-local :only
  :export?    false
  :visibility :authenticated
  :type       :boolean
  :default    true)

(defsetting color-scheme
  (deferred-tru "User preference for color scheme. Can be ''light'', ''dark'', or ''auto''.")
  :user-local :only
  :encryption :no
  :export?    false
  :visibility :authenticated
  :type       :string
  :default    "auto")

(defsetting trial-banner-dismissal-timestamp
  (deferred-tru "The ISO8601 date when a user last dismissed the trial banner.")
  :user-local :only
  :encryption :no
  :export?    false
  :visibility :authenticated
  :type       :string)

(defsetting sdk-iframe-embed-setup-settings
  (deferred-tru "The embed settings last chosen in the setup flow for sdk-based iframe embedding.")
  :user-local :only
  :encryption :no
  :export?    false
  :visibility :authenticated
  :type       :json)

(defsetting license-token-missing-banner-dismissal-timestamp
  (deferred-tru "The array of last two ISO8601 dates when an admin dismissed the license token missing banner.")
  :encryption :no
  :export?    false
  :visibility :admin
  :type       :csv
  :default    [])

(defsetting user-visibility
  (deferred-tru "Note: Sandboxed users will never see suggestions.")
  :visibility   :authenticated
  :feature      :email-restrict-recipients
  :type         :keyword
  :default      :all
  :audit        :raw-value)
