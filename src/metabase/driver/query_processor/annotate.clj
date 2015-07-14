(ns metabase.driver.query-processor.annotate
  (:refer-clojure :exclude [==])
  (:require [clojure.core.logic :refer :all]
            [clojure.core.logic.arithmetic :as ar]
            [clojure.string :as s]
            [clojure.tools.logging :as log]
            [medley.core :as m]
            [metabase.db :refer [sel]]
            [metabase.driver.query-processor.expand :as expand]
            (metabase.models [field :refer [Field], :as field]
                             [foreign-key :refer [ForeignKey]])
            [metabase.util :as u]))

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
  [{{breakout-fields :breakout, {ag-type :aggregation-type} :aggregation, fields-fields :fields, fields-is-implicit :fields-is-implicit} :query} results fields]
  (let [;; Get all the column name keywords returned by the results
        result-kws       (set (keys (first results)))
        valid-kw?        (partial contains? result-kws)

        breakout-ids     (map :field-id breakout-fields)

        breakout-kws     (->> (for [field breakout-fields]
                                (->> (rest (expand/qualified-name-components field)) ; TODO - this "qualified name for results" should be calculated in the Query expander
                                     (interpose ".")
                                     (apply str)
                                     keyword))
                              (filter valid-kw?))

        fields-ids       (map :field-id fields-fields)

        field-id->field  (zipmap (map :id fields) fields)

        ;; Get IDs from Fields clause *if* it was added explicitly and other all other Field IDs for Table.
        fields-ids       (when-not fields-is-implicit fields-ids)
        all-field-ids    (->> fields    ; Sort the Fields.
                              (sort-by (fn [{:keys [position special_type name]}] ; For each field generate a vector of
                                         [position ; [position special-type-group name]
                                          (cond ; and Clojure will take care of the rest.
                                            (= special_type :id)   0
                                            (= special_type :name) 1
                                            :else                  2)
                                          name]))
                              (map :id)) ; Return the sorted IDs

        ;; Get the aggregate column if any
        ag-kws           (when (and ag-type
                                    (not= ag-type :rows))
                           (let [ag (if (= ag-type :distinct) :count
                                        ag-type)]
                             [ag]))

        ;; Make a helper function that will take a sequence of Field IDs and convert them to corresponding column name keywords.
        ;; Don't include names that aren't part of RESULT-KWS: we fetch *all* the Fields for a Table regardless of the Query, so
        ;; there are likely some unused ones.
        ids->kws         (fn [field-ids]
                           (some->> (map field-id->field field-ids)
                                    (map :name)
                                    (map keyword)
                                    (filter valid-kw?)))

        ;; Concat the Fields clause IDs + the sequence of all Fields ID for the Table.
        ;; Then filter out ones that appear in breakout clause and remove duplicates
        ;; which effectively gives us parts #3 and #4 from above.
        non-breakout-ids (->> (concat fields-ids all-field-ids)
                              (filter (complement (partial contains? (set breakout-ids))))
                              distinct)

        ;; Use fn above to get the keyword column names of other non-aggregation fields [#3 and #4]
        non-breakout-kws (->> (ids->kws non-breakout-ids)
                              (filter (complement (partial contains? (set ag-kws)))))

        ;; Collect all other Fields
        other-kws        (->> result-kws
                              (filter (complement (partial contains? (set (concat breakout-kws non-breakout-kws ag-kws)))))
                              sort)] ; sort by name so results are deterministic

    (when (seq other-kws)
      (log/warn (u/format-color 'red "Warning: not 100%% sure how to order these columns: %s" (vec other-kws))))

    ;; Now combine the breakout [#1] + aggregate [#2] + "non-breakout" [#3 &  #4] column name keywords into a single sequence
    (when-not @(ns-resolve 'metabase.driver.query-processor '*disable-qp-logging*)
      (log/debug (u/format-color 'magenta "Using this ordering: breakout: %s, ag: %s, non-breakout: %s, other: %s"
                                 (vec breakout-kws) (vec ag-kws) (vec non-breakout-kws) (vec other-kws))))

    (let [ordered-kws (concat breakout-kws ag-kws non-breakout-kws other-kws)]
      (assert (and (= (set ordered-kws) result-kws)
                   (= (count ordered-kws) (count result-kws)))
        (format "Order-cols returned invalid results: expected %s, got %s\nbreakout: %s, ag: %s, non-breakout: %s, other: %s" result-kws (vec ordered-kws)
                (vec breakout-kws) (vec ag-kws) (vec non-breakout-kws) (vec other-kws)))
      ordered-kws)))

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
                                  (sel :many :field->field [ForeignKey :origin_id :destination_id], :origin_id [in fk-field-ids], :destination_id [not= nil]))

        ;; Build a map of Destination Field IDs -> Destination Fields
        dest-field-id->field    (when (and (seq fk-field-ids)
                                           (seq (vals field-id->dest-field-id)))
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
  [{{{ag-type :aggregation-type, ag-field :field} :aggregation} :query} fields ordered-col-kws join-table-ids]
  (let [field-kw->field (zipmap (map #(keyword (:name %)) fields)
                                fields)
        field-id->field (delay (zipmap (map :id fields) ; a delay since we probably won't need it
                                       fields))]
    (->> (for [col-kw ordered-col-kws]
           (or
            ;; If col-kw is a known Field return that
            (field-kw->field col-kw)

            ;; Otherwise if this Query included any joins then attempt to lookup a matching Field from one of the join tables
            (and (seq join-table-ids)
                 (sel :one :fields [Field :id :table_id :name :description :base_type :special_type], :name (name col-kw), :table_id [in join-table-ids]))

            ;; Otherwise if this is a nested Field recursively find the appropriate info
            (let [name-components (s/split (name col-kw) #"\.")]
              (when (> (count name-components) 1)
                ;; Find the nested Field by recursing through each Field's :children
                (loop [field-kw->field field-kw->field, [component & more] (map keyword name-components)]
                  (when-let [f (field-kw->field component)]
                    (if-not (seq more)
                      ;; If the are no more components to recurse through give the resulting Field a qualified name like "source.service" and return it
                      (assoc f :name (apply str (interpose "." name-components)))
                      ;; Otherwise recurse with a map of child-name-kw -> child and the rest of the name components
                      (recur (zipmap (map (comp keyword :name) (:children f))
                                     (:children f))
                             more))))))

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
                     :else                                   (do (log/error (u/format-color 'red "Annotation failed: don't know what to do with Field '%s'.\nExpected these Fields:\n%s"
                                                                                            col-kw
                                                                                            (u/pprint-to-str field-kw->field)))
                                                                 {:base_type    :UnknownField
                                                                  :special_type nil})))))
         ;; Add FK info the the resulting Fields
         add-fields-extra-info

         ;; Remove extra data from the resulting Fields
         (map (u/rpartial dissoc :children :parent_id)))))

(defn post-annotate
  "Take a sequence of RESULTS of executing QUERY and return the \"annotated\" results we pass to postprocessing -- the map with `:cols`, `:columns`, and `:rows`.
   RESULTS should be a sequence of *maps*, keyed by result column -> value."
  [qp]
  (fn [{{:keys [join-tables] {source-table-id :id} :source-table} :query, :as query}]
    (let [{:keys [results uncastify-fn]} (qp query)
          _                              (def -query query)
          results                        (if-not uncastify-fn results
                                                 (for [row results]
                                                   (m/map-keys uncastify-fn row)))
          _                              (def -results results)
          _                              (when-not @(ns-resolve 'metabase.driver.query-processor '*disable-qp-logging*)
                                           (log/debug (u/format-color 'magenta "Driver QP returned results with keys: %s." (vec (keys (first results))))))
          join-table-ids                 (set (map :table-id join-tables))
          fields                         (field/unflatten-nested-fields (sel :many :fields [Field :id :table_id :name :description :base_type :special_type :parent_id], :table_id source-table-id, :active true))
          ordered-col-kws                (order-cols query results fields)]

      {:rows    (for [row results]
                  (mapv row ordered-col-kws))                                          ; might as well return each row and col info as vecs because we're not worried about making
       :columns (mapv name ordered-col-kws)                                            ; making them lazy, and results are easier to play with in the REPL / paste into unit tests
       :cols    (vec (get-cols-info query fields ordered-col-kws join-table-ids))})))  ; as vecs. Make sure :rows stays lazy!

(require 'metabase.driver)
(defn- x []
  (metabase.driver/process-query {:database 484
                                  :type     :query
                                  :query    {:source_table 1102
                                             :aggregation  ["rows"]
                                             :limit        10}}))

(defn- annotate-2 [{:keys [query]} [first-row :as results]]
  (let [result-keys  (vec (keys first-row))
        num-results  (count result-keys)
        cols         (vec (lvars num-results))
        columns      (vec (lvars num-results))
        query-fields (let [fields (transient [])]
                       (clojure.walk/prewalk (fn [f]
                                               (if-not (= (type f) metabase.driver.query_processor.expand.Field) f
                                                       (conj! fields f)))
                                             query)
                       (->> (persistent! fields)
                            (mapv (partial into {}))
                            (mapv #(update % :field-name keyword))))
        _ (def -fields query-fields)]
    (println result-keys)
    (first (run 1 [q]
             (== q {:cols    cols
                    :columns columns})
             (distincto cols)
             (distincto columns)
             (everyg #(membero % query-fields) cols)
             (everyg #(membero % result-keys) columns)
             (everyg (fn [i]
                       (fresh [field-name]
                         (== (columns i) field-name)
                         (featurec (cols i) {:field-name field-name})))
                     (range num-results))
             (everyg (fn [i]
                       (let [f1 (cols i)
                             f2 (cols (inc i))
                             special-types-orderedo (fn [st1 st2]
                                                      )
                             fields-orderedo (fn [f1 f2]
                                               (fresh [st1 st2 id1 id2]
                                                 (featurec f1 {:special-type st1, :field-id id1})
                                                 (featurec f2 {:special-type st2, :field-id id2})
                                                 (conde
                                                  [(== st1 :id) (!= st2 :id)]
                                                  [(== st1 :fk) (!= st2 :fk)]
                                                  [(== st1 st2)
                                                   (ar/< id1 id2)]
                                                  [(!= st1 :id) (!= st1 :fk) (ar/< id1 id2)])))]
                         (fields-orderedo f1 f2)))
                     (range (dec num-results)))))))

(defn- y []
  (annotate-2 -query -results))
