(ns metabase.pulse.parameters
  "Utilities for processing parameters for inclusion in dashboard subscriptions."
  (:require [clojure.string :as str]
            [metabase.plugins.classloader :as classloader]
            [metabase.pulse.interface :as i]
            [metabase.util :as u]
            [metabase.util.urls :as url]
            [ring.util.codec :as codec]))

(def ^:private parameters-impl
  (u/prog1 (or (u/ignore-exceptions
                 (classloader/require 'metabase-enterprise.pulse)
                 (some-> (resolve 'metabase-enterprise.pulse/ee-strategy-parameters-impl)
                         var-get))
               i/default-parameters-impl)))

(defn parameters
  "Returns the list of parameters applied to a dashboard subscription, filtering out ones
  without a value"
  [subscription dashboard]
  (filter
   #(or (:value %) (:default %))
   (i/the-parameters parameters-impl subscription dashboard)))

(defn value-string
  "Returns the value of a dashboard filter as a comma-separated string"
  [parameter]
  (let [values (u/one-or-many (or (:value parameter) (:default parameter)))]
    (str/join ", " values)))

(defn dashboard-url
  "Given a dashboard's ID and parameters, returns a URL for the dashboard with filters included"
  [dashboard-id parameters]
  (let [base-url   (url/dashboard-url dashboard-id)
        url-params (flatten
                    (for [param parameters]
                      (for [value (u/one-or-many (or (:value param) (:default param)))]
                        (str (codec/url-encode (:slug param))
                             "="
                             (codec/url-encode value)))))]
    (str base-url (when (seq url-params)
                    (str "?" (str/join "&" url-params))))))
