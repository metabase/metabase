(ns metabase.pulse.parameters
  "Utilities for processing parameters for inclusion in dashboard subscriptions."
  (:require [clojure.string :as str]
            [metabase.pulse.interface :as i]
            [metabase.plugins.classloader :as classloader]
            [metabase.util :as u]
            [metabase.util.urls :as url]))

(def ^:private parameters-impl
  (u/prog1 (or (u/ignore-exceptions
                 (classloader/require 'metabase-enterprise.pulse)
                 (some-> (resolve 'metabase-enterprise.pulse/ee-strategy-parameters-impl)
                         var-get))
               i/default-parameters-impl)))

(defn parameters
  "Returns the list of parameters applied to a dashboard subscription"
  [subscription dashboard]
  (i/the-parameters parameters-impl subscription dashboard))

(defn value-string
  "Returns the value of a dashboard filter as a comma-separated string"
  [parameter]
  (let [values (u/one-or-many (or (:value parameter) (:default parameter)))]
    (str/join ", " values)))

(defn dashboard-url
  "Given a dashboard and subscription, returns a URL for the dashboard with filters included"
  [subscription dashboard]
  (let [base-url       (url/dashboard-url (:id dashboard))
        parameters (parameters subscription dashboard)
        url-params     (flatten
                        (for [param parameters]
                          (for [value (u/one-or-many (or (:value param) (:default param)))]
                            (str (:slug param) "=" value))))]
    (str base-url (when (seq url-params)
                    (str "?" (str/join "&" url-params))))))
