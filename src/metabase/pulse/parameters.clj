(ns metabase.pulse.parameters
  "Utilities for processing parameters for inclusion in dashboard subscriptions."
  (:require [clojure.string :as str]
            [metabase.public-settings.premium-features :refer [defenterprise]]
            [metabase.util :as u]
            [metabase.util.urls :as urls]
            [ring.util.codec :as codec]))

(defenterprise the-parameters
  "OSS way of getting filter parameters for a dashboard subscription"
  metabase-enterprise.pulse
  [_pulse dashboard]
  (:parameters dashboard))

(defn parameters
  "Returns the list of parameters applied to a dashboard subscription, filtering out ones
  without a value"
  [subscription dashboard]
  (filter
   #(or (:value %) (:default %))
   (the-parameters subscription dashboard)))

(defn value-string
  "Returns the value of a dashboard filter as a comma-separated string"
  [parameter]
  (let [values (u/one-or-many (or (:value parameter) (:default parameter)))]
    (str/join ", " values)))

(defn dashboard-url
  "Given a dashboard's ID and parameters, returns a URL for the dashboard with filters included"
  [dashboard-id parameters]
  (let [base-url   (urls/dashboard-url dashboard-id)
        url-params (flatten
                    (for [param parameters]
                      (for [value (u/one-or-many (or (:value param) (:default param)))]
                        (str (codec/url-encode (:slug param))
                             "="
                             (codec/url-encode value)))))]
    (str base-url (when (seq url-params)
                    (str "?" (str/join "&" url-params))))))
