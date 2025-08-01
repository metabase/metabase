(ns metabase-enterprise.worker.api
  (:require
   [clj-http.client :as http]
   [metabase-enterprise.transforms.util :as transforms.util]
   [metabase.config.core :as config]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.lib.schema.common :as schema.common]
   [metabase.sync.core :as sync]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(defn- json-body [{:keys [body]}]
  (json/decode+kw body))

(defn- worker-uri []
  (config/config-str :mb-transform-worker-uri))

(defn- worker-route [^String path]
  (when-let [base-uri (worker-uri)]
    (-> base-uri
        java.net.URI.
        (.resolve path)
        str)))

(defn run-remote?
  "Should this metabase instance run work remotely?"
  []
  (boolean (worker-uri)))

(defn execute-transform!
  "Execute a transform on the remote worker."
  [mb-id run-id driver transform-details opts]
  (json-body (http/put (worker-route (str "/transform/" run-id))
                       {:form-params {:driver driver
                                      :transform-details transform-details
                                      :opts opts
                                      :mb-source mb-id}
                        :content-type :json})))

(defn get-status [run-id]
  (json-body (http/get (worker-route (str "/status/" run-id))
                       {:content-type :json})))
