(ns metabase.driver.druid
  "Druid driver."
  (:require [clojure.tools.logging :as log]
            [clj-http.client :as http]
            [cheshire.core :as json]
            [metabase.api.common :refer [let-404]]
            [metabase.db :refer [sel]]
            [metabase.driver :as driver]
            [metabase.driver.druid.query-processor :as qp]
            (metabase.models [database :refer [Database]]
                             [table :as table])
            [metabase.util :as u]))

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
  (let [options                  (cond-> (merge {:content-type "application/json"} options)
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

(defn- can-connect?
  ([_ details]
   (can-connect? details))
  ([details]
   (= 200 (:status (http/get (details->url details "/status"))))))


;;; ### Query Processing

(defn- do-query [details query]
  {:pre [(map? query)]}
  (try (vec (POST (details->url details "/druid/v2"), :body query))
       (catch Throwable e
         ;; try to print the error
         (try (log/error (u/format-color 'red "Error running query:\n  %s"
                           (:error (json/parse-string (:body (:object (ex-data e))) keyword)))) ; TODO - log/error
              (catch Throwable _))
         ;; re-throw exception either way
         (throw e))))


(defn- process-structured
  ([_ expanded-query-map]
   (process-structured {:details (-> expanded-query-map :database :details)
                        :query    (-> expanded-query-map :query)}))
  ([{:keys [details query]}]
   (qp/process-structured-query (partial do-query details) query)))

(defn- process-native
  ([_ query]
   (process-native query))
  ([{database-id :database, {query :query} :native}]
   {:pre [(integer? database-id)]}
   (let-404 [details (sel :one :field [Database :details] :id database-id)]
     (do-query details query))))


;;; ### Sync

(defn- describe-table-field [druid-field-type field-name]
  (merge {:name field-name}
         ;; all dimensions are Strings, and all metrics as JS Numbers, I think (?)
         ;; string-encoded booleans + dates are treated as strings (!)
         (if (= :metric druid-field-type)
           {:field-type :metric, :base-type :FloatField}
           {:field-type :dimension, :base-type :TextField})))

(defn describe-table [_ table]
  (let [details                      (:details (table/database table))
        {:keys [dimensions metrics]} (GET (details->url details "/druid/v2/datasources/" (:name table) "?interval=-5000/5000"))]
    (clojure.pprint/pprint dimensions)
    {:name   (:name table)
     :fields (set (concat
                    ;; every Druid table is an event stream w/ a timestamp field
                    [{:name       "timestamp"
                      :base-type  :DateTimeField
                      :field-type :dimension
                      :pk?        true}]
                    (map (partial describe-table-field :dimension) dimensions)
                    (map (partial describe-table-field :metric) metrics)))}))

(defn describe-database [_ database]
  {:pre [(map? (:details database))]}
  (let [details           (:details database)
        druid-datasources (GET (details->url details "/druid/v2/datasources"))]
    {:tables (set (for [table-name druid-datasources]
                    {:name table-name}))}))


;;; ### field-values-lazy-seq

(defn- field-values-lazy-seq-fetch-one-page [details table-name field-name & [paging-identifiers]]
  {:pre [(map? details) (or (string? table-name) (keyword? table-name)) (or (string? field-name) (keyword? field-name)) (or (nil? paging-identifiers) (map? paging-identifiers))]}
  (let [[{{:keys [pagingIdentifiers events]} :result}] (do-query details {:queryType    :select
                                                                          :dataSource   table-name
                                                                          :intervals    ["-5000/5000"]
                                                                          :granularity  :all
                                                                          :dimensions   [field-name]
                                                                          :metrics      []
                                                                          :pagingSpec   (merge {:threshold driver/field-values-lazy-seq-chunk-size}
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
  ([_ field]
   (field-values-lazy-seq (:details (u/deref-> field :table :db))
                          (:name @(:table field))
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


;;; ### DriverDriver Class Definition

(defrecord DruidDriver []
  clojure.lang.Named
  (getName [_] "Druid"))

(extend DruidDriver
  driver/IDriver
  (merge driver/IDriverDefaultsMixin
         {:analyze-table             (constantly nil)       ; TODO: we should fill this out at some point
          :describe-database         describe-database
          :describe-table            describe-table
          :can-connect?              can-connect?
          :details-fields            (constantly [{:name         "host"
                                                   :display-name "Host"
                                                   :default      "http://localhost"}
                                                  {:name         "port"
                                                   :display-name "Broker node port"
                                                   :type         :integer
                                                   :default      8082}])
          :field-values-lazy-seq     field-values-lazy-seq
          :process-native            process-native
          :process-structured        process-structured}))

(driver/register-driver! :druid (DruidDriver.))
