(ns metabase.driver.google-sheets.comments
  "Comment data model and Redis integration for Google Sheets driver."
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.driver.google-sheets.api :as api]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu])
  (:import
   (redis.clients.jedis Jedis JedisPool JedisPoolConfig)
   (java.time LocalDateTime)))

(set! *warn-on-reflection* true)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             Comment Data Model                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private comment-schema
  {:topic [:string {:min 1 :max 200}]
   :date [:inst]
   :author [:string {:min 1 :max 100}]
   :text [:string {:min 1 :max 5000}]
   :address [:string {:min 1 :max 200}]
   :has_response [:boolean]
   :district [:string {:min 1 :max 100}]
   :settlement [:string {:min 1 :max 100}]
   :source [:string {:min 1 :max 50}]
   :original_id [:string {:min 1 :max 100}]})

(mu/defn validate-comment :- [:map comment-schema]
  "Validate comment data against schema."
  [comment-data]
  (mu/validate comment-schema comment-data))

(mu/defn normalize-comment :- [:map comment-schema]
  "Normalize comment data from Google Sheets row."
  [row]
  (let [normalized {:topic (get row "Тема" (get row "topic" ""))
                    :date (try
                            (t/local-date-time 
                              (t/formatter "yyyy-MM-dd['T'HH:mm:ss]") 
                              (get row "Дата" (get row "date" "")))
                            (catch Exception _ (t/local-date-time)))
                    :author (get row "Автор" (get row "author" ""))
                    :text (get row "Текст" (get row "text" ""))
                    :address (get row "Адрес" (get row "address" ""))
                    :has_response (boolean (get row "Ответ" (get row "has_response" false)))
                    :district (get row "Район" (get row "district" ""))
                    :settlement (get row "Населенный пункт" (get row "settlement" ""))
                    :source "google_sheets"
                    :original_id (str (hash (str (get row "Дата" "") (get row "Автор" "") (get row "Текст" ""))))}]
    (validate-comment normalized)))

(defn generate-comment-id
  "Generate unique ID for comment."
  [comment]
  (str "comment_" (hash (str (:topic comment) (:date comment) (:author comment)))))

