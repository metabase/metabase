(ns metabase.starrez.client
  "HTTP client for the StarRez REST API.

  Authentication uses HTTP Basic Auth: username + REST token (as password).
  Tables are fetched via /services/Select/{Table} with _top/_skip pagination.
  Reports are fetched via /services/getreport/{IdOrName}.{format}."
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [metabase.starrez.settings :as starrez.settings]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private page-size 1000)
(def ^:private timeout-ms 60000)
(def ^:private max-records-per-table 5000000)

(defn- base-url []
  (some-> (starrez.settings/starrez-api-url) (str/replace #"/+$" "")))

(defn- request-opts
  "Common clj-http options including Basic Auth credentials."
  []
  {:basic-auth         [(starrez.settings/starrez-api-username)
                        (starrez.settings/starrez-api-token)]
   :socket-timeout     timeout-ms
   :connection-timeout timeout-ms
   :throw-exceptions   false})

(defn- table-url [table]
  (when-let [base (base-url)]
    (str base "/services/Select/" table)))

(defn- report-url [report-id format]
  (when-let [base (base-url)]
    (str base "/services/getreport/" report-id "." (name format))))

(defn- missing-config-error []
  (cond
    (str/blank? (starrez.settings/starrez-api-url))      "StarRez Base URL is not configured"
    (str/blank? (starrez.settings/starrez-api-username)) "StarRez API Username is not configured"
    (str/blank? (starrez.settings/starrez-api-token))    "StarRez REST Token is not configured"
    :else                                                nil))

(defn- error-response?
  "StarRez returns errors as a 1-element array containing a map with a `:description` key.
  This detects that and avoids treating an error as a single data record."
  [body]
  (and (sequential? body)
       (= 1 (count body))
       (let [r (first body)]
         (and (map? r)
              (contains? r :description)
              (not (contains? r :EntryID))
              (not (contains? r :PersonID))
              (not (contains? r :BookingID))))))

(defn test-connection
  "Test connectivity to the StarRez REST API.
  Returns {:ok true} or {:ok false :error message}."
  []
  (if-let [err (missing-config-error)]
    {:ok false :error err}
    (try
      (let [resp (http/get (table-url "Entry")
                           (assoc (request-opts)
                                  :headers      {"Accept" "application/json"}
                                  :query-params {"_pageSize" 1 "_pageIndex" 0}
                                  :as           :json))]
        (cond
          (not (<= 200 (or (:status resp) 0) 299))
          {:ok    false
           :error (str "StarRez API returned HTTP " (:status resp)
                       (when-let [body (:body resp)] (str " — " (pr-str body))))}

          (error-response? (:body resp))
          {:ok    false
           :error (or (-> resp :body first :description)
                      "StarRez returned an error response")}

          :else
          {:ok true :message "Connected to StarRez REST API successfully"}))
      (catch Exception e
        {:ok false :error (ex-message e)}))))

(defn- fetch-page
  "Fetch a single page of records from a StarRez table using _pageIndex/_pageSize.
  `_pageIndex` is a zero-based offset (NOT a page number).
  Returns a sequence of maps. Empty vector indicates end-of-data or error."
  [table offset]
  (try
    (let [resp (http/get (table-url table)
                         (assoc (request-opts)
                                :headers      {"Accept" "application/json"}
                                :query-params {"_pageSize"  page-size
                                               "_pageIndex" offset}
                                :as           :json))]
      (cond
        (not (<= 200 (or (:status resp) 0) 299))
        (do (log/warnf "StarRez API returned %s fetching %s offset=%d body=%s"
                       (:status resp) table offset (pr-str (:body resp)))
            [])

        (error-response? (:body resp))
        (do (log/warnf "StarRez returned error fetching %s offset=%d: %s"
                       table offset (-> resp :body first :description))
            [])

        :else
        (let [body (:body resp)]
          (cond
            (sequential? body) body
            (map? body)        [body]
            :else              []))))
    (catch Exception e
      (log/errorf e "Error fetching StarRez table=%s offset=%d" table offset)
      [])))

(defn fetch-table-data
  "Fetch all records from a StarRez table, paginating with _pageIndex/_pageSize.
  Returns an empty vector if the StarRez integration is not fully configured.
  Bounded by `max-records-per-table` to prevent runaway loops."
  [table & [_opts]]
  (if (missing-config-error)
    (do (log/warnf "Skipping StarRez fetch: %s" (missing-config-error)) [])
    (loop [offset      0
           all-records (transient [])]
      (log/infof "Fetching StarRez table=%s offset=%d (so far=%d)"
                 table offset (count all-records))
      (let [records (fetch-page table offset)
            n       (count records)]
        (cond
          (zero? n)
          (persistent! all-records)

          (>= (+ offset n) max-records-per-table)
          (do (log/warnf "Hit max-records-per-table=%d for %s; truncating"
                         max-records-per-table table)
              (persistent! (reduce conj! all-records records)))

          (< n page-size)
          (persistent! (reduce conj! all-records records))

          :else
          (recur (+ offset page-size)
                 (reduce conj! all-records records)))))))

(defn fetch-report-csv
  "Fetch a StarRez report by ID (or name) as CSV.
  Returns the CSV string body, or nil on error."
  [report-id]
  (if (missing-config-error)
    (do (log/warnf "Skipping StarRez report fetch: %s" (missing-config-error)) nil)
    (try
      (let [resp (http/get (report-url report-id :csv)
                           (assoc (request-opts) :as :string))]
        (if (<= 200 (or (:status resp) 0) 299)
          (:body resp)
          (do
            (log/warnf "StarRez report %s returned HTTP %s body=%s"
                       report-id (:status resp) (pr-str (:body resp)))
            nil)))
      (catch Exception e
        (log/errorf e "Error fetching StarRez report=%s" report-id)
        nil))))
