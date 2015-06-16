(ns metabase.driver.query-processor
  "Preprocessor that does simple transformations to all incoming queries, simplifing the driver-specific implementations."
  (:require [clojure.core.match :refer [match]]
            [clojure.string :as s]
            [clojure.tools.logging :as log]
            [korma.core :refer :all]
            [medley.core :as m]
            [metabase.db :refer :all]
            [metabase.driver.interface :as i]
            [metabase.driver.query-processor.expand :as expand]
            (metabase.models [field :refer [Field]]
                             [foreign-key :refer [ForeignKey]])
            [metabase.util :as u]))

(declare add-implicit-breakout-order-by
         add-implicit-limit
         add-implicit-fields
         get-special-column-info
         preprocess-rewrite-timestamp-equals-filter
         preprocess-cumulative-sum
         preprocess-structured
         remove-empty-clauses)

;; # CONSTANTS

(def ^:const empty-response
  "An empty response dictionary to return when there's no query to run."
  {:rows [], :columns [], :cols []})

(def ^:const max-result-rows
  "Maximum number of rows the QP should ever return."
  10000)

(def ^:const max-result-bare-rows
  "Maximum number of rows the QP should ever return specifically for 'rows' type aggregations."
  2000)


;; # DYNAMIC VARS

(def ^:dynamic *query*
  "The query we're currently processing (i.e., the body of the query API call)."
  nil)

(def ^:dynamic *disable-qp-logging*
  "Should we disable logging for the QP? (e.g., during sync we probably want to turn it off to keep logs less cluttered)."
  false)

(def ^:dynamic *internal-context*
  "A neat place to store 'notes-to-self': things individual implementations don't need to know about, like if the `fields` clause was added implicitly."
  (atom nil))


;; # PREPROCESSOR

(defn preprocess
  "Preprocess QUERY dict, applying various driver-independent transformations to it before it is passed to specific driver query processor implementations."
  [{query-type :type :as query}]
  (case (keyword query-type)
    :query (preprocess-structured query)
    :native query))

(defn preprocess-structured
  "Preprocess a strucuted QUERY dict."
  [query]
  (let [preprocessed-query (update-in query [:query] #(->> %
                                                           remove-empty-clauses
                                                           add-implicit-breakout-order-by
                                                           add-implicit-limit
                                                           add-implicit-fields
                                                           preprocess-rewrite-timestamp-equals-filter
                                                           preprocess-cumulative-sum))]
    (when-not *disable-qp-logging*
      (log/debug (colorize.core/cyan "\n******************** PREPROCESSED: ********************\n"
                                     (with-out-str (clojure.pprint/pprint preprocessed-query)) "\n"
                                     "*******************************************************\n")))
    preprocessed-query))


;; ## PREPROCESSOR FNS

