(ns metabase.driver.druid
  "Druid driver."
  (:require

[clojure.math.numeric-tower :as math]
            [clojure.string :as s]

[clojure.tools.logging :as log]
            [clj-http.client :as http]
            [cheshire.core :as json]
            [metabase.driver :as driver]
            [metabase.driver.druid.query-processor :as qp]
            (metabase.models [field :as field]
                             [table :as table])
            [metabase.sync-database.analyze :as analyze]
            [metabase.db.metadata-queries :as queries]
            [metabase.util :as u]

            [metabase.query-processor :as qp1]
            [metabase.query-processor.expand :as ql]
))

;; Analyze routines begin


(defn- qp-query [db-id query]
               (binding [qp1/*disable-qp-logging* false]
  (-> (qp1/process-query
       {:type     :query
        :database db-id
        :query    query})
      :data
      :rows)))


(def ^:private ^:const low-cardinality-threshold
  "Fields with less than this many distinct values should automatically be marked with `special_type = :category`."
  40)

(def ^:private ^:const field-values-entry-max-length
  "The maximum character length for a stored `FieldValues` entry."
  100)

(defn- field-query [field query]
  (let [table (field/table field)]
    (qp-query (:db_id table)
              (ql/query (merge query)
                        (ql/source-table (:id table))))))

(defn druid-field-distinct-values
  "Return the distinct values of FIELD.
   This is used to create a `FieldValues` object for `:category` Fields."
  ([field]
    (druid-field-distinct-values field @(resolve low-cardinality-threshold)))
  ([{field-id :id :as field} max-results]
   {:pre [(integer? max-results)]}
   (mapv first (field-query field (-> {}
                                      (ql/breakout (ql/field-id field-id))
                                      (ql/limit max-results))))
   #_(let [table (field/table field)
db-id (:db_id table)

q1 {:query
 {:intervals ["1900-01-01/2100-01-01"],
  :granularity :all,
  :context {:timeout 60000},
  :queryType :topN,
  :threshold 2000,
  :dataSource "obi-billdata-qa-1",
  :aggregations [{:type :count, :name :___count}],
  :dimension "payment_method",
  :metric {:type :alphaNumeric}},
 :querytype :metabase.driver.druid.query-processor/topN}


]
(binding [metabase.query-processor/*disable-qp-logging* false]
 (metabase.query-processor/process-query (merge {
:type :query
:database db-id}
q1))

)

     )
   ))


(def ^:private ^:const percent-valid-url-threshold
  "Fields that have at least this percent of values that are valid URLs should be marked as `special_type = :url`."
  0.95)


(def ^:private ^:const average-length-no-preview-threshold
  "Fields whose values' average length is greater than this amount should be marked as `preview_display = false`."
  50)


(defn- test:no-preview-display
  "If FIELD's is textual and its average length is too great, mark it so it isn't displayed in the UI."
  [driver field field-stats]
  (if-not (and (= :normal (:visibility_type field))
               (contains? #{:CharField :TextField} (:base_type field)))
    ;; this field isn't suited for this test
    field-stats
    ;; test for avg length
    (let [avg-len (u/try-apply (:field-avg-length driver) field)]
      (if-not (and avg-len (> avg-len average-length-no-preview-threshold))
        field-stats
        (do
          (log/debug (u/format-color 'green "Field '%s' has an average length of %d. Not displaying it in previews." (field/qualified-name field) avg-len))
          (assoc field-stats :preview-display false))))))

(defn- test:url-special-type
  "If FIELD is texual, doesn't have a `special_type`, and its non-nil values are primarily URLs, mark it as `special_type` `url`."
  [driver field field-stats]
  (if-not (and (not (:special_type field))
               (contains? #{:CharField :TextField} (:base_type field)))
    ;; this field isn't suited for this test
    field-stats
    ;; test for url values
    (let [percent-urls (u/try-apply (:field-percent-urls driver) field)]
      (if-not (and (float? percent-urls)
                   (>= percent-urls 0.0)
                   (<= percent-urls 100.0)
                   (> percent-urls percent-valid-url-threshold))
        field-stats
        (do
          (log/debug (u/format-color 'green "Field '%s' is %d%% URLs. Marking it as a URL." (field/qualified-name field) (int (math/round (* 100 percent-urls)))))
          (assoc field-stats :special-type :url))))))

(defn- values-are-valid-json?
  "`true` if at every item in VALUES is `nil` or a valid string-encoded JSON dictionary or array, and at least one of those is non-nil."
  [values]
  (try
    (loop [at-least-one-non-nil-value? false, [val & more] values]
      (cond
        (and (not val)
             (not (seq more))) at-least-one-non-nil-value?
        (s/blank? val)         (recur at-least-one-non-nil-value? more)
        ;; If val is non-nil, check that it's a JSON dictionary or array. We don't want to mark Fields containing other
        ;; types of valid JSON values as :json (e.g. a string representation of a number or boolean)
        :else                  (do (u/prog1 (json/parse-string val)
                                     (assert (or (map? <>)
                                                 (sequential? <>))))
                                   (recur true more))))
    (catch Throwable _
      false)))

(defn- test:json-special-type
  "Mark FIELD as `:json` if it's textual, doesn't already have a special type, the majority of it's values are non-nil, and all of its non-nil values
   are valid serialized JSON dictionaries or arrays."
  [driver field field-stats]
  (if-not (and (not (:special_type field))
               (contains? #{:CharField :TextField} (:base_type field)))
    ;; this field isn't suited for this test
    field-stats
    ;; check for json values
    (if-not (values-are-valid-json? (take driver/max-sync-lazy-seq-results (driver/field-values-lazy-seq driver field)))
      field-stats
      (do
        (log/debug (u/format-color 'green "Field '%s' looks like it contains valid JSON objects. Setting special_type to :json." (field/qualified-name field)))
        (assoc field-stats :special-type :json, :preview-display false)))))


(defn- test:new-field
  "Do the various tests that should only be done for a new `Field`.
   We only run most of the field analysis work when the field is NEW in order to favor performance of the sync process."
  [driver field field-stats]
  (->> field-stats
       (test:no-preview-display driver field)
       (test:url-special-type   driver field)
       (test:json-special-type  driver field)))

(defn test:cardinality-and-extract-field-values-druid
  "Extract field-values for FIELD.  If number of values exceeds `low-cardinality-threshold` then we return an empty set of values."
  [field field-stats]
  (println "testing for cardinality" (select-keys field [:special_type :name]))
  ;; TODO: we need some way of marking a field as not allowing field-values so that we can skip this work if it's not appropriate
  ;;       for example, :category fields with more than MAX values don't need to be rescanned all the time
  (let [non-nil-values  (filter identity (druid-field-distinct-values field (inc low-cardinality-threshold)))
        ;; only return the list if we didn't exceed our MAX values and if the the total character count of our values is reasable (#2332)
        distinct-values (when-not (or (< low-cardinality-threshold (count non-nil-values))
                                      ;; very simple check to see if total length of field-values exceeds (total values * max per value)
                                      (< (* low-cardinality-threshold
                                            field-values-entry-max-length) (reduce + (map (comp count str) non-nil-values))))
                          non-nil-values)]
    ;; TODO: eventually we can check for :nullable? based on the original values above
    (cond-> (assoc field-stats :values distinct-values)
      (and (nil? (:special_type field))
           (pos? (count distinct-values))) (assoc :special-type :category))))

(defn make-analyze-table-druid
  "Make a generic implementation of `analyze-table`."
  {:style/indent 1}
  [driver & {:keys [field-avg-length-fn field-percent-urls-fn]
             :or   {field-avg-length-fn   (partial driver/default-field-avg-length driver)
                    field-percent-urls-fn (partial driver/default-field-percent-urls driver)}}]
  (fn [driver table new-field-ids]
    (let [driver (assoc driver :field-avg-length field-avg-length-fn, :field-percent-urls field-percent-urls-fn)]
      {;:row_count 0 (u/try-apply analyze/table-row-count table)
       :fields    (for [{:keys [id] :as field} (table/fields table)]
                    (let [new-field? (contains? new-field-ids id)]
                      (cond->> {:id id}
                               (analyze/test-for-cardinality? field new-field?)
(test:cardinality-and-extract-field-values-druid field)
                               new-field?                               
(test:new-field driver field))))})))

;; Analyze routines end

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

(defn- can-connect? [details]
  (= 200 (:status (http/get (details->url details "/status")))))


;;; ### Query Processing

(defn- do-query [details query]
  {:pre [(map? query)]}
  (try (vec (POST (details->url details "/druid/v2"), :body query))
       (catch Throwable e
         ;; try to extract the error
         (let [message (or (u/ignore-exceptions
                             (:error (json/parse-string (:body (:object (ex-data e))) keyword)))
                           (.getMessage e))]

           (log/error (u/format-color 'red "Error running query:\n%s" message))
           ;; Re-throw a new exception with `message` set to the extracted message
           (throw (Exception. message e))))))


;;; ### Sync

(defn- describe-table-field [druid-field-type field-name]
  (merge {:name field-name}
         ;; all dimensions are Strings, and all metrics as JS Numbers, I think (?)
         ;; string-encoded booleans + dates are treated as strings (!)
         (if (= :metric druid-field-type)
           {:field-type :metric,    :base-type :FloatField}
           {:field-type :dimension, :base-type :TextField})))

(defn- describe-table [database table]
  (let [details                      (:details database)
        {:keys [dimensions metrics]} (GET (details->url details "/druid/v2/datasources/" (:name table) "?interval=1900-01-01/2100-01-01"))]
    {:schema nil
     :name   (:name table)
     :fields (set (concat
                    ;; every Druid table is an event stream w/ a timestamp field
                    [{:name       "timestamp"
                      :base-type  :DateTimeField
                      :field-type :dimension
                      :pk?        true}]
                    (map (partial describe-table-field :dimension) dimensions)
                    (map (partial describe-table-field :metric) metrics)))}))

(defn- describe-database [database]
  {:pre [(map? (:details database))]}
  (let [details           (:details database)
        druid-datasources (GET (details->url details "/druid/v2/datasources"))]
    {:tables (set (for [table-name druid-datasources]
                    {:schema nil, :name table-name}))}))


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


;;; ### DruidrDriver Class Definition

(defrecord DruidDriver []
  clojure.lang.Named
  (getName [_] "Druid"))

(u/strict-extend DruidDriver
  driver/IDriver
  (merge driver/IDriverDefaultsMixin
         {:analyze-table         (fn [driver table new-table-ids]
                                   ((make-analyze-table-druid
                                     driver
                                     :field-avg-length-fn (constantly 0)  ; TODO
                                     :field-percent-urls-fn (constantly 0)  ; TODO
                                     )
                                    driver
                                    table
                                    new-table-ids))
          :can-connect?          (u/drop-first-arg can-connect?)
          :describe-database     (u/drop-first-arg describe-database)
          :describe-table        (u/drop-first-arg describe-table)
          :details-fields        (constantly [{:name         "host"
                                               :display-name "Host"
                                               :default      "http://localhost"}
                                              {:name         "port"
                                               :display-name "Broker node port"
                                               :type         :integer
                                               :default      8082}])
          :execute-query         (fn [_ query] (qp/execute-query do-query query))
          :features              (constantly #{:set-timezone})
          :field-values-lazy-seq (u/drop-first-arg field-values-lazy-seq)
          :mbql->native          (u/drop-first-arg qp/mbql->native)}))

(driver/register-driver! :druid (DruidDriver.))
