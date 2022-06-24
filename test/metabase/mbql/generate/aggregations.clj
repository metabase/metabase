(ns metabase.mbql.generate.aggregations
  (:require
   [clojure.test.check.generators :as gens]
   [metabase.mbql.generate.data :as gen.data]
   [metabase.mbql.generate.common :as gen.common]
   [metabase.mbql.generate.expressions :as gen.expressions]))

(defn- fieldless-count-aggregation [k]
  (gens/return [k]))

(defn- field-count-aggregation [k field-generator]
  (gens/let [field field-generator]
    [k field]))

(defn- numeric-aggregation-generator [k field-generator]
  (let [numeric-field-generator (gen.data/numeric-field-generator field-generator)
        arg-generator           (gens/one-of [numeric-field-generator
                                              (gen.expressions/numeric-expression-generator numeric-field-generator)])]
    (gens/let [arg arg-generator]
      [k arg])))

(defn simple-aggregation-generator [field-generator]
  (gens/one-of [(fieldless-count-aggregation :count)
                (field-count-aggregation :count field-generator)
                (fieldless-count-aggregation :cum-count)
                (field-count-aggregation :cum-count field-generator)
                (field-count-aggregation :distinct field-generator)
                (numeric-aggregation-generator :avg field-generator)
                (numeric-aggregation-generator :sum field-generator)
                (numeric-aggregation-generator :cum-sum field-generator)
                (numeric-aggregation-generator :stddev field-generator)
                (numeric-aggregation-generator :min field-generator)
                (numeric-aggregation-generator :max field-generator)
                ;; TODO -- these depend on whether or not the database supports it.
                (numeric-aggregation-generator :median field-generator)
                (numeric-aggregation-generator :percentile field-generator)
                (numeric-aggregation-generator :var field-generator)
                ;; TODO
                #_:metric
                #_:share
                #_:count-where
                #_:sum-where
                #_:case
                (gen.expressions/numeric-expression-generator (gen.data/numeric-field-generator field-generator))
                (gen.expressions/string-expression-generator)
                ]))

;; TODO -- string aggregations

(defn unwrapped-aggregation-generator [field-generator]
  (let [numeric-field-generator (gen.data/numeric-field-generator field-generator)]
    (gens/one-of [(gen.expressions/numeric-expression-generator (gens/one-of [numeric-field-generator
                                                                              (simple-aggregation-generator numeric-field-generator)]))
                  (simple-aggregation-generator field-generator)])))

(def options-generator
  (gens/such-that
   seq
   (gen.common/optional-map-generator
    {:name         (gen.common/nonblank-string)
     :display-name (gens/such-that seq (gen.common/nonblank-string))})
   1000))

(defn wrapped-aggregation-generator [field-generator]
  (gens/let [ag (unwrapped-aggregation-generator field-generator)
             options options-generator]
    [:aggregation-options ag options]))

(defn aggregation-generator [field-generator]
  (gens/one-of [(wrapped-aggregation-generator field-generator)
                (unwrapped-aggregation-generator field-generator)]))

(defn aggregations-generator [field-generator]
  (gens/vector-distinct (aggregation-generator field-generator) {:min-elements 1}))
