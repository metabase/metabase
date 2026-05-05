(ns metabase.appearance.settings
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util :as u]
   [metabase.util.fonts :as u.fonts]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defsetting application-name
  (deferred-tru "Replace the word “Metabase” wherever it appears.")
  :encryption :no
  :visibility :public
  :export?    true
  :type       :string
  :audit      :getter
  :feature    :whitelabel
  :default    "Metabase")

(defsetting site-name
  (deferred-tru "The name used for this instance of {0}."
                (setting/application-name-for-setting-descriptions application-name))
  :encryption :no
  :default    "Metabase"
  :audit      :getter
  :visibility :settings-manager
  :export?    true)

(defsetting custom-homepage
  (deferred-tru "Pick one of your dashboards to serve as homepage. Users without dashboard access will be directed to the default homepage.")
  :encryption :no
  :default    false
  :type       :boolean
  :audit      :getter
  :visibility :public
  :export?    true)

(defsetting custom-homepage-dashboard
  (deferred-tru "ID of dashboard to use as a homepage")
  :encryption :no
  :type       :integer
  :visibility :public
  :audit      :getter
  :export?    true)

(defn- coerce-to-relative-url
  "Get the path of a given URL if the URL contains an origin.
   Otherwise make the landing-page a relative path."
  [landing-page]
  (cond
    (u/url? landing-page) (-> landing-page io/as-url .getPath)
    (empty? landing-page) ""
    (not (str/starts-with? landing-page "/")) (str "/" landing-page)
    :else landing-page))

