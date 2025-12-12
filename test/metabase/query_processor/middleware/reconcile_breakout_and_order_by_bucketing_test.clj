(ns metabase.query-processor.middleware.reconcile-breakout-and-order-by-bucketing-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.util :as lib.schema.util]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.query-processor.middleware.reconcile-breakout-and-order-by-bucketing :as reconcile-bucketing]))

(defn- mbql-query* [& clauses]
  (lib/query
   (lib.tu/mock-metadata-provider
    {:database (assoc meta/database :id 1)
     :tables   [(assoc (meta/table-metadata :checkins)
                       :id 1)]
     :fields   [(assoc (meta/field-metadata :checkins :date)
                       :table-id 1
                       :id 1)
                (assoc (meta/field-metadata :checkins :date)
                       :table-id 1
                       :id 2)]})
   {:database 1
    :type     :query
    :query    (apply assoc {:source-table 1} clauses)}))

(defn- mbql-query [& clauses]
  (-> (apply mbql-query* clauses)
      lib.schema.util/remove-lib-uuids))

(defn- reconcile-breakout-and-order-by-bucketing [& clauses]
  (reconcile-bucketing/reconcile-breakout-and-order-by-bucketing
   (apply mbql-query* clauses)))

(deftest ^:parallel bucket-unbucketed-temporal-fields-test
  (testing "will unbucketed datetime order-bys get bucketed if Field it references is bucketed in a `breakout` clause?"
    (is (=? (mbql-query
             :breakout [[:field 1 {:temporal-unit :day}]]
             :order-by [[:asc [:field 1 {:temporal-unit :day}]]])
            (reconcile-breakout-and-order-by-bucketing
             :breakout [[:field 1 {:temporal-unit :day}]]
             :order-by [[:asc [:field 1 nil]]])))))

(deftest ^:parallel bucket-unbucketed-temporal-fields-test-2
  (testing "should also work with FKs"
    (is (=? (mbql-query
             :breakout [[:field 2 {:source-field 1, :temporal-unit :day}]]
             :order-by [[:asc [:field 2 {:source-field 1, :temporal-unit :day}]]])
            (reconcile-breakout-and-order-by-bucketing
             :breakout [[:field 2 {:source-field 1, :temporal-unit :day}]]
             :order-by [[:asc [:field 2 {:source-field 1}]]])))))

(deftest ^:parallel bucket-unbucketed-temporal-fields-test-3
  (testing "should also work with original temporal unit"
    (is (=? (mbql-query
             :breakout [[:field 2 {:source-field 1, :temporal-unit :day :original-temporal-unit "month"}]]
             :order-by [[:asc [:field 2 {:source-field 1, :temporal-unit :day :original-temporal-unit "month"}]]])
            (reconcile-breakout-and-order-by-bucketing
             :breakout [[:field 2 {:source-field 1, :temporal-unit :day :original-temporal-unit "month"}]]
             :order-by [[:asc [:field 2 {:source-field 1}]]])))))

(deftest ^:parallel bucket-unbucketed-temporal-fields-test-4
  (testing "...and with field literals"
    (is (=? (mbql-query
             :breakout [[:field "Corn Field" {:base-type :type/Text, :temporal-unit :day}]]
             :order-by [[:asc [:field "Corn Field" {:base-type :type/Text, :temporal-unit :day}]]])
            (reconcile-breakout-and-order-by-bucketing
             :breakout [[:field "Corn Field" {:base-type :type/Text, :temporal-unit :day}]]
             :order-by [[:asc [:field "Corn Field" {:base-type :type/Text}]]])))))

(deftest ^:parallel bucket-unbucketed-temporal-expressions-test
  (testing "will unbucketed datetime order-bys get bucketed if Expression it references is bucketed in a `breakout` clause?"
    (is (=? (mbql-query
             :breakout [[:expression "Corn Field" {:base-type :type/Text, :temporal-unit :day}]]
             :order-by [[:asc [:expression "Corn Field" {:base-type :type/Text, :temporal-unit :day}]]])
            (reconcile-breakout-and-order-by-bucketing
             :breakout [[:expression "Corn Field" {:base-type :type/Text, :temporal-unit :day}]]
             :order-by [[:asc [:expression "Corn Field" {:base-type :type/Text}]]])))))

