(ns metabase-enterprise.whitelabeling.settings
  (:require
   [metabase.models.setting :as setting :refer [defsetting]]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n :refer [deferred-tru tru]]))

(set! *warn-on-reflection* true)

(def ^:private help-link-options
  #{:metabase :hidden :custom})

(defsetting help-link
  (deferred-tru
   (str
    "Keyword setting to control whitelabeling of the help link. Valid values are `:metabase`, `:hidden`, and "
    "`:custom`. If `:custom` is set, the help link will use the URL specified in the `help-link-custom-destination`, "
    "or be hidden if it is not set."))
  :default    :default
  :type       :keyword
  :audit      :getter
  :visibility :public
  :feature    :whitelabeling
  :default    :metabase
  :setter     (fn [value]
                (when-not (help-link-options value)
                  (throw (ex-info (tru "Invalid help link option")
                                  {:value value
                                   :valid-options help-link-options})))
                (setting/set-value-of-type! :keyword :help-link value)))

(defn- validate-help-url
  "Checks that the provided URL is either a valid HTTP/HTTPS URL or a `mailto:` link. Returns `nil` if the input is valid;
  throws an exception if it is not."
  [url]
  (if-let [matches (re-matches #"^mailto:(.*)" url)]
    (when-not (u/email? (second matches))
      (throw (ex-info (tru "Invalid email address in mailto: link")
                      {:url url})))
    (when-not (u/url? url)
      (throw (ex-info (tru "Invalid URL")
                      {:url url})))))

(defsetting help-link-custom-destination
  (deferred-tru "Custom URL for the help link.")
  :type       :string
  :visibility :public
  :audit      :getter
  :feature    :whitelabeling
  :setter     (fn [new-value]
                (let [new-value-string (str new-value)]
                 (validate-help-url new-value-string)
                 (setting/set-value-of-type! :string :help-link-custom-destination new-value-string))))
