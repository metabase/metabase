(ns metabase.driver.druid
  "Druid driver."
  (:require [cheshire.core :as json]
            [clj-http.client :as http]
            [clojure.tools.logging :as log]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.driver.druid.query-processor :as qp]
            [metabase.models
             [field :as field]
             [table :as table]]
            [metabase.sync-database.analyze :as analyze]
            [metabase.util.ssh :as ssh]))

;;; ### Request helper fns

(defn- details->url
  "Helper for building a Druid URL.

    (details->url {:host \"http://localhost\", :port 8082} \"druid/v2\") -> \"http://localhost:8082/druid/v2\""
  [{:keys [host port]} & strs]
  {:pre [(string? host) (seq host) (integer? port)]}
  (apply str (format "%s:%d" host port) (map name strs)))

;; TODO - Should this go somewhere more general, like util ?
(defn- do-request
  "Perform a JSON request using REQUEST-FN against URL.
   Tho

     (do-request http/get \"http://my-json-api.net\")"
  [request-fn url & {:as options}]
  {:pre [(fn? request-fn) (string? url)]}
  (let [options               (cond-> (merge {:content-type "application/json"} options)
                                (:body options) (update :body json/generate-string))
        {:keys [status body]} (request-fn url options)]
    (when (not= status 200)
      (throw (Exception. (format "Error [%d]: %s" status body))))
    (try (json/parse-string body keyword)
         (catch Throwable _
           (throw (Exception. (str "Failed to parse body: " body)))))))

(def ^:private ^{:arglists '([url & {:as options}])} GET  (partial do-request http/get))
(def ^:private ^{:arglists '([url & {:as options}])} POST (partial do-request http/post))


;;; ### Misc. Driver Fns

(defn- can-connect? [details]
  (ssh/with-ssh-tunnel [details-with-tunnel details]
    (= 200 (:status (http/get (details->url details-with-tunnel "/status"))))))


;;; ### Query Processing

(defn- do-query [details query]
  {:pre [(map? query)]}
  (ssh/with-ssh-tunnel [details-with-tunnel details]
    (try (vec (POST (details->url details-with-tunnel "/druid/v2"), :body query))
         (catch Throwable e
           ;; try to extract the error
           (let [message (or (u/ignore-exceptions
                               (:error (json/parse-string (:body (:object (ex-data e))) keyword)))
                             (.getMessage e))]

             (log/error (u/format-color 'red "Error running query:\n%s" message))
             ;; Re-throw a new exception with `message` set to the extracted message
             (throw (Exception. message e)))))))


;;; ### Sync

(defn- describe-table-field [druid-field-type field-name]
  ;; all dimensions are Strings, and all metrics as JS Numbers, I think (?)
  ;; string-encoded booleans + dates are treated as strings (!)
  {:name      field-name
   :base-type (if (= :metric druid-field-type)
                :type/Float
                :type/Text)})

(defn- describe-table [database table]
  (ssh/with-ssh-tunnel [details-with-tunnel (:details database)]
    (let [{:keys [dimensions metrics]} (GET (details->url details-with-tunnel "/druid/v2/datasources/" (:name table) "?interval=1900-01-01/2100-01-01"))]
      {:schema nil
       :name   (:name table)
       :fields (set (concat
                     ;; every Druid table is an event stream w/ a timestamp field
                     [{:name       "timestamp"
                       :base-type  :type/DateTime
                       :pk?        true}]
                     (map (partial describe-table-field :dimension) dimensions)
                     (map (partial describe-table-field :metric) metrics)))})))

(defn- describe-database [database]
  {:pre [(map? (:details database))]}
  (ssh/with-ssh-tunnel [details-with-tunnel (:details database)]
    (let [druid-datasources (GET (details->url details-with-tunnel "/druid/v2/datasources"))]
      {:tables (set (for [table-name druid-datasources]
                      {:schema nil, :name table-name}))})))


;;; ### field-values-lazy-seq

(defn- field-values-lazy-seq-fetch-one-page [details table-name field-name & [paging-identifiers]]
  {:pre [(map? details) (or (string? table-name) (keyword? table-name)) (or (string? field-name) (keyword? field-name)) (or (nil? paging-identifiers) (map? paging-identifiers))]}
  (let [[{{:keys [pagingIdentifiers events]} :result}] (do-query details {:queryType   :select
                                                                          :dataSource  table-name
                                                                          :intervals   ["1900-01-01/2100-01-01"]
                                                                          :granularity :all
                                                                          :dimensions  [field-name]
                                                                          :metrics     []
                                                                          :pagingSpec  (merge {:threshold driver/field-values-lazy-seq-chunk-size}
                                                                                              (when paging-identifiers
                                                                                                {:pagingIdentifiers paging-identifiers}))})]
    ;; return pair of [paging-identifiers values]
    [ ;; Paging identifiers return the largest offset of their results, e.g. 49 for page 1.
     ;; We need to inc that number so the next page starts after that (e.g. 50)
     (let [[[k offset]] (seq pagingIdentifiers)]
       {k (inc offset)})
     ;; Unnest the values
     (for [event events]
       (get-in event [:event (keyword field-name)]))]))

(defn- field-values-lazy-seq
  ([field]
   (field-values-lazy-seq (:details (table/database (field/table field)))
                          (:name (field/table field))
                          (:name field)
                          0
                          nil))

  ([details table-name field-name total-items-fetched paging-identifiers]
   {:pre [(map? details)
          (or (string? table-name) (keyword? table-name))
          (or (string? field-name) (keyword? field-name))
          (integer? total-items-fetched)
          (or (nil? paging-identifiers) (map? paging-identifiers))]}
   (lazy-seq (let [[paging-identifiers values] (field-values-lazy-seq-fetch-one-page details table-name field-name paging-identifiers)
                   total-items-fetched         (+ total-items-fetched driver/field-values-lazy-seq-chunk-size)]
               (concat values
                       (when (and (seq values)
                                  (< total-items-fetched driver/max-sync-lazy-seq-results)
                                  (= (count values) driver/field-values-lazy-seq-chunk-size))
                         (field-values-lazy-seq details table-name field-name total-items-fetched paging-identifiers)))))))


(defn- analyze-table
  "Implementation of `analyze-table` for Druid driver."
  [driver table new-table-ids]
  ((analyze/make-analyze-table driver
     :field-avg-length-fn   (constantly 0) ; TODO implement this?
     :field-percent-urls-fn (constantly 0)
     :calculate-row-count?  false) driver table new-table-ids))


;;; ### DruidrDriver Class Definition

(defrecord DruidDriver []
  clojure.lang.Named
  (getName [_] "Druid"))

(u/strict-extend DruidDriver
  driver/IDriver
  (merge driver/IDriverDefaultsMixin
         {:can-connect?          (u/drop-first-arg can-connect?)
          :analyze-table         analyze-table
          :describe-database     (u/drop-first-arg describe-database)
          :describe-table        (u/drop-first-arg describe-table)
          :details-fields        (constantly (ssh/with-tunnel-config
                                               [{:name         "host"
                                                 :display-name "Host"
                                                 :default      "http://localhost"}
                                                {:name         "port"
                                                 :display-name "Broker node port"
                                                 :type         :integer
                                                 :default      8082}]))
          :execute-query         (fn [_ query] (qp/execute-query do-query query))
          :features              (constantly #{:basic-aggregations :set-timezone :expression-aggregations})
          :field-values-lazy-seq (u/drop-first-arg field-values-lazy-seq)
          :mbql->native          (u/drop-first-arg qp/mbql->native)}))

(driver/register-driver! :druid (DruidDriver.))
