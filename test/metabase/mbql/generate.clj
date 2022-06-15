(ns metabase.mbql.generate
  (:require
   [clojure.test :as t]
   [clojure.test.check.generators :as gens]
   [metabase.mbql.generate.aggregations :as gen.aggregations]
   [metabase.mbql.generate.common :as gen.common]
   [metabase.mbql.generate.data :as gen.data]
   [metabase.mbql.generate.expressions :as gen.expressions]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan.db :as db]))

(defn fields-generator [field-generator]
  (gens/such-that seq (gens/vector-distinct field-generator)))

(def limit-generator
  (gens/large-integer* {:min 1}))

(defn order-by-generator [field-generator]
  ;; TODO -- order by expression references or aggregation references. I don't think arbitary expressions are currently
  ;; allowed.
  (gens/such-that seq
                  (gens/vector-distinct (gens/let [field field-generator
                                                   direction (gens/elements #{:asc :desc})]
                                          [direction field]))
                  1000))

(defn inner-query-generator [field-generator]
  (gens/let [expressions (gens/one-of [(gens/return nil)
                                       (gen.expressions/expressions-map-generator field-generator)])]
    (let [expression-refs-generator (when (seq expressions)
                                      (gens/elements (for [[expression-name] expressions]
                                                       ;; TODO
                                                       [:expression expression-name {:base-type :type/Number}])))
          field-expr-generator      (gens/one-of (filter some? [field-generator
                                                                expression-refs-generator]))]
      (gens/let [aggregations (gens/one-of [(gens/return nil)
                                            (gen.aggregations/aggregations-generator field-expr-generator)])]
        (let [ag-refs                 (for [i (range (count aggregations))]
                                        [:aggregation i {:base-type :type/Number}])
              ag-refs-generator       (when (seq ag-refs)
                                        (gens/elements ag-refs))
              field-expr-ag-generator (gens/one-of (filter some? [field-expr-generator
                                                                  ag-refs-generator]))]
          (gens/let [breakout (gens/one-of [(gens/return nil)
                                            (fields-generator field-expr-generator)])
                     m (gen.common/optional-map-generator
                        { ;; TODO -- fields should exclude stuff in breakout.
                         :fields   (gens/let [fields (fields-generator field-expr-generator)]
                                     (not-empty (vec (remove (set breakout) fields))))
                         ;; :filter      (gens/return :TODO-filter)
                         ;; :joins       (gens/return :TODO-joins)
                         :limit    limit-generator
                         ;; if we have a breakout (i.e. a GROUP BY) we can only sort by aggregation references or breakout columns
                         :order-by (order-by-generator
                                    (if (seq breakout)
                                      (gens/one-of (filter some? [(gens/elements breakout)
                                                                  ag-refs-generator]))
                                      field-expr-ag-generator))})]
            (merge (when (seq breakout)
                     {:breakout breakout})
                   (when (seq expressions)
                     {:expressions expressions})
                   (when (seq aggregations)
                     {:aggregation aggregations})
                   m)))))))

(defn query-generator [database-or-id]
  (gens/let [source-table-id (gen.data/source-table-id-generator database-or-id)
             inner-query     (inner-query-generator (gen.data/field-generator source-table-id))
             maybe-join      (maybe nil
                                    (gen.data/source-table-id-generator database-or-id))]
    (let [temp-q {:database (u/the-id database-or-id)
                  :type     :query
                  :query    (merge {:source-table       source-table-id
                                    :-source-table-name (db/select-one-field :name 'Table :id source-table-id)}
                                   inner-query)}]
      (if (some? maybe-join)
        (assoc temp-q :join some shit)
        temp-q))))

;; TODO `:source-query` with or without `:source-metadata`

(defn random-query []
  (rand-nth (gens/sample (query-generator (mt/id)))))

(defn test-random-query []
  (let [query (random-query)]
    (mt/with-native-query-testing-context query
      (t/is (some? (mt/rows
                    (qp/process-query query)))))))