;; ### REMOVE-EMPTY-CLAUSES
(def ^:const clause->empty-forms
  "Clause values that should be considered empty and removed during preprocessing."
  {:breakout #{[nil]}
   :filter   #{[nil nil]}})

(defn remove-empty-clauses
  "Remove all QP clauses whose value is:
   1.  is `nil`
   2.  is an empty sequence (e.g. `[]`)
   3.  matches a form in `clause->empty-forms`"
  [query]
  (->> query
       (map (fn [[clause clause-value]]
              (when (and clause-value
                         (or (not (sequential? clause-value))
                             (seq clause-value)))
                (when-not (contains? (clause->empty-forms clause) clause-value)
                  [clause clause-value]))))
       (into {})))


;; ### ADD-IMPLICIT-BREAKOUT-ORDER-BY

(defn add-implicit-breakout-order-by
  "Field IDs specified in `breakout` should add an implicit ascending `order_by` subclause *unless* that field is *explicitly* referenced in `order_by`."
  [{breakout-field-ids :breakout order-by-subclauses :order_by :as query}]
  (let [order-by-field-ids (set (map first order-by-subclauses))
        implicit-breakout-order-by-field-ids (filter (partial (complement contains?) order-by-field-ids)
                                                     breakout-field-ids)]
    (if-not (seq implicit-breakout-order-by-field-ids) query
            (->> implicit-breakout-order-by-field-ids
                 (mapv (fn [field-id]
                         [field-id "ascending"]))
                 (apply conj (or order-by-subclauses []))
                 (assoc query :order_by)))))


;;; ### ADD-IMPLICIT-LIMIT

(defn add-implicit-limit
  "Add an implicit `limit` clause to queries with `rows` aggregations."
  [{:keys [limit aggregation] :as query}]
  (if (and (= aggregation ["rows"])
           (not limit))
    (assoc query :limit max-result-bare-rows)
    query))


;;; ### ADD-IMPLICIT-FIELDS

(defn add-implicit-fields
  "Add an implicit `fields` clause to queries with `rows` aggregations."
  [{:keys [fields aggregation breakout source_table] :as query}]
  (if-not (and (= aggregation ["rows"])
               (not breakout)
               (not fields))
    query
    ;; If we're doing a "rows" aggregation with no breakout or fields clauses add one that will exclude Fields that are supposed to be hidden
    (do (swap! *internal-context* assoc :fields-is-implicit true)
        (assoc query :fields (sel :many :id Field :table_id source_table, :active true, :preview_display true,
                                  :field_type [not= "sensitive"], (order :position :asc), (order :id :desc))))))

(def ^:private ^:const seconds-per-day      (* 24 60 60))
(def ^:private ^:const milliseconds-per-day (* seconds-per-day 1000))

(defn- rewrite-timestamp-filter=
  "Rewrite an `=` filter clause for a timestamp `Field`. "
  [{:keys [field], {timestamp :value, special-type :special-type, :as value} :value}]
  ;; The timestamps we create 00:00 on the day in question, re-write the filter as a ["BETWEEN" field timestamp (+ timestamp 1-day)]
  (expand/map->Filter:Between {:type :between
                              :field field
                              :min   value
                              :max   (expand/map->Value (assoc value
                                                               :value (+ timestamp (case special-type
                                                                                     :timestamp_seconds      seconds-per-day
                                                                                     :timestamp_milliseconds milliseconds-per-day))))}))

(defn preprocess-rewrite-timestamp-equals-filter
  "In order for `=` filter clauses to work with timestamps (allowing the user to match a given day) we need to rewrite them as
   `BETWEEN` clauses. Check and see if the `filter` clause contains any subclauses that fit the bill and rewrite them accordingly."
  [query]
  (if-not (:filter query)
    ;; If there's no filter clause there's nothing to do
    query
    ;; Otherwise rewrite as needed
    (update-in query [:filter] (fn [filter-clause]
                                 (-> filter-clause
                                     expand/expand-filter
                                     (update-in [:subclauses] #(for [{:keys [filter-type], {:keys [special-type]} :field, :as subclause} %]
                                                                 (if (and (= filter-type :=)
                                                                          (contains? #{:timestamp_seconds
                                                                                       :timestamp_milliseconds} special-type))
                                                                   (rewrite-timestamp-filter= subclause)
                                                                   subclause)))
                                     expand/collapse)))))


;; ### PREPROCESS-CUMULATIVE-SUM

(defn preprocess-cumulative-sum
  "Rewrite queries containing a cumulative sum (`cum_sum`) aggregation to simply fetch the values of the aggregate field instead.
   (Cumulative sum is a special case; it is implemented in post-processing)."
  [{[ag-type ag-field :as aggregation] :aggregation, breakout-fields :breakout, order-by :order_by, :as query}]
  (let [cum-sum?                    (= ag-type "cum_sum")
        cum-sum-with-breakout?      (and cum-sum?
                                         (not (empty? breakout-fields)))
        cum-sum-with-same-breakout? (and cum-sum-with-breakout?
                                         (= (count breakout-fields) 1)
                                         (= (first breakout-fields) ag-field))]

    ;; Cumulative sum is only applicable if it has breakout fields
    ;; For these, store the cumulative sum field under the key :cum_sum so we know which one to sum later
    ;; Cumulative summing happens in post-processing
    (cond
      ;; If there's only one breakout field that is the same as the cum_sum field, re-write this as a "rows" aggregation
      ;; to just fetch all the values of the field in question.
      cum-sum-with-same-breakout? (-> query
                                      (dissoc :breakout)
                                      (assoc :cum_sum     ag-field     ; TODO - move this to *internal-context* instead?
                                             :aggregation ["rows"]
                                             :fields      [ag-field]))

      ;; Otherwise if we're breaking out on different fields, rewrite the query as a "sum" aggregation
      cum-sum-with-breakout? (assoc query
                                    :cum_sum     ag-field
                                    :aggregation ["sum" ag-field])

      ;; Cumulative sum without any breakout fields should just be treated the same way as "sum". Rewrite query as such
      cum-sum? (assoc query
                      :aggregation ["sum" ag-field])

      ;; Otherwise if this isn't a cum_sum query return it as-is
      :else               query)))


;; # POSTPROCESSOR

;; ### POST-PROCESS-CUMULATIVE-SUM

