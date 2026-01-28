(ns metabase.driver.google-sheets
  "Driver for Google Sheets as a data source."
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.driver :as driver]
   [metabase.driver-api.core :as driver-api]
   [metabase.driver.common :as driver.common]
   [metabase.driver.google-sheets.api :as gs-api]
   [metabase.driver.google-sheets.comments :as comments]
   [metabase.driver.settings :as driver.settings]
   [metabase.query-processor.store :as qp.store]
   [metabase.sync.interface :as sync.i]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu])
  (:import
   (java.net URI)
   (java.time LocalDate LocalDateTime OffsetDateTime)))

(set! *warn-on-reflection* true)

;;; Register the driver
(driver/register! :google-sheets, :parent :sql)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             Driver Features                                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(doseq [[feature supported?] {:basic-aggregations           true
                              :binning                      true
                              :breakout                     true
                              :expression-aggregations      false
                              :expressions                  true
                              :foreign-keys                 false
                              :full-join                    false
                              :left-join                    false
                              :native-parameters            true
                              :nested-queries               true
                              :nested-field-columns         false
                              :now                          true
                              :percentile-aggregations      false
                              :regex                        true
                              :standard-deviation-aggregations false
                              :test/jvm-timezone-setting    false
                              :window-functions             false
                              :uploads                      false
                              :actions                      false
                              :actions/custom               false
                              :actions/data-editing         false
                              :database-routing             false
                              :metadata/table-existence-check true}]
  (defmethod driver/database-supports? [:google-sheets feature]
    [_driver _feature _database]
    supported?))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             Connection Properties                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod driver/connection-properties :google-sheets
  [_]
  (->>
   [{:name         "spreadsheet-url"
     :display-name (tru "Spreadsheet URL")
     :helper-text  (deferred-tru "The full URL to the Google Spreadsheet. Example: https://docs.google.com/spreadsheets/d/1v1aXMDfc9gruLnmJBlVVxRO7Ahila87j9lzEA5Zcj2E/edit")
     :placeholder  "https://docs.google.com/spreadsheets/d/..."
     :required     true}
    {:name         "sheet-name"
     :display-name (tru "Sheet Name")
     :helper-text  (deferred-tru "The name of the sheet/tab within the spreadsheet. Leave empty for the first sheet.")
     :placeholder  "Sheet1"
     :required     false}
    {:name         "api-key"
     :display-name (tru "API Key")
     :helper-text  (deferred-tru "Google Sheets API key for accessing the spreadsheet. Required for public spreadsheets.")
     :placeholder  "AIzaSy..."
     :required     false
     :type         :password}
    {:name         "service-account-json"
     :display-name (tru "Service Account JSON")
     :helper-text  (deferred-tru "Service account JSON key for accessing private spreadsheets. Paste the entire JSON content.")
     :placeholder  "{\"type\": \"service_account\", ...}"
     :required     false
     :type         :text}
    {:name         "cache-ttl"
     :display-name (tru "Cache TTL (seconds)")
     :helper-text  (deferred-tru "How long to cache spreadsheet data in seconds. Default: 300 (5 minutes).")
     :placeholder  "300"
     :default      "300"
     :required     false}
    {:name         "redis-url"
     :display-name (tru "Redis URL")
     :helper-text  (deferred-tru "Redis connection URL for caching and fast data access. Example: redis://localhost:6379")
     :placeholder  "redis://localhost:6379"
     :default      "redis://localhost:6379"
     :required     false}
    {:name         "sync-interval"
     :display-name (tru "Sync Interval (minutes)")
     :helper-text  (deferred-tru "How often to sync data from Google Sheets in minutes. Default: 60.")
     :placeholder  "60"
     :default      "60"
     :required     false}
    driver.common/advanced-options-start
    driver.common/default-advanced-options]
   (into [] (mapcat u/one-or-many))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             Connection Details                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- extract-spreadsheet-id
  "Extract spreadsheet ID from URL."
  [url]
  (try
    (let [uri (URI. url)
          path (.getPath uri)
          parts (str/split path #"/")]
      (when (>= (count parts) 4)
        (nth parts 3)))
    (catch Exception e
      (log/errorf e "Failed to parse spreadsheet URL: %s" url)
      nil)))

(defn- extract-sheet-id
  "Extract sheet ID from URL if present."
  [url]
  (try
    (let [uri (URI. url)
          query (.getQuery uri)]
      (when query
        (let [params (->> (str/split query #"&")
                          (map #(str/split % #"="))
                          (into {}))]
          (get params "gid"))))
    (catch Exception e
      (log/errorf e "Failed to extract sheet ID from URL: %s" url)
      nil)))

(defmethod driver/display-name :google-sheets [_] "Google Sheets")

(defmethod driver/can-connect? :google-sheets
  [driver details]
  (try
    (let [url (get details :spreadsheet-url)
          spreadsheet-id (extract-spreadsheet-id url)
          redis-url (get details :redis-url "redis://localhost:6379")]
      ;; Initialize Redis connection
      (when redis-url
        (comments/init-redis-pool redis-url))
      (and url spreadsheet-id (not (str/blank? spreadsheet-id))))
    (catch Exception e
      (log/errorf e "Failed to validate Google Sheets connection: %s" (ex-message e))
      false)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             Database Metadata                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod driver/describe-database :google-sheets
  [driver {:keys [details] :as database}]
  (let [url (get details :spreadsheet-url)
        spreadsheet-id (extract-spreadsheet-id url)
        sheet-name (get details :sheet-name "Sheet1")]
    {:name (or spreadsheet-id "Google Sheet")
     :tables [{:name sheet-name
               :schema nil
               :description (str "Google Sheet: " url)}]}))

(defmethod driver/describe-table :google-sheets
  [driver database table]
  (let [details (:details database)
        url (get details :spreadsheet-url)
        spreadsheet-id (extract-spreadsheet-id url)
        sheet-name (get details :sheet-name "Sheet1")]
    {:name sheet-name
     :schema nil
     :description (str "Google Sheet: " url)}))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             Field Metadata                                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- infer-field-type
  "Infer field type from sample values."
  [values]
  (let [non-nil-values (remove nil? values)
        sample-count (min 100 (count non-nil-values))]
    (cond
      (empty? non-nil-values) :type/Text
      (every? #(instance? LocalDate %) non-nil-values) :type/Date
      (every? #(instance? LocalDateTime %) non-nil-values) :type/DateTime
      (every? #(instance? OffsetDateTime %) non-nil-values) :type/DateTimeWithLocalTZ
      (every? number? non-nil-values) :type/Number
      (every? #(or (true? %) (false? %)) non-nil-values) :type/Boolean
      :else :type/Text)))

(defmethod driver/describe-table-fields :google-sheets
  [driver database table]
  (let [details (:details database)
        url (get details :spreadsheet-url)
        spreadsheet-id (extract-spreadsheet-id url)
        sheet-name (get details :sheet-name "Sheet1")
        api-key (get details :api-key)
        service-account-json (get details :service-account-json)
        cache-ttl (Integer/parseInt (get details :cache-ttl "300"))]
    (try
      ;; Try to get actual data from Google Sheets to infer schema
      (let [rows (gs-api/get-cached-data spreadsheet-id sheet-name api-key service-account-json cache-ttl)
            schema (when rows (gs-api/infer-schema-from-data rows))]
        (if (seq schema)
          (->> schema
               (map-indexed (fn [idx field]
                              {:name (:name field)
                               :database-type (case (:type field)
                                                :type/Number "DECIMAL"
                                                :type/Boolean "BOOLEAN"
                                                :type/Date "DATE"
                                                :type/DateTime "TIMESTAMP"
                                                "STRING")
                               :base-type (:type field)
                               :database-position idx
                               :semantic-type (case (:name field)
                                                "topic" :type/Category
                                                "date" :type/CreationTimestamp
                                                "author" :type/Author
                                                "text" :type/Description
                                                "address" :type/Address
                                                "has_response" :type/Boolean
                                                "district" :type/Category
                                                "settlement" :type/Category
                                                nil)
                               :description (str "Field from Google Sheets: " (:original-name field))})))
          ;; Fallback to default schema if no data
          [{:name "topic"
            :database-type "STRING"
            :base-type :type/Text
            :database-position 0
            :semantic-type :type/Category
            :description "Тема обращения"}
           {:name "date"
            :database-type "TIMESTAMP"
            :base-type :type/DateTime
            :database-position 1
            :semantic-type :type/CreationTimestamp
            :description "Дата обращения"}
           {:name "author"
            :database-type "STRING"
            :base-type :type/Text
            :database-position 2
            :semantic-type :type/Author
            :description "Автор комментария"}
           {:name "text"
            :database-type "STRING"
            :base-type :type/Text
            :database-position 3
            :semantic-type :type/Description
            :description "Текст обращения"}
           {:name "address"
            :database-type "STRING"
            :base-type :type/Text
            :database-position 4
            :semantic-type :type/Address
            :description "Адрес из обращения"}
           {:name "has_response"
            :database-type "BOOLEAN"
            :base-type :type/Boolean
            :database-position 5
            :semantic-type :type/Boolean
            :description "Есть ли ответ от официальных лиц"}
           {:name "district"
            :database-type "STRING"
            :base-type :type/Text
            :database-position 6
            :semantic-type :type/Category
            :description "Район"}
           {:name "settlement"
            :database-type "STRING"
            :base-type :type/Text
            :database-position 7
            :semantic-type :type/Category
            :description "Населенный пункт"}]))
      (catch Exception e
        (log/errorf e "Failed to describe table fields: %s" (ex-message e))
        ;; Return default schema on error
        []))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             Query Execution                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod driver/execute-query :google-sheets
  [driver {:keys [database query] :as full-query}]
  (let [details (:details database)
        url (get details :spreadsheet-url)
        spreadsheet-id (extract-spreadsheet-id url)
        sheet-name (get details :sheet-name "Sheet1")
        api-key (get details :api-key)
        service-account-json (get details :service-account-json)
        cache-ttl (Integer/parseInt (get details :cache-ttl "300"))
        redis-url (get details :redis-url "redis://localhost:6379")]
    
    ;; Initialize Redis if needed
    (when redis-url
      (comments/init-redis-pool redis-url))
    
    ;; Get data from Redis cache or Google Sheets
    (let [rows (gs-api/get-cached-data spreadsheet-id sheet-name api-key service-account-json cache-ttl)
          fields (driver/describe-table-fields driver database {:name sheet-name})
          
          ;; Apply filters from query if present
          filtered-rows (if-let [filters (:filter query)]
                          ;; TODO: Implement proper query filtering
                          rows
                          rows)]
      
      {:rows (take 1000 filtered-rows) ;; Limit results for performance
       :cols (->> fields
                  (map (fn [field]
                         {:name (:name field)
                          :display_name (:name field)
                          :base_type (:base-type field)
                          :semantic_type (:semantic-type field)})))
       :native_form {:query (format "SELECT * FROM %s LIMIT 1000" sheet-name)}})))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             Sync Operations                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod driver/sync-in-context :google-sheets
  [driver database do-sync-fn]
  (do-sync-fn))

(defmethod driver/mbql->native :google-sheets
  [driver query]
  {:query (format "SELECT * FROM google_sheet WHERE %s" 
                  (when-let [filter (:filter query)]
                    (str filter)))
   :params []})

(defmethod driver/sync-database! :google-sheets
  [driver database]
  (let [details (:details database)
        url (get details :spreadsheet-url)
        spreadsheet-id (extract-spreadsheet-id url)
        sheet-name (get details :sheet-name "Sheet1")
        api-key (get details :api-key)
        service-account-json (get details :service-account-json)
        redis-url (get details :redis-url "redis://localhost:6379")
        sync-interval (Integer/parseInt (get details :sync-interval "60"))]
    
    ;; Initialize Redis
    (when redis-url
      (comments/init-redis-pool redis-url))
    
    ;; Run sync
    (let [result (comments/sync-from-google-sheets spreadsheet-id sheet-name api-key service-account-json)]
      (log/infof "Google Sheets sync completed: %s" result)
      
      ;; Schedule periodic sync
      (future
        (Thread/sleep (* sync-interval 60 1000))
        (driver/sync-database! driver database))
      
      result)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             Utility Functions                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- validate-spreadsheet-url
  "Validate Google Sheets URL format."
  [url]
  (and (string? url)
       (str/starts-with? url "https://docs.google.com/spreadsheets/d/")))

(comment
  ;; Example usage
  (driver/can-connect? :google-sheets 
    {:spreadsheet-url "https://docs.google.com/spreadsheets/d/1v1aXMDfc9gruLnmJBlVVxRO7Ahila87j9lzEA5Zcj2E/edit"})
  
  (driver/describe-database :google-sheets 
    {:details {:spreadsheet-url "https://docs.google.com/spreadsheets/d/1v1aXMDfc9gruLnmJBlVVxRO7Ahila87j9lzEA5Zcj2E/edit"}}))