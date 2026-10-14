(ns metabase.embedding.sdk-react-18
  "Records the host apps that use the React embedding SDK with React 18, so admins can update them before Metabase 66
  drops React 18. Temporary: it goes away with React 18 support."
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.analytics.core :as analytics]
   [metabase.embedding.db :as embedding.db]
   [metabase.embedding.util :as embedding.util]
   [metabase.util :as u]
   [metabase.util.jvm :as u.jvm]
   [metabase.util.log :as log]))

(def ^:private max-hosts-per-hour 50)

(defn last-seen-cutoff
  "Hosts last seen before this time are expired."
  []
  (t/minus (t/offset-date-time) (t/days 4)))

(def ^:private loopback-hosts #{"localhost" "127.0.0.1" "[::1]"})

;; The hosts this server already queued to save in the current hour, so it writes each host at most once an hour.
(defonce ^:private hosts-this-hour (atom {:hour nil, :hosts #{}}))

(defn- first-this-hour?
  "Return true (and remember `host` for `hour`) the first time this server sees `host` in `hour`, otherwise false."
  [host hour]
  (let [[before after] (swap-vals! hosts-this-hour
                                   (fn [state]
                                     (let [hosts (if (= hour (:hour state)) (:hosts state) #{})]
                                       (if (or (contains? hosts host)
                                               (>= (count hosts) max-hosts-per-hour))
                                         state
                                         {:hour hour, :hosts (conj hosts host)}))))]
    (not (identical? before after))))

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

(defn- save-host! [host seen-at]
  (try
    ;; Delete first: an expired row of this host goes away here, so another server's delete cannot remove it between
    ;; the SELECT and the UPDATE of the upsert.
    (embedding.db/delete-sdk-react-18-hosts-last-seen-before! (last-seen-cutoff))
    (embedding.db/save-sdk-react-18-host! host seen-at)
    (catch Exception e
      (log/warn e "Failed to save a host that uses the React embedding SDK with React 18"))))

(defn- maybe-record-host! [request response]
  (when (record-host? request response)
    ;; "" groups the host apps whose page URL has no hostname, e.g. an Electron app on file://
    (let [host    (or (some-> (analytics/extract-hostname (get-in request [:headers "x-metabase-embed-referrer"]))
                              u/lower-case-en)
                      "")
          seen-at (t/offset-date-time)]
      (when (and (not (contains? loopback-hosts host))
                 (first-this-hour? host (t/truncate-to (t/instant) :hours)))
        (u.jvm/in-virtual-thread*
         (save-host! host seen-at))))))

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