(defn post-process-cumulative-sum
  "Cumulative sum the values of the aggregate `Field` in RESULTS."
  {:arglists '([query results])}
  [{cum-sum-field :cum_sum, :as query} {rows :rows, cols :cols, :as results}]
  (if-not cum-sum-field results
          (let [ ;; Determine the index of the field we need to cumulative sum
                cum-sum-field-index (->> cols
                                         (u/indecies-satisfying #(or (= (:name %) "sum")
                                                                     (= (:id %) cum-sum-field)))
                                         first)
                _                   (assert (integer? cum-sum-field-index))
                ;; Now make a sequence of cumulative sum values for each row
                values              (->> rows
                                         (map #(nth % cum-sum-field-index))
                                         (reductions +))
                ;; Update the values in each row
                rows                (map (fn [row value]
                                           (assoc (vec row) cum-sum-field-index value))
                                         rows values)]
            (assoc results :rows rows))))

;; ### LIMIT-MAX-RESULT-ROWS

(defn limit-max-result-rows
  "Limit the number of rows returned in RESULTS to `max-result-rows`.
  (We want to do this here so we can put a hard limit on native SQL results and other ones where we couldn't add an implicit `:limit` clause)."
  [results]
  {:pre [(map? results)
         (sequential? (:rows results))]}
  (update-in results [:rows] (partial take max-result-rows)))


;;; ### CONVERT-TIMESTAMPS-TO-DATES

(defn convert-unix-timestamps-to-dates
  "Convert the values of Unix timestamps (for `Fields` whose `:special_type` is `:timestamp_seconds` or `:timestamp_milliseconds`) to dates."
  [{:keys [cols rows], :as results}]
  (let [timestamp-seconds-col-indecies (u/indecies-satisfying #(= (:special_type %) :timestamp_seconds)      cols)
        timestamp-millis-col-indecies  (u/indecies-satisfying #(= (:special_type %) :timestamp_milliseconds) cols)]
    (if-not (or (seq timestamp-seconds-col-indecies)
                (seq timestamp-millis-col-indecies))
      ;; If we don't have any columns whose special type is a seconds or milliseconds timestamp return results as-is
      results
      ;; Otherwise go modify the results of each row
      (update-in results [:rows] #(for [row %]
                                    (for [[i val] (m/indexed row)]
                                      (cond
                                        (contains? timestamp-seconds-col-indecies i) (java.sql.Date. (* val 1000))
                                        (contains? timestamp-millis-col-indecies i)  (java.sql.Date. val)
                                        :else                                        val)))))))


;; ### ADD-ROW-COUNT-AND-STATUS

(defn add-row-count-and-status
  "Wrap the results of a successfully processed query in the format expected by the frontend (add `row_count` and `status`)."
  [results]
  {:pre [(map? results)
         (sequential? (:columns results))
         (sequential? (:cols results))
         (sequential? (:rows results))]}
  (let [num-results (count (:rows results))]
    (cond-> {:row_count num-results
             :status    :completed
             :data      results}
      (= num-results max-result-rows) (assoc-in [:data :rows_truncated] max-result-rows)))) ; so the front-end can let the user know why they're being arbitarily limited

;; ### POST-PROCESS

(defn post-process
  "Apply post-processing steps to the RESULTS of a QUERY, such as applying cumulative sum."
  [driver query results]
  {:pre [(map? query)
         (map? results)
         (sequential? (:columns results))
         (sequential? (:cols results))
         (sequential? (:rows results))]}
  ;; Double-check that there are no duplicate columns in results
  (assert (= (count (:columns results))
             (count (set (:columns results))))
          (format "Duplicate columns in results: %s" (vec (:columns results))))
  (->> results
       limit-max-result-rows
       (#(case (keyword (:type query))
           :native %
           :query  (post-process-cumulative-sum (:query query) %)))
       convert-unix-timestamps-to-dates
       add-row-count-and-status))


;; # ANNOTATION 2.0

;; ## Ordering
;;
;; Fields should be returned in the following order:
;;
;; 1.  Breakout Fields
;; 2.  Aggregation Fields (e.g. sum, count)
;; 3.  Fields clause Fields, if they were added explicitly
;; 4.  All other Fields, sorted by :position
(defn- order-cols
  "Construct a sequence of column keywords that should be used for pulling ordered rows from RESULTS.
   FIELDS should be a sequence of all `Fields` for the `Table` associated with QUERY."
  [{{breakout-ids :breakout, fields-ids :fields} :query} results fields]
  {:post [(= (set %)
             (set (keys (first results))))]}
  ;; Order needs to be [breakout-cols aggregate-cols fields-cols other-cols]
  (let [field-id->field (zipmap (map :id fields) fields)

        ;; Get IDs from Fields clause *if* it was added explicitly and other all other Field IDs for Table. Filter out :breakout field IDs
        all-field-ids    (map :id fields)
        non-breakout-ids (->> (when-not (:fields-is-implicit @*internal-context*) fields-ids)
                              (concat all-field-ids)
                              (filter (complement (partial contains? (set breakout-ids))))
                              distinct)

        ;; Get all the keywords returned by the results
        result-kws       (set (keys (first results)))

        ;; Convert breakout/non-breakout IDs to keywords
        ids->kws         #(some->> (map field-id->field %)
                                   (map :name)
                                   (map keyword)
                                   (filter (partial contains? result-kws)))
        breakout-kws     (ids->kws breakout-ids)
        non-breakout-kws (ids->kws non-breakout-ids)

        ;; Get the results kws specific to :aggregation (not part of breakout/non-breakout-kws)
        ag-kws           (->> result-kws
                              (filter (complement (partial contains? (set (concat breakout-kws non-breakout-kws))))))]

    ;; Create a combined sequence of aggregate result KWs + other ordered kws
    (concat breakout-kws ag-kws non-breakout-kws)))

(defn- add-fields-extra-info
  "Add `:extra_info` about `ForeignKeys` to `Fields` whose `special_type` is `:fk`."
  [fields]
  ;; Get a sequence of add Field IDs that have a :special_type of FK
  (let [fk-field-ids            (->> fields
                                     (filter #(= (:special_type %) :fk))
                                     (map :id)
                                     (filter identity))
        ;; Fetch maps of the info we need for :extra_info if there are any FK Fields
        field-id->dest-field-id (when (seq fk-field-ids)
                                  (sel :many :field->field [ForeignKey :origin_id :destination_id], :origin_id [in fk-field-ids]))
        dest-field-id->table-id (when (seq fk-field-ids)
                                  (sel :many :id->field [Field :table_id], :id [in (vals field-id->dest-field-id)]))]
    ;; Add :extra_info to every Field. Empty if it's not an FK, otherwise add a map with target Table ID
    (for [{:keys [special_type], :as field} fields]
      (cond-> field
        (:id field) (assoc :extra_info (if-not (= special_type :fk) {}
                                               {:target_table_id (->> (:id field)
                                                                      field-id->dest-field-id
                                                                      dest-field-id->table-id)}))))))

(defn- get-cols-info
  "Get column info for the `:cols` part of the QP results."
  [{{[ag-type ag-field-id] :aggregation} :query} fields ordered-col-kws]
  (let [field-kw->field (zipmap (map #(keyword (:name %)) fields)
                                fields)
        field-id->field (delay (zipmap (map :id fields) ; a delay since we probably won't need it
                                       fields))]
    (->> (for [col-kw ordered-col-kws]
           (or
            ;; If col-kw is a known Field return that
            (field-kw->field col-kw)
            ;; Otherwise it is an aggregation column like :sum, build a map of information to return
            (merge (assert ag-type)
                   {:name        (name col-kw)
                    :id          nil
                    :table_id    nil
                    :description nil}
                   (cond
                     ;; avg, stddev, and sum should inherit the base_type and special_type from the Field they're aggregating
                     (contains? #{:avg :stddev :sum} col-kw) (-> (@field-id->field ag-field-id)
                                                                 (select-keys [:base_type :special_type]))
                     ;; count should always be IntegerField/number
                     (= col-kw :count)                       {:base_type    :IntegerField
                                                              :special_type :number}))))
         ;; Add FK info the the resulting Fields
         add-fields-extra-info)))

(defn annotate
  "Take a sequence of RESULTS of executing QUERY and return the \"annotated\" results we pass to postprocessing -- the map with `:cols`, `:columns`, and `:rows`.
   RESULTS should be a sequence of *maps*, keyed by result column -> value."
  [{{:keys [source_table]} :query, :as query}, results & [uncastify-fn]]
  {:pre [(integer? source_table)]}
  (let [results         (if-not uncastify-fn results
                                (for [row results]
                                  (m/map-keys uncastify-fn row)))
        fields          (sel :many :fields [Field :id :table_id :name :description :base_type :special_type]
                             :table_id source_table
                             :active true
                             (order :position :asc)
                             (order :id :desc))      ; not sure why we're ordering things this way but this is what the tests expect so (?)
        ordered-col-kws (order-cols query results fields)]
    {:rows    (for [row results]
                (map row ordered-col-kws))
     :columns (map name ordered-col-kws)
     :cols    (get-cols-info query fields ordered-col-kws)}))
