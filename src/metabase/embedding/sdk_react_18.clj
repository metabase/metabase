(ns metabase.embedding.sdk-react-18
  "Records the host apps that use the React embedding SDK with React 18, so admins can update them before Metabase 66
  drops React 18. Temporary: it goes away with React 18 support."
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.analytics.core :as analytics]
   [metabase.batch-processing.core :as grouper]
   [metabase.embedding.db :as embedding.db]
   [metabase.embedding.util :as embedding.util]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(def ^:private save-interval-seconds 60)

(defn last-seen-cutoff
  "Hosts last seen before this time are expired."
  []
  (t/minus (t/offset-date-time) (t/days 4)))

(def ^:private loopback-hosts #{"localhost" "127.0.0.1" "[::1]"})

(defn- react-18-sdk-request? [{:keys [headers] :as request}]
  (and (embedding.util/has-react-sdk-header? request)
       (some-> (get headers "x-metabase-client-react-version") (str/starts-with? "18."))))

(defn- record-host? [{:keys [headers request-method uri metabase-user-id]} {:keys [status]}]
  (and (= request-method :get)
       (int? status)
       (<= 200 status 299)
       (not= (get headers "x-metabase-embedded-preview") "true")
       ;; `/api/embed/` endpoints validate the guest token before they return a 2xx
       (or (some? metabase-user-id)
           (str/starts-with? uri "/api/embed/"))))

(defn- save-hosts!
  "Save the hosts submitted since the last save, each one with the newest time it was seen."
  [submitted]
  (try
    ;; Delete first: an expired row of a host goes away here, so another server's delete cannot remove it between
    ;; the SELECT and the UPDATE of the upsert.
    (embedding.db/delete-sdk-react-18-hosts-last-seen-before! (last-seen-cutoff))
    (catch Throwable e
      (log/warn e "Failed to delete the expired hosts that use the React embedding SDK with React 18")))
  (doseq [[host seen] (group-by :host submitted)]
    (try
      (embedding.db/save-sdk-react-18-host! host (apply t/max (map :timestamp seen)))
      (catch Throwable e
        (log/warn e "Failed to save a host that uses the React embedding SDK with React 18")))))

(defonce ^:private save-hosts-queue
  (delay (grouper/start! #'save-hosts!
                         :capacity 500
                         :interval (* save-interval-seconds 1000))))

(defn- maybe-record-host! [request response]
  (when (record-host? request response)
    ;; "" groups the host apps whose page URL has no hostname, e.g. an Electron app on file://
    (let [host (or (some-> (analytics/extract-hostname (get-in request [:headers "x-metabase-embed-referrer"]))
                           u/lower-case-en)
                   "")]
      (when-not (contains? loopback-hosts host)
        (grouper/submit! @save-hosts-queue {:host host, :timestamp (t/offset-date-time)})))))

(defn wrap-record-react-18-sdk-host
  "Ring middleware that saves the host apps that use the React embedding SDK with React 18. It must run after
  `wrap-current-user-info`, because it reads the `:metabase-user-id` that the auth middleware sets."
  [handler]
  (fn [request respond raise]
    (if-not (react-18-sdk-request? request)
      (handler request respond raise)
      (handler request
               (fn [response]
                 (try
                   (maybe-record-host! request response)
                   (catch Throwable e
                     (log/warn e "Failed to record a host that uses the React embedding SDK with React 18")))
                 (respond response))
               raise))))
