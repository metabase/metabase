(ns metabase.query-processor.middleware.reconcile-breakout-and-order-by-bucketing-test
  (:require [expectations :refer [expect]]
            [metabase.query-processor.middleware.reconcile-breakout-and-order-by-bucketing :as reconcile-bucketing]
            [metabase.test :as mt]))

(defn- mbql-query {:style/indent 0} [& clauses]
  {:database 1
   :type     :query
   :query    (apply assoc {:source-table 1} clauses)})

(defn- reconcile-breakout-and-order-by-bucketing [& clauses]
  (:pre (mt/test-qp-middleware reconcile-bucketing/reconcile-breakout-and-order-by-bucketing (apply mbql-query clauses))))

;; will unbucketed datetime order-bys get bucketed if Field it references is bucketed in a `breakout` clause?
(expect
  (mbql-query
    :breakout [[:datetime-field [:field-id 1] :day]]
    :order-by [[:asc [:datetime-field [:field-id 1] :day]]])
  (reconcile-breakout-and-order-by-bucketing
    :breakout [[:datetime-field [:field-id 1] :day]]
    :order-by [[:asc [:field-id 1]]]))

;; should also work with FKs
(expect
  (mbql-query
    :breakout [[:datetime-field [:fk-> [:field-id 1] [:field-id 2]] :day]]
    :order-by [[:asc [:datetime-field [:fk-> [:field-id 1] [:field-id 2]] :day]]])
  (reconcile-breakout-and-order-by-bucketing
    :breakout [[:datetime-field [:fk-> [:field-id 1] [:field-id 2]] :day]]
    :order-by [[:asc [:fk-> [:field-id 1] [:field-id 2]]]]))

;; ...and with field literals
(expect
  (mbql-query
    :breakout [[:datetime-field [:field-literal "Corn Field" :type/Text] :day]]
    :order-by [[:asc [:datetime-field [:field-literal "Corn Field" :type/Text] :day]]])
  (reconcile-breakout-and-order-by-bucketing
    :breakout [[:datetime-field [:field-literal "Corn Field" :type/Text] :day]]
    :order-by [[:asc [:field-literal "Corn Field" :type/Text]]]))

;; unbucketed datetimes in order-bys should be left undisturbed if they are not referenced in the breakout clause;
;; this is likely an invalid query, but that isn't this middleware's problem
(expect
  (mbql-query
    :breakout [[:datetime-field [:field-id 2] :day]]
    :order-by [[:asc [:field-id 1]]])
  (reconcile-breakout-and-order-by-bucketing
    :breakout [[:datetime-field [:field-id 2] :day]]
    :order-by [[:asc [:field-id 1]]]))

;; similarly, if a datetime field is already bucketed in a different way in the order-by than the same Field in a
;; breakout clause, we should not do anything, even though the query is likely invalid (we assume you know what you're
;; doing if you explicitly specify a bucketing)
(expect
  (mbql-query
    :breakout [[:datetime-field [:field-id 1] :day]]
    :order-by [[:asc [:datetime-field [:field-id 1] :month]]])
  (reconcile-breakout-and-order-by-bucketing
    :breakout [[:datetime-field [:field-id 1] :day]]
    :order-by [[:asc [:datetime-field [:field-id 1] :month]]]))

;; we should be able to fix multiple order-bys
(expect
  (mbql-query
    :breakout [[:datetime-field [:field-id 1] :day]
               [:datetime-field [:field-id 2] :month]]
    :order-by [[:asc [:datetime-field [:field-id 1] :day]]
               [:desc [:datetime-field [:field-id 2] :month]]])
  (reconcile-breakout-and-order-by-bucketing
    :breakout [[:datetime-field [:field-id 1] :day]
               [:datetime-field [:field-id 2] :month]]
    :order-by [[:asc  [:field-id 1]]
               [:desc [:field-id 2]]]))

;; if for some reason a Field is referenced twice in the order bys, we should only bucket unbucketed references
(expect
  (mbql-query
    :breakout [[:datetime-field [:field-id 1] :day]]
    :order-by [[:asc  [:datetime-field [:field-id 1] :day]]
               [:desc [:datetime-field [:field-id 1] :month]]])
  (reconcile-breakout-and-order-by-bucketing
    :breakout [[:datetime-field [:field-id 1] :day]]
    :order-by [[:asc  [:field-id 1]]
               [:desc [:datetime-field [:field-id 1] :month]]]))

;; if a Field is referenced twice and we bucket an unbucketed reference, creating duplicate order-by clauses, we
;; should remove them, as it is illegal in MBQL 2000
(expect
  (mbql-query
    :breakout [[:datetime-field [:field-id 1] :day]]
    :order-by [[:asc [:datetime-field [:field-id 1] :day]]])
  (reconcile-breakout-and-order-by-bucketing
    :breakout [[:datetime-field [:field-id 1] :day]]
    :order-by [[:asc [:field-id 1]]
               [:asc [:datetime-field [:field-id 1] :day]]]))

;; if there are two breakouts of the same Field with different bucketing, let's just use the bucketing for the first
;; breakout (?)
(expect
  (reconcile-breakout-and-order-by-bucketing
    :breakout [[:datetime-field [:field-id 1] :day]
               [:datetime-field [:field-id 1] :month]]
    :order-by [[:asc [:field-id 1]]]))

;; don't add order bys if there are none
(expect
  (mbql-query
    :breakout [[:datetime-field [:field-id 1] :day]])
  (reconcile-breakout-and-order-by-bucketing
    :breakout [[:datetime-field [:field-id 1] :day]]))

;; we also need to be able to handle bucketing via binning-strategy
(expect
  (mbql-query
    :breakout [[:binning-strategy [:field-id 1] :num-bins 10]]
    :order-by [[:asc [:binning-strategy [:field-id 1] :num-bins 10]]])
  (reconcile-breakout-and-order-by-bucketing
    :breakout [[:binning-strategy [:field-id 1] :num-bins 10]]
    :order-by [[:asc [:field-id 1]]]))