(deftest ^:parallel dont-bucket-fields-not-in-breakout-test
  (testing (str "unbucketed datetimes in order-bys should be left undisturbed if they are not referenced in the "
                "breakout clause; this is likely an invalid query, but that isn't this middleware's problem")
    (is (=? (mbql-query
             :breakout [[:field 2 {:temporal-unit :day}]]
             :order-by [[:asc [:field 1 nil]]])
            (reconcile-breakout-and-order-by-bucketing
             :breakout [[:field 2 {:temporal-unit :day}]]
             :order-by [[:asc [:field 1 nil]]]))))

  (testing (str "similarly, if a datetime field is already bucketed in a different way in the order-by than the same "
                "Field in a breakout clause, we should not do anything, even though the query is likely invalid "
                "(we assume you know what you're doing if you explicitly specify a bucketing)")
    (is (=? (mbql-query
             :breakout [[:field 1 {:temporal-unit :day}]]
             :order-by [[:asc [:field 1 {:temporal-unit :month}]]])
            (reconcile-breakout-and-order-by-bucketing
             :breakout [[:field 1 {:temporal-unit :day}]]
             :order-by [[:asc [:field 1 {:temporal-unit :month}]]])))))

(deftest ^:parallel multiple-order-by-clauses-test
  (testing "we should be able to fix multiple order-bys"
    (is (=? (mbql-query
             :breakout [[:field 1 {:temporal-unit :day}]
                        [:field 2 {:temporal-unit :month}]]
             :order-by [[:asc [:field 1 {:temporal-unit :day}]]
                        [:desc [:field 2 {:temporal-unit :month}]]])
            (reconcile-breakout-and-order-by-bucketing
             :breakout [[:field 1 {:temporal-unit :day}]
                        [:field 2 {:temporal-unit :month}]]
             :order-by [[:asc  [:field 1 nil]]
                        [:desc [:field 2 nil]]])))))

(deftest ^:parallel only-bucket-unbucketed-reference-test
  (testing "if for some reason a Field is referenced twice in the order bys, we should only bucket unbucketed references"
    (is (=? (mbql-query
             :breakout [[:field 1 {:temporal-unit :day}]]
             :order-by [[:asc  [:field 1 {:temporal-unit :day}]]
                        [:desc [:field 1 {:temporal-unit :month}]]])
            (reconcile-breakout-and-order-by-bucketing
             :breakout [[:field 1 {:temporal-unit :day}]]
             :order-by [[:asc  [:field 1 nil]]
                        [:desc [:field 1 {:temporal-unit :month}]]])))))

(deftest ^:parallel remove-duplicate-order-by-clauses-test
  (testing (str "if a Field is referenced twice and we bucket an unbucketed reference, creating duplicate order-by "
                "clauses, we should remove them, as it is illegal in MBQL 4+")
    (is (=? (mbql-query
             :breakout [[:field 1 {:temporal-unit :day}]]
             :order-by [[:asc [:field 1 {:temporal-unit :day}]]])
            (reconcile-breakout-and-order-by-bucketing
             :breakout [[:field 1 {:temporal-unit :day}]]
             :order-by [[:asc [:field 1 nil]]
                        [:asc [:field 1 {:temporal-unit :day}]]])))))

(deftest ^:parallel multiple-breakouts-same-field-test
  (testing (str "if there are two breakouts of the same Field with different bucketing, let's just use the bucketing "
                "for the first breakout (?)")
    (is (=? (mbql-query
             :breakout [[:field 1 {:temporal-unit :day}]
                        [:field 1 {:temporal-unit :month}]]
             :order-by [[:asc [:field 1 {:temporal-unit :day}]]])
            (reconcile-breakout-and-order-by-bucketing
             :breakout [[:field 1 {:temporal-unit :day}]
                        [:field 1 {:temporal-unit :month}]]
             :order-by [[:asc [:field 1 nil]]])))))

(deftest ^:parallel dont-add-order-bys-test
  (testing "don't add order bys if there are none"
    (is (=? (mbql-query
             :breakout [[:field 1 {:temporal-unit :day}]])
            (reconcile-breakout-and-order-by-bucketing
             :breakout [[:field 1 {:temporal-unit :day}]])))))

(deftest ^:parallel handle-bucketing-with-binning-test
  (testing "we also need to be able to handle bucketing via binning-strategy"
    (is (=? (mbql-query
             :breakout [[:field 1 {:binning {:strategy :num-bins, :num-bins 10}}]]
             :order-by [[:asc [:field 1 {:binning {:strategy :num-bins, :num-bins 10}}]]])
            (reconcile-breakout-and-order-by-bucketing
             :breakout [[:field 1 {:binning {:strategy :num-bins, :num-bins 10}}]]
             :order-by [[:asc [:field 1 nil]]])))))
