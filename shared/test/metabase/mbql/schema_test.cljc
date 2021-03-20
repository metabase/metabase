(ns metabase.mbql.schema-test
  (:require [clojure.test :as t]
            [metabase.mbql.schema :as mbql.s]
            [schema.core :as s]))

(defn- valid? [clause]
  (not (s/check mbql.s/field clause)))

(t/deftest field-clause-test
  (t/testing "Make sure our schema validates `:field` clauses correctly"
    (t/are [clause expected] (= expected
                                (not (s/check mbql.s/field clause)))
      [:field 1 nil]                                                          true
      [:field 1 {}]                                                           true
      [:field 1 {:x true}]                                                    true
      [:field 1 2]                                                            false
      [:field "wow" nil]                                                      false
      [:field "wow" {}]                                                       false
      [:field "wow" 1]                                                        false
      [:field "wow" {:base-type :type/Integer}]                               true
      [:field "wow" {:base-type 100}]                                         false
      [:field "wow" {:base-type :type/Integer, :temporal-unit :month}]        true
      [:field "wow" {:base-type :type/Date, :temporal-unit :month}]           true
      [:field "wow" {:base-type :type/DateTimeWithTZ, :temporal-unit :month}] true
      [:field "wow" {:base-type :type/Time, :temporal-unit :month}]           false
      [:field 1 {:binning {:strategy :num-bins}}]                             false
      [:field 1 {:binning {:strategy :num-bins, :num-bins 1}}]                true
      [:field 1 {:binning {:strategy :num-bins, :num-bins 1.5}}]              false
      [:field 1 {:binning {:strategy :num-bins, :num-bins -1}}]               false
      [:field 1 {:binning {:strategy :default}}]                              true
      [:field 1 {:binning {:strategy :fake}}]                                 false)))
