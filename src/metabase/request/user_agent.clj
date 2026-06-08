(ns metabase.request.user-agent
  "Parsing and formatting of User-Agent strings."
  (:require
   [clojure.string :as str]
   [metabase.util.i18n :refer [tru]]
   [user-agent :as user-agent]))

(defn describe-user-agent
  "Format a user-agent string from a request in a human-friendly way."
  [user-agent-string]
  (when-not (str/blank? user-agent-string)
    (when-let [{device-type     :type-name
                {os-name :name} :os
                browser-name    :name} (some-> user-agent-string user-agent/parse not-empty)]
      (let [non-blank    (fn [s]
                           (when-not (str/blank? s)
                             s))
            device-type  (or (non-blank device-type)
                             (tru "Unknown device type"))
            os-name      (or (non-blank os-name)
                             (tru "Unknown OS"))
            browser-name (or (non-blank browser-name)
                             (tru "Unknown browser"))]
        (format "%s (%s/%s)" device-type browser-name os-name)))))
