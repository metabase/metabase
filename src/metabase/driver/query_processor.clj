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
         expand
         get-special-column-info
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
  "The query we're currently processing, in its original, unexpanded form."
  nil)

(def ^:dynamic *disable-qp-logging*
  "Should we disable logging for the QP? (e.g., during sync we probably want to turn it off to keep logs less cluttered)."
  false)

(def ^:dynamic *internal-context*
  "A neat place to store 'notes-to-self': things individual implementations don't need to know about, like if the `fields` clause was added implicitly."
  (atom nil))

(def ^:dynamic *driver*
  "The driver currently being used to process this query."
  (atom nil))


;; # PREPROCESSOR

(defn preprocess
  "Preprocess QUERY dict, applying various driver-independent transformations to it before it is passed to specific driver query processor implementations."
  [{query-type :type :as query}]
  (case (keyword query-type)
    :query  (preprocess-structured query)
    :native query))

(defn preprocess-structured
  "Preprocess a strucuted QUERY dict."
  [query]
  (let [preprocessed-query (->>
                            ;; Functions that take place before expansion
                            ;; These functions expect just the :query subdictionary (TODO -- these need to be changed to use to expanded query at some point
                            (update-in query [:query] #(->> %
                                                            remove-empty-clauses
                                                            add-implicit-breakout-order-by
                                                            add-implicit-limit
                                                            add-implicit-fields))
                            ;; Functions that take place after expansion
                            ;; These work with the entire expanded query dict including :database_id, etc.
                            expand
                            preprocess-cumulative-sum)]
    (when-not *disable-qp-logging*
      (log/debug (u/format-color 'magenta "\n\nPREPROCESSED/EXPANDED:\n%s" (u/pprint-to-str preprocessed-query))))
    preprocessed-query))


;; ## PREPROCESSOR FNS

;; ### REMOVE-EMPTY-CLAUSES
(def ^:private ^:const clause->empty-forms
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


;;; ### EXPAND

(defn expand
  "Expand the Query Dictionary with the query expander.
   This will be threaded through the subsequent post-processing steps."
  [query]
  (expand/expand query))


;; ### PREPROCESS-CUMULATIVE-SUM

(defn preprocess-cumulative-sum
  "Rewrite queries containing a cumulative sum (`cum_sum`) aggregation to simply fetch the values of the aggregate field instead.
   (Cumulative sum is a special case; it is implemented in post-processing)."
  [{{{ag-type :aggregation-type, ag-field :field} :aggregation, breakout-fields :breakout, order-by :order_by} :query, :as query}]
  (let [cum-sum?                    (= ag-type :cumulative-sum)
        cum-sum-with-breakout?      (and cum-sum?
                                         (seq breakout-fields))
        cum-sum-with-same-breakout? (and cum-sum-with-breakout?
                                         (= (count breakout-fields) 1)
                                         (= (first breakout-fields) ag-field))]

    ;; Cumulative sum is only applicable if it has breakout fields
    ;; For these, store the cumulative sum field under the key :cumulative-sum so we know which one to sum later
    ;; Cumulative summing happens in post-processing
    (cond
      ;; If there's only one breakout field that is the same as the cum_sum field, re-write this as a "rows" aggregation
      ;; to just fetch all the values of the field in question.
      cum-sum-with-same-breakout? (update-in query [:query] #(-> %
                                                                 (dissoc :breakout)
                                                                 (assoc :cumulative-sum ag-field
                                                                        :aggregation    (expand/map->Aggregation {:aggregation-type :rows})
                                                                        :fields         [ag-field])))

      ;; Otherwise if we're breaking out on different fields, rewrite the query as a "sum" aggregation
      cum-sum-with-breakout? (-> query
                                 (assoc-in [:query :cumulative-sum] ag-field)
                                 (assoc-in [:query :aggregation]    (expand/map->Aggregation {:aggregation-type :sum, :field ag-field})))

      ;; Cumulative sum without any breakout fields should just be treated the same way as "sum". Rewrite query as such
      cum-sum? (assoc-in query [:query :aggregation] (expand/map->Aggregation {:aggregation-type :sum, :field ag-field}))

      ;; Otherwise if this isn't a cum_sum query return it as-is
      :else               query)))


;; # POSTPROCESSOR

;; ### POST-PROCESS-CUMULATIVE-SUM

(defn post-process-cumulative-sum
  "Cumulative sum the values of the aggregate `Field` in RESULTS."
  {:arglists '([query results])}
  [{cum-sum-field :cumulative-sum, :as query} {rows :rows, cols :cols, :as results}]
  (if-not cum-sum-field results
          (let [ ;; Determine the index of the field we need to cumulative sum
                cum-sum-field-index (->> cols
                                         (u/indecies-satisfying #(or (= (:name %) "sum")
                                                                     (= (:id %) (:field-id cum-sum-field))))
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
                                        (instance? java.util.Date val)               val                           ; already converted to Date as part of preprocessing,
                                        (contains? timestamp-seconds-col-indecies i) (java.sql.Date. (* val 1000)) ; nothing to do here
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
       convert-unix-timestamps-to-dates
       limit-max-result-rows
       (#(case (keyword (:type query))
           :native %
           :query  (post-process-cumulative-sum (:query query) %)))
       add-row-count-and-status))


;; # ANNOTATION 2.0

;; ## Ordering
;;
;; Fields should be returned in the following order:
;; 1.  Breakout Fields
;;
;; 2.  Aggregation Fields (e.g. sum, count)
;;
;; 3.  Fields clause Fields, if they were added explicitly
;;
;; 4.  All other Fields, sorted by:
;;     A.  :position (ascending)
;;         Users can manually specify default Field ordering for a Table in the Metadata admin. In that case, return Fields in the specified
;;         order; most of the time they'll have the default value of 0, in which case we'll compare...
;;
;;     B.  :special_type "group" -- :id Fields, then :name Fields, then everyting else
;;         Attempt to put the most relevant Fields first. Order the Fields as follows:
;;         1.  :id Fields
;;         2.  :name Fields
;;         3.  all other Fields
;;
;;     C.  Field Name
;;         When two Fields have the same :position and :special_type "group", fall back to sorting Fields alphabetically by name.
;;         This is arbitrary, but it makes the QP deterministic by keeping the results in a consistent order, which makes it testable.
(defn- order-cols
  "Construct a sequence of column keywords that should be used for pulling ordered rows from RESULTS.
   FIELDS should be a sequence of all `Fields` for the `Table` associated with QUERY."
  [{{breakout-fields :breakout, fields-fields :fields} :query} results fields]
  {:post [(= (set %)
             (set (keys (first results))))]}
  (let [;; TODO - This function was written before the advent of the expanded query it is designed to work with Field IDs rather than expanded forms
        ;; Since this logic is delecate I've side-stepped the issue by converting the expanded Fields back to IDs for the time being.
        ;; We should carefully re-work this function to use expanded Fields so we don't need the complicated logic below to fetch their names
        breakout-ids     (map :field-id breakout-fields)
        fields-ids       (map :field-id fields-fields)

        field-id->field  (zipmap (map :id fields) fields)

        ;; Get IDs from Fields clause *if* it was added explicitly and other all other Field IDs for Table.
        fields-ids       (when-not (:fields-is-implicit @*internal-context*) fields-ids)
        all-field-ids    (->> fields    ; Sort the Fields.
                              (sort-by (fn [{:keys [position special_type name]}] ; For each field generate a vector of
                                         [position ; [position special-type-group name]
                                          (cond ; and Clojure will take care of the rest.
                                            (= special_type :id)   0
                                            (= special_type :name) 1
                                            :else                  2)
                                          name]))
                              (map :id)) ; Return the sorted IDs

        ;; Concat the Fields clause IDs + the sequence of all Fields ID for the Table.
        ;; Then filter out ones that appear in breakout clause and remove duplicates
        ;; which effectively gives us parts #3 and #4 from above.
        non-breakout-ids (->> (concat fields-ids all-field-ids)
                              (filter (complement (partial contains? (set breakout-ids))))
                              distinct)

        ;; Get all the column name keywords returned by the results
        result-kws       (set (keys (first results)))

        ;; Make a helper function that will take a sequence of Field IDs and convert them to corresponding column name keywords.
        ;; Don't include names that aren't part of RESULT-KWS: we fetch *all* the Fields for a Table regardless of the Query, so
        ;; there are likely some unused ones.
        ids->kws         (fn [field-ids]
                           (some->> (map field-id->field field-ids)
                                    (map :name)
                                    (map keyword)
                                    (filter (partial contains? result-kws))))

        ;; Use fn above to get the keyword column names of breakout clause fields [#1] + fields clause fields / other non-aggregation fields [#3 and #4]
        breakout-kws     (ids->kws breakout-ids)
        non-breakout-kws (ids->kws non-breakout-ids)

        ;; Now get all the keyword column names specific to aggregation, such as :sum or :count [#2].
        ;; Just get all the items in RESULT-KWS that *aren't* part of BREAKOUT-KWS or NON-BREAKOUT-KWS
        ag-kws           (->> result-kws
                              ;; TODO - Currently, this will never be more than a single Field, since we only
                              ;; support a single aggregation clause at this point. When we add support for
                              ;; multiple aggregation clauses, we'll need to add some logic to make sure they're
                              ;; being ordered correctly, e.g. the first aggregate column before the second, etc.
                              (filter (complement (partial contains? (set (concat breakout-kws non-breakout-kws))))))]

    ;; Now combine the breakout [#1] + aggregate [#2] + "non-breakout" [#3 &  #4] column name keywords into a single sequence
    (concat breakout-kws ag-kws non-breakout-kws)))

(defn- add-fields-extra-info
  "Add `:extra_info` about `ForeignKeys` to `Fields` whose `special_type` is `:fk`."
  [fields]
  ;; Get a sequence of add Field IDs that have a :special_type of FK
  (let [fk-field-ids            (->> fields
                                     (filter #(= (:special_type %) :fk))
                                     (map :id)
                                     (filter identity))
        ;; Look up the Foreign keys info if applicable.
        ;; Build a map of FK Field IDs -> Destination Field IDs
        field-id->dest-field-id (when (seq fk-field-ids)
                                  (sel :many :field->field [ForeignKey :origin_id :destination_id], :origin_id [in fk-field-ids]))

        ;; Build a map of Destination Field IDs -> Destination Fields
        dest-field-id->field    (when (seq fk-field-ids)
                                  (sel :many :id->fields [Field :id :name :table_id :description :base_type :special_type], :id [in (vals field-id->dest-field-id)]))]

    ;; Add the :extra_info + :target to every Field. For non-FK Fields, these are just {} and nil, respectively.
    (for [{field-id :id, :as field} fields]
      (let [dest-field (when (seq fk-field-ids)
                         (some->> field-id
                                  field-id->dest-field-id
                                  dest-field-id->field))]
        (assoc field
               :target     dest-field
               :extra_info (if-not dest-field {}
                                   {:target_table_id (:table_id dest-field)}))))))

(defn- get-cols-info
  "Get column info for the `:cols` part of the QP results."
  [{{{ag-type :aggregation-type, ag-field :field} :aggregation} :query} fields ordered-col-kws]
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
                     (contains? #{:avg :stddev :sum} col-kw) {:base_type    (:base-type ag-field)
                                                              :special_type (:special-type ag-field)}
                     ;; count should always be IntegerField/number
                     (= col-kw :count)                       {:base_type    :IntegerField
                                                              :special_type :number}
                     ;; Otherwise something went wrong !
                     :else                                   (throw (Exception. (format "Annotation failed: don't know what to do with Field '%s'.\nExpected these Fields:\n%s"
                                                                                        col-kw
                                                                                        (u/pprint-to-str field-kw->field))))))))
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
        fields          (sel :many :fields [Field :id :table_id :name :description :base_type :special_type], :table_id source_table, :active true)
        ordered-col-kws (order-cols query results fields)]
    {:rows    (for [row results]
                (mapv row ordered-col-kws))                         ; might as well return each row and col info as vecs because we're not worried about making
     :columns (mapv name ordered-col-kws)                           ; making them lazy, and results are easier to play with in the REPL / paste into unit tests
     :cols    (vec (get-cols-info query fields ordered-col-kws))})) ; as vecs. Make sure
