(ns metabase-enterprise.metabot-v3.feedback
  "Shared feedback submission to Harbormaster via the Store API."
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [metabase.premium-features.core :as premium-features]
   [metabase.store-api.core :as store-api]
   [metabase.util.json :as json]))

(defn submit-to-harbormaster!
  "Submit metabot feedback to Harbormaster via the Store API.
   Returns true if feedback was submitted, false if token/URL is missing."
  [feedback]
  (let [token    (premium-features/premium-embedding-token)
        base-url (store-api/store-api-url)]
    (if (or (str/blank? token) (str/blank? base-url))
      false
      (do (http/post (str base-url "/api/v2/metabot/feedback/" token)
                     {:content-type :json
                      :body         (json/encode feedback)})
          true))))