(defsetting landing-page
  (deferred-tru "Enter a URL of the landing page to show the user. This overrides the custom homepage setting above.")
  :encryption :no
  :visibility :public
  :export?    true
  :type       :string
  :default    ""
  :audit      :getter
  :setter     (fn [new-landing-page]
                (when new-landing-page
                  ;; If the landing page is a valid URL or mailto, sms, or file, then check with if site-url has the same origin.
                  (when (and (or (re-matches #"^(mailto|sms|file):(.*)" new-landing-page) (u/url? new-landing-page))
                             (not (str/starts-with? new-landing-page (setting/get :site-url))))
                    (throw (ex-info (tru "This field must be a relative URL.") {:status-code 400}))))
                (setting/set-value-of-type! :string :landing-page (coerce-to-relative-url new-landing-page))))

(def ^:private loading-message-values
  #{:doing-science :running-query :loading-results})

(defsetting loading-message
  (deferred-tru (str "Choose the message to show while a query is running. Possible values are \"doing-science\", "
                     "\"running-query\", or \"loading-results\""))
  :encryption :no
  :visibility :public
  :export?    true
  :feature    :whitelabel
  :type       :keyword
  :default    :doing-science
  :setter     (fn [new-value]
                (let [value (or (loading-message-values (keyword new-value))
                                (throw (ex-info "Loading message set to an unsupported value"
                                                {:value   new-value
                                                 :options (seq loading-message-values)})))]
                  (setting/set-value-of-type! :keyword :loading-message value)))
  :getter     (fn []
                (let [value (setting/get-value-of-type :keyword :loading-message)]
                  (or (loading-message-values value)
                      :doing-science)))
  :audit      :getter)

(defsetting application-colors
  (deferred-tru "Choose the colors used in the user interface throughout Metabase and others specifically for the charts. You need to refresh your browser to see your changes take effect.")
  :encryption :no
  :visibility :public
  :export?    true
  :type       :json
  :feature    :whitelabel
  :default    {}
  :audit      :getter
  :doc "To change the user interface colors:

```
{
 \"brand\":\"#ff003b\",
 \"filter\":\"#FF003B\",
 \"summarize\":\"#FF003B\"
}
```

To change the chart colors:

```
{
 \"accent0\":\"#FF0005\",
 \"accent1\":\"#E6C367\",
 \"accent2\":\"#B9E68A\",
 \"accent3\":\"#8AE69F\",
 \"accent4\":\"#8AE6E4\",
 \"accent5\":\"#8AA2E6\",
 \"accent6\":\"#B68AE6\",
 \"accent7\":\"#E68AD0\"
}
```")

(defsetting application-font
  (deferred-tru "Replace “Lato” as the font family.")
  :encryption :no
  :visibility :public
  :export?    true
  :type       :string
  :default    "Lato"
  :feature    :whitelabel
  :audit      :getter
  :setter     (fn [new-value]
                (when new-value
                  (when-not (u.fonts/available-font? new-value)
                    (throw (ex-info (tru "Invalid font {0}" (pr-str new-value)) {:status-code 400}))))
                (setting/set-value-of-type! :string :application-font new-value)))

(defsetting application-font-files
  (deferred-tru "Tell us where to find the file for each font weight. You don’t need to include all of them, but it’ll look better if you do.")
  :encryption :no
  :visibility :public
  :export?    true
  :type       :json
  :audit      :getter
  :feature    :whitelabel
  :doc "Example value:

```
[
  {
    \"src\": \"https://example.com/resources/font-400\",
    \"fontFormat\": \"ttf\",
    \"fontWeight\": 400
  },
  {
    \"src\": \"https://example.com/resources/font-700\",
    \"fontFormat\": \"woff\",
    \"fontWeight\": 700
  }
]
```

See [fonts](../configuring-metabase/fonts.md).")

(defn application-color
  "The primary color, a.k.a. brand color"
  []
  (or (:brand (application-colors)) "#509EE3"))

(defn secondary-chart-color
  "The first 'Additional chart color'"
  []
  (or (:accent3 (application-colors)) "#EF8C8C"))

(defsetting application-logo-url
  (deferred-tru "Upload a file to replace the Metabase logo on the top bar.")
  :encryption :no
  :visibility :public
  :export?    true
  :type       :string
  :audit      :getter
  :feature    :whitelabel
  :default    "app/assets/img/logo.svg"
  :doc "Inline styling and inline scripts are not supported.")

(defsetting application-favicon-url
  (deferred-tru "Upload a file to use as the favicon.")
  :encryption :no
  :visibility :public
  :export?    true
  :type       :string
  :audit      :getter
  :feature    :whitelabel
  :default    "app/assets/img/favicon.ico")

(defsetting show-metabot
  (deferred-tru "Enables Metabot character on the home page")
  :visibility :public
  :export?    true
  :type       :boolean
  :audit      :getter
  :feature    :whitelabel
  :default    true
  :doc        false)

(defsetting login-page-illustration
  (deferred-tru "Options for displaying the illustration on the login page.")
  :encryption :no
  :visibility :public
  :export?    true
  :type       :string
  :audit      :getter
  :feature    :whitelabel
  :default    "default")

(defsetting login-page-illustration-custom
  (deferred-tru "The custom illustration for the login page.")
  :encryption :no
  :visibility :public
  :export?    true
  :type       :string
  :audit      :getter
  :feature    :whitelabel)

(defsetting landing-page-illustration
  (deferred-tru "Options for displaying the illustration on the landing page.")
  :encryption :no
  :visibility :public
  :export?    true
  :type       :string
  :audit      :getter
  :feature    :whitelabel
  :default    "default")

(defsetting landing-page-illustration-custom
  (deferred-tru "The custom illustration for the landing page.")
  :encryption :no
  :visibility :public
  :export?    true
  :type       :string
  :audit      :getter
  :feature    :whitelabel)

(defsetting no-data-illustration
  (deferred-tru "Options for displaying the illustration when there are no results after running a question.")
  :encryption :no
  :visibility :public
  :export?    true
  :type       :string
  :audit      :getter
  :feature    :whitelabel
  :default    "default")

(defsetting no-data-illustration-custom
  (deferred-tru "The custom illustration for when there are no results after running a question.")
  :encryption :no
  :visibility :public
  :export?    true
  :type       :string
  :audit      :getter
  :feature    :whitelabel)

(defsetting no-object-illustration
  (deferred-tru "Options for displaying the illustration when there are no results after searching.")
  :encryption :no
  :visibility :public
  :export?    true
  :type       :string
  :audit      :getter
  :feature    :whitelabel
  :default    "default")

(defsetting no-object-illustration-custom
  (deferred-tru "The custom illustration for when there are no results after searching.")
  :encryption :no
  :visibility :public
  :export?    true
  :type       :string
  :audit      :getter
  :feature    :whitelabel)

(def ^:private help-link-options
  #{:metabase :hidden :custom})

(defsetting help-link
  (deferred-tru
   (str
    "Keyword setting to control whitelabeling of the help link. Valid values are `:metabase`, `:hidden`, and "
    "`:custom`. If `:custom` is set, the help link will use the URL specified in the `help-link-custom-destination`, "
    "or be hidden if it is not set."))
  :type       :keyword
  :audit      :getter
  :visibility :public
  :feature    :whitelabel
  :default    :metabase
  :setter     (fn [value]
                (when-not (help-link-options (keyword value))
                  (throw (ex-info (tru "Invalid help link option")
                                  {:value value
                                   :valid-options help-link-options})))
                (setting/set-value-of-type! :keyword :help-link value)))

(defn- validate-help-url
  "Checks that the provided URL is either a valid HTTP/HTTPS URL or a `mailto:` link. Returns `nil` if the input is valid;
  throws an exception if it is not."
  [url]
  (let [validation-exception (ex-info (tru "Please make sure this is a valid URL")
                                      {:url url})]
    (if-let [matches (re-matches #"^mailto:(.*)" url)]
      (when-not (u/email? (second matches))
        (throw validation-exception))
      (when-not (u/url? url)
        (throw validation-exception)))))

(defsetting help-link-custom-destination
  (deferred-tru "Custom URL for the help link.")
  :encryption :no
  :visibility :public
  :type       :string
  :audit      :getter
  :default   "https://www.metabase.com/help/premium"
  :feature    :whitelabel
  :setter     (fn [new-value]
                (let [new-value-string (str new-value)]
                  (validate-help-url new-value-string)
                  (setting/set-value-of-type! :string :help-link-custom-destination new-value-string))))

(defsetting show-metabase-links
  (deferred-tru "Whether or not to display Metabase links outside admin settings.")
  :type       :boolean
  :default    true
  :visibility :public
  :audit      :getter
  :feature    :whitelabel)

(def avaialable-number-separators
  "Number separators that are available to use in uploads csv parsing. Values match what is implemented
  `metabase.upload.types` namespace, specifically e.g. [[metabase.upload.types/int-regex]]."
  #{"."
    ".,"
    ",."
    ", "
    ".’"})

(defn- validate-custom-formatting!
  [new-value]
  (when-some [separators (some-> new-value :type/Number :number_separators)]
    (when-not (avaialable-number-separators separators)
      (throw (ex-info (tru "Invalid number separators.")
                      {:separators separators
                       :available-separators avaialable-number-separators})))))

(defsetting custom-formatting
  (deferred-tru "Object keyed by type, containing formatting settings")
  :encryption :no
  :type       :json
  :export?    true
  :default    {}
  :visibility :public
  :audit      :getter
  :setter     (fn [new-value]
                (validate-custom-formatting! new-value)
                (setting/set-value-of-type! :json :custom-formatting new-value)))

(defsetting show-homepage-data
  (deferred-tru
   (str "Whether or not to display data on the homepage. "
        "Admins might turn this off in order to direct users to better content than raw data"))
  :type       :boolean
  :default    true
  :visibility :authenticated
  :export?    true
  :audit      :getter)

(defsetting show-homepage-pin-message
  (deferred-tru
   (str "Whether or not to display a message about pinning dashboards. It will also be hidden if any dashboards are "
        "pinned. Admins might hide this to direct users to better content than raw data"))
  :type       :boolean
  :default    true
  :visibility :authenticated
  :export?    true
  :doc        false
  :audit      :getter)

;; This is used by the embedding homepage
(defsetting example-dashboard-id
  (deferred-tru "The ID of the example dashboard.")
  :visibility :authenticated
  :export?    false
  :type       :integer
  :setter     :none
  :getter     (fn []
                (let [id (setting/get-value-of-type :integer :example-dashboard-id)]
                  (when (and id (t2/exists? :model/Dashboard :id id :archived false))
                    id)))
  :doc        false)

(def ^:private autocomplete-matching-options
  "Valid options for the autocomplete types. Can match on a substring (\"%input%\"), on a prefix (\"input%\"), or reject
  autocompletions. Large instances with lots of fields might want to use prefix matching or turn off the feature if it
  causes too many problems."
  #{:substring :prefix :off})

(defsetting native-query-autocomplete-match-style
  (deferred-tru
   (str "Matching style for native query editor''s autocomplete. Can be \"substring\", \"prefix\", or \"off\". "
        "Larger instances can have performance issues matching using substring, so can use prefix matching, "
        " or turn autocompletions off."))
  :visibility :public
  :export?    true
  :type       :keyword
  :default    :substring
  :audit      :raw-value
  :setter     (fn [v]
                (let [v (cond-> v (string? v) keyword)]
                  (if (autocomplete-matching-options v)
                    (setting/set-value-of-type! :keyword :native-query-autocomplete-match-style v)
                    (throw (ex-info (tru "Invalid `native-query-autocomplete-match-style` option")
                                    {:option v
                                     :valid-options autocomplete-matching-options}))))))
