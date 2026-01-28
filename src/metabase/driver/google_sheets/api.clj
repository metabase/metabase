(ns metabase.driver.google-sheets.api
  "Google Sheets API client for Metabase driver."
  (:require
   [clj-http.client :as http]
   [clojure.data.json :as json]
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu])
  (:import
   (java.net URI)
   (java.time LocalDate LocalDateTime)))

(set! *warn-on-reflection* true)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             Configuration                                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private api-base-url "https://sheets.googleapis.com/v4/spreadsheets")

(defn- make-api-url
  "Construct API URL for spreadsheet."
  [spreadsheet-id & path-parts]
  (str api-base-url "/" spreadsheet-id (when (seq path-parts) "/") (str/join "/" path-parts)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             Authentication                                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- get-access-token
  "Get access token from service account JSON."
  [service-account-json]
  ;; TODO: Implement JWT token generation for service accounts
  ;; For now, return API key if provided
  nil)

(defn- make-request-headers
  "Create request headers with authentication."
  [api-key service-account-json]
  (cond
    api-key {"Authorization" (str "Bearer " api-key)}
    service-account-json (let [token (get-access-token service-account-json)]
                           (when token
                             {"Authorization" (str "Bearer " token)}))
    :else {}))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             API Client Functions                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn get-spreadsheet-info
  "Get spreadsheet metadata."
  [spreadsheet-id api-key service-account-json]
  (try
    (let [url (make-api-url spreadsheet-id)
          headers (make-request-headers api-key service-account-json)
          response (http/get url {:headers headers
                                  :as :json})]
      (when (= 200 (:status response))
        (:body response)))
    (catch Exception e
      (log/errorf e "Failed to get spreadsheet info for %s: %s" spreadsheet-id (ex-message e))
      nil)))

(defn get-sheet-names
  "Get list of sheet names from spreadsheet."
  [spreadsheet-id api-key service-account-json]
  (try
    (let [info (get-spreadsheet-info spreadsheet-id api-key service-account-json)]
      (when info
        (->> (:sheets info)
             (map :properties)
             (map :title))))
    (catch Exception e
      (log/errorf e "Failed to get sheet names for %s: %s" spreadsheet-id (ex-message e))
      nil)))

(defn get-sheet-data
  "Get data from a specific sheet."
  [spreadsheet-id sheet-name api-key service-account-json]
  (try
    (let [url (make-api-url spreadsheet-id "values" (str sheet-name "!A:Z"))
          headers (make-request-headers api-key service-account-json)
          response (http/get url {:headers headers
                                  :as :json})]
      (when (= 200 (:status response))
        (:values (:body response))))
    (catch Exception e
      (log/errorf e "Failed to get sheet data for %s/%s: %s" spreadsheet-id sheet-name (ex-message e))
      nil)))

(defn parse-cell-value
  "Parse cell value based on type inference."
  [value]
  (cond
    (nil? value) nil
    (str/blank? value) nil
    :else (try
            ;; Try to parse as number
            (if (re-matches #"^-?\d+(\.\d+)?$" value)
              (Double/parseDouble value)
              ;; Try to parse as boolean
              (cond
                (#{"true" "TRUE" "True" "да" "ДА" "Да"} value) true
                (#{"false" "FALSE" "False" "нет" "НЕТ" "Нет"} value) false
                ;; Try to parse as date
                (re-matches #"^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?$" value)
                (try
                  (if (str/includes? value "T")
                    (t/local-date-time (t/formatter "yyyy-MM-dd'T'HH:mm:ss") value)
                    (t/local-date (t/formatter "yyyy-MM-dd") value))
                  (catch Exception _ value))
                :else value))
            (catch Exception _ value))))

(defn sheet-data->rows
  "Convert sheet data to rows with proper types."
  [sheet-data]
  (when sheet-data
    (let [headers (first sheet-data)
          data-rows (rest sheet-data)]
      (->> data-rows
           (map (fn [row]
                  (zipmap headers
                          (map parse-cell-value
                               (concat row (repeat (count headers) nil))))))))))

(defn get-spreadsheet-rows
  "Get rows from spreadsheet with type conversion."
  [spreadsheet-id sheet-name api-key service-account-json]
  (-> (get-sheet-data spreadsheet-id sheet-name api-key service-account-json)
      (sheet-data->rows)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             Data Transformation                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- normalize-column-name
  "Normalize column name for Metabase."
  [column-name]
  (-> column-name
      (str/lower-case)
      (str/replace #"\s+" "_")
      (str/replace #"[^a-z0-9_]" "")))

(defn infer-schema-from-data
  "Infer schema from sample data."
  [rows]
  (when (seq rows)
    (let [sample-rows (take 100 rows)
          column-names (keys (first sample-rows))]
      (->> column-names
           (map (fn [col-name]
                  (let [values (map #(get % col-name) sample-rows)
                        non-nil-values (remove nil? values)]
                    {:name (normalize-column-name col-name)
                     :original-name col-name
                     :sample-values (take 5 values)
                     :type (cond
                             (empty? non-nil-values) :type/Text
                             (every? number? non-nil-values) :type/Number
                             (every? #(instance? Boolean %) non-nil-values) :type/Boolean
                             (every? #(instance? LocalDate %) non-nil-values) :type/Date
                             (every? #(instance? LocalDateTime %) non-nil-values) :type/DateTime
                             :else :type/Text)})))
           (vec)))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             Cache Management                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private cache (atom {}))

(defn- cache-key
  "Generate cache key for spreadsheet data."
  [spreadsheet-id sheet-name]
  (str spreadsheet-id ":" sheet-name))

(defn get-cached-data
  "Get data from cache or fetch fresh."
  [spreadsheet-id sheet-name api-key service-account-json ttl-seconds]
  (let [key (cache-key spreadsheet-id sheet-name)
        now (System/currentTimeMillis)
        cached (get @cache key)]
    (if (and cached
             (< (- now (:timestamp cached)) (* ttl-seconds 1000)))
      (:data cached)
      (let [data (get-spreadsheet-rows spreadsheet-id sheet-name api-key service-account-json)]
        (swap! cache assoc key {:data data :timestamp now})
        data))))

(defn clear-cache
  "Clear cache for specific spreadsheet or all."
  ([]
   (reset! cache {}))
  ([spreadsheet-id sheet-name]
   (swap! cache dissoc (cache-key spreadsheet-id sheet-name))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             Error Handling                                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn handle-api-error
  "Handle API errors gracefully."
  [response]
  (let [status (:status response)
        body (:body response)]
    (case status
      403 (throw (ex-info "Access denied to Google Sheets. Check API key or permissions." 
                          {:status status :body body}))
      404 (throw (ex-info "Spreadsheet not found. Check the URL." 
                          {:status status :body body}))
      429 (throw (ex-info "Rate limit exceeded. Try again later." 
                          {:status status :body body}))
      (throw (ex-info (str "Google Sheets API error: " status) 
                      {:status status :body body})))))

(comment
  ;; Example usage
  (get-spreadsheet-info "1v1aXMDfc9gruLnmJBlVVxRO7Ahila87j9lzEA5Zcj2E" nil nil)
  
  (get-sheet-names "1v1aXMDfc9gruLnmJBlVVxRO7Ahila87j9lzEA5Zcj2E" nil nil)
  
  (get-spreadsheet-rows "1v1aXMDfc9gruLnmJBlVVxRO7Ahila87j9lzEA5Zcj2E" "Sheet1" nil nil))