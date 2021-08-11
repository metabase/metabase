(ns metabase.driver.sql.query-processor.preprocess-test
  (:require [clojure.test :refer :all]
            [metabase.driver.sql.query-processor.preprocess :as preprocess]
            [metabase.test :as mt]))

(defn- preprocess
  ([inner-query]
   (preprocess :h2 inner-query))
  ([driver inner-query]
   (mt/with-everything-store (preprocess/preprocess driver inner-query))))

(deftest merged-select-test
  (is (= (:query
          (mt/mbql-query venues
            {:breakout      [$price]
             :sql.qp/select [{:clause $price, :source :breakout, :alias "PRICE"}
                             {:clause [:aggregation 0], :source :aggregation, :alias "sum_id"}
                             {:clause $id, :source :fields, :alias "ID"}
                             {:clause $name, :source :fields, :alias "NAME"}]}))
         (preprocess
          (:query
           (mt/mbql-query venues
             {:fields      [$id $name]
              :breakout    [$price]
              :aggregation [[:aggregation-options [:sum $id] {:name "sum_id"}]]}))))))

(defn x []
  (preprocess
   (:query
    (mt/mbql-query venues
      {:fields      [$id $name]
       :breakout    [$price]
       :aggregation [[:aggregation-options [:sum $id] {:name "sum_id"}]]}))))
