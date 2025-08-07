(ns metabase-enterprise.worker.api
  (:require
   [clj-http.client :as http]
   [metabase.config.core :as config]
   [metabase.system.core :as system]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(defn- mb-id []
  (system/site-uuid))

(defn- json-body [{:keys [body]}]
  (json/decode+kw body))

(defn- worker-uri []
  (config/config-str :mb-transform-worker-uri))

(defn- worker-route [^String path]
  (assert (worker-uri) "Env var MB_TRANSFORM_WORKER_URI must be set.")
  (-> (worker-uri)
      java.net.URI.
      (.resolve path)
      str))

(defn run-remote?
  "Should this metabase instance run work remotely?"
  []
  (boolean (worker-uri)))

(defn execute-transform!
  "Execute a transform on the remote worker."
  [run-id driver transform-details opts]
  (json-body (http/put (worker-route (str "/transform/" run-id))
                       {:form-params {:driver driver
                                      :transform-details transform-details
                                      :opts opts
                                      :mb-source (mb-id)}
                        :content-type :json})))

(defn get-status [run-id]
  (json-body (http/get (worker-route (str "/status/" run-id "?mb-source=" (mb-id)))
                       {:content-type :json})))

(defn cancel!
  "cancel on the remote worker."
  [run-id]
  (:body (http/post (worker-route (str "/cancel/" run-id "?mb-source=" (mb-id))))))

(defn health-check []
  (:body (http/get (worker-route "/api/health"))))

(comment

  (health-check))