(defn comment->map
  "Convert comment to map for storage."
  [comment]
  (assoc comment
         :id (generate-comment-id comment)
         :created_at (t/local-date-time)
         :updated_at (t/local-date-time)
         :text_preview (if (> (count (:text comment)) 100)
                         (str (subs (:text comment) 0 100) "...")
                         (:text comment))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             Redis Integration                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private redis-pool (atom nil))

(defn init-redis-pool
  "Initialize Redis connection pool."
  [redis-url]
  (let [config (JedisPoolConfig.)
        pool (JedisPool. config (URI. redis-url))]
    (reset! redis-pool pool)
    pool))

(defn with-redis
  "Execute function with Redis connection."
  [f]
  (when-let [pool @redis-pool]
    (with-open [jedis (.getResource pool)]
      (f jedis))))

(defn redis-connected?
  "Check if Redis is connected."
  []
  (try
    (with-redis
      (fn [jedis]
        (.ping jedis)
        true))
    (catch Exception e
      (log/errorf e "Redis connection failed: %s" (ex-message e))
      false)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             Redis Operations                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn store-comment
  "Store comment in Redis."
  [comment]
  (with-redis
    (fn [jedis]
      (let [comment-map (comment->map comment)
            key (str "comment:" (:id comment-map))
            hash-key (str "comment:hash:" (hash (str (:topic comment) (:date comment) (:author comment) (:text comment))))]
        ;; Check for duplicate
        (when-not (.exists jedis hash-key)
          ;; Store comment data
          (doseq [[field value] comment-map]
            (.hset jedis key (name field) (str value)))
          ;; Store hash for duplicate checking
          (.set jedis hash-key (:id comment-map))
          ;; Add to indexes
          (.sadd jedis "comments:by_topic" (:topic comment))
          (.sadd jedis (str "comments:by_topic:" (:topic comment)) key)
          (.sadd jedis "comments:by_author" (:author comment))
          (.sadd jedis (str "comments:by_author:" (:author comment)) key)
          (.sadd jedis "comments:by_address" (:address comment))
          (.sadd jedis (str "comments:by_address:" (:address comment)) key)
          (.zadd jedis "comments:by_date" (.toEpochSecond (t/instant (:date comment))) key)
          (.sadd jedis (str "comments:has_response:" (:has_response comment)) key)
          true)))))

(defn get-comment
  "Get comment from Redis by ID."
  [comment-id]
  (with-redis
    (fn [jedis]
      (let [key (str "comment:" comment-id)
            data (.hgetAll jedis key)]
        (when (seq data)
          (-> data
              (update :date #(t/local-date-time (t/instant (Long/parseLong %))))
              (update :created_at #(t/local-date-time (t/instant (Long/parseLong %))))
              (update :updated_at #(t/local-date-time (t/instant (Long/parseLong %))))
              (update :has_response #(Boolean/parseBoolean %))))))))

(defn search-comments
  "Search comments with filters."
  ([]
   (search-comments {}))
  ([{:keys [topic author address date-from date-to has_response search-text limit offset]
     :or {limit 50 offset 0}}]
   (with-redis
     (fn [jedis]
       (let [keys (cond
                    topic (.smembers jedis (str "comments:by_topic:" topic))
                    author (.smembers jedis (str "comments:by_author:" author))
                    address (.smembers jedis (str "comments:by_address:" address))
                    has_response (.smembers jedis (str "comments:has_response:" has_response))
                    :else (.zrange jedis "comments:by_date" 0 -1))
             filtered-keys (->> keys
                                (map (fn [key]
                                       (let [comment (get-comment (str/replace key #"^comment:" ""))]
                                         (when (and comment
                                                    (or (not date-from)
                                                        (t/after? (:date comment) (t/local-date-time date-from)))
                                                    (or (not date-to)
                                                        (t/before? (:date comment) (t/local-date-time date-to)))
                                                    (or (not search-text)
                                                        (str/includes? (str/lower-case (:text comment))
                                                                       (str/lower-case search-text))))
                                           key))))
                                (remove nil?)
                                (drop offset)
                                (take limit))]
         (map #(get-comment (str/replace % #"^comment:" "")) filtered-keys))))))

(defn get-comment-stats
  "Get statistics about comments."
  []
  (with-redis
    (fn [jedis]
      {:total (.zcard jedis "comments:by_date")
       :by_topic (->> (.smembers jedis "comments:by_topic")
                      (map (fn [topic]
                             {:topic topic
                              :count (.scard jedis (str "comments:by_topic:" topic))}))
                      (sort-by :count >))
       :by_author (->> (.smembers jedis "comments:by_author")
                       (map (fn [author]
                              {:author author
                               :count (.scard jedis (str "comments:by_author:" author))}))
                       (sort-by :count >))
       :by_address (->> (.smembers jedis "comments:by_address")
                        (map (fn [address]
                               {:address address
                                :count (.scard jedis (str "comments:by_address:" address))}))
                        (sort-by :count >))
       :response_stats {:with_response (.scard jedis "comments:has_response:true")
                        :without_response (.scard jedis "comments:has_response:false")}})))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             Sync Operations                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn sync-from-google-sheets
  "Sync comments from Google Sheets to Redis."
  [spreadsheet-id sheet-name api-key service-account-json]
  (log/infof "Starting sync from Google Sheets: %s/%s" spreadsheet-id sheet-name)
  (try
    (let [rows (api/get-spreadsheet-rows spreadsheet-id sheet-name api-key service-account-json)
          comments (->> rows
                        (map normalize-comment)
                        (remove nil?))
          imported (atom 0)
          duplicates (atom 0)
          errors (atom 0)]
      (doseq [comment comments]
        (try
          (if (store-comment comment)
            (swap! imported inc)
            (swap! duplicates inc))
          (catch Exception e
            (log/errorf e "Failed to store comment: %s" (ex-message e))
            (swap! errors inc))))
      {:imported @imported
       :duplicates @duplicates
       :errors @errors
       :total (count comments)})
    (catch Exception e
      (log/errorf e "Failed to sync from Google Sheets: %s" (ex-message e))
      {:imported 0 :duplicates 0 :errors 1 :total 0})))

(defn periodic-sync
  "Periodic sync job."
  [config]
  (let [redis-url (get config :redis-url "redis://localhost:6379")
        spreadsheet-id (get config :spreadsheet-id)
        sheet-name (get config :sheet-name "Sheet1")
        api-key (get config :api-key)
        service-account-json (get config :service-account-json)
        interval-minutes (get config :interval-minutes 60)]
    ;; Initialize Redis if not already
    (when-not @redis-pool
      (init-redis-pool redis-url))
    
    ;; Run sync
    (when (redis-connected?)
      (sync-from-google-sheets spreadsheet-id sheet-name api-key service-account-json))
    
    ;; Schedule next run
    (future
      (Thread/sleep (* interval-minutes 60 1000))
      (periodic-sync config))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             Analytics Functions                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn get-time-series-data
  "Get time series data for analytics."
  [period]
  (with-redis
    (fn [jedis]
      (let [all-keys (.zrange jedis "comments:by_date" 0 -1)
            comments (map #(get-comment (str/replace % #"^comment:" "")) all-keys)]
        (->> comments
             (group-by (fn [comment]
                         (case period
                           :daily (t/format "yyyy-MM-dd" (:date comment))
                           :weekly (t/format "yyyy-'W'ww" (:date comment))
                           :monthly (t/format "yyyy-MM" (:date comment))
                           :yearly (t/format "yyyy" (:date comment)))))
             (map (fn [[period comments]]
                    {:period period
                     :count (count comments)
                     :topics (->> comments
                                  (map :topic)
                                  frequencies
                                  (sort-by val >)
                                  (take 5))}))
             (sort-by :period))))))

(defn get-topic-distribution
  "Get topic distribution for analytics."
  []
  (with-redis
    (fn [jedis]
      (->> (.smembers jedis "comments:by_topic")
           (map (fn [topic]
                  {:topic topic
                   :count (.scard jedis (str "comments:by_topic:" topic))}))
           (sort-by :count >)))))

(defn get-author-activity
  "Get author activity statistics."
  []
  (with-redis
    (fn [jedis]
      (->> (.smembers jedis "comments:by_author")
           (map (fn [author]
                  {:author author
                   :count (.scard jedis (str "comments:by_author:" author))
                   :last_activity (when-let [keys (.smembers jedis (str "comments:by_author:" author))]
                                    (->> keys
                                         (map #(.zscore jedis "comments:by_date" %))
                                         (remove nil?)
                                         (apply max)
                                         (#(when % (t/local-date-time (t/instant (long %)))))))}))
           (sort-by :count >)))))

(comment
  ;; Example usage
  (init-redis-pool "redis://localhost:6379")
  
  (redis-connected?)
  
  (sync-from-google-sheets "1v1aXMDfc9gruLnmJBlVVxRO7Ahila87j9lzEA5Zcj2E" "Sheet1" nil nil)
  
  (search-comments {:topic "Транспорт" :limit 10})
  
  (get-comment-stats)
  
  (get-time-series-data :monthly)
  
  (get-topic-distribution))