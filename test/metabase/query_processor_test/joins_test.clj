(ns metabase.query-processor-test.joins-test
  "Test for JOIN behavior."
  (:require [metabase.query-processor-test :refer :all]
            [metabase.query-processor.middleware.expand :as ql]
            [metabase.test.data :as data]
            [metabase.test.data.datasets :as datasets]))

;; The top 10 cities by number of Tupac sightings
;; Test that we can breakout on an FK field (Note how the FK Field is returned in the results)
(datasets/expect-with-engines (non-timeseries-engines-with-feature :foreign-keys)
  [["Arlington"    16]
   ["Albany"       15]
   ["Portland"     14]
   ["Louisville"   13]
   ["Philadelphia" 13]
   ["Anchorage"    12]
   ["Lincoln"      12]
   ["Houston"      11]
   ["Irvine"       11]
   ["Lakeland"     11]]
  (->> (data/dataset tupac-sightings
         (data/run-query sightings
           (ql/aggregation (ql/count))
           (ql/breakout $city_id->cities.name)
           (ql/order-by (ql/desc (ql/aggregate-field 0)))
           (ql/limit 10)))
       rows (format-rows-by [str int])))


;; Number of Tupac sightings in the Expa office
;; (he was spotted here 60 times)
;; Test that we can filter on an FK field
(datasets/expect-with-engines (non-timeseries-engines-with-feature :foreign-keys)
  [[60]]
  (->> (data/dataset tupac-sightings
         (data/run-query sightings
           (ql/aggregation (ql/count))
           (ql/filter (ql/= $category_id->categories.id 8))))
       rows (format-rows-by [int])))


;; THE 10 MOST RECENT TUPAC SIGHTINGS (!)
;; (What he was doing when we saw him, sighting ID)
;; Check that we can include an FK field in the :fields clause
(datasets/expect-with-engines (non-timeseries-engines-with-feature :foreign-keys)
  [[772 "In the Park"]
   [894 "Working at a Pet Store"]
   [684 "At the Airport"]
   [199 "At a Restaurant"]
   [33 "Working as a Limo Driver"]
   [902 "At Starbucks"]
   [927 "On TV"]
   [996 "At a Restaurant"]
   [897 "Wearing a Biggie Shirt"]
   [499 "In the Expa Office"]]
  (->> (data/dataset tupac-sightings
         (data/run-query sightings
           (ql/fields $id $category_id->categories.name)
           (ql/order-by (ql/desc $timestamp))
           (ql/limit 10)))
       rows (format-rows-by [int str])))


;; 1. Check that we can order by Foreign Keys
;;    (this query targets sightings and orders by cities.name and categories.name)
;; 2. Check that we can join MULTIPLE tables in a single query
;;    (this query joins both cities and categories)
(datasets/expect-with-engines (non-timeseries-engines-with-feature :foreign-keys)
  ;; CITY_ID, CATEGORY_ID, ID
  ;; Cities are already alphabetized in the source data which is why CITY_ID is sorted
  [[1 12   6]
   [1 11 355]
   [1 11 596]
   [1 13 379]
   [1  5 413]
   [1  1 426]
   [2 11  67]
   [2 11 524]
   [2 13  77]
   [2 13 202]]
  (->> (data/dataset tupac-sightings
         (data/run-query sightings
           (ql/order-by (ql/asc $city_id->cities.name)
                        (ql/desc $category_id->categories.name)
                        (ql/asc $id))
           (ql/limit 10)))
       ;; drop timestamps. reverse ordering to make the results columns order match order_by
       rows (map butlast) (map reverse) (format-rows-by [int int int])))


;; Check that trying to use a Foreign Key fails for Mongo
(datasets/expect-with-engines (non-timeseries-engines-without-feature :foreign-keys)
  {:status :failed
   :error "foreign-keys is not supported by this driver."}
  (select-keys (data/dataset tupac-sightings
                 (data/run-query sightings
                   (ql/order-by (ql/asc $city_id->cities.name)
                                (ql/desc $category_id->categories.name)
                                (ql/asc $id))
                   (ql/limit 10)))
               [:status :error]))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                 MULTIPLE JOINS                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; CAN WE JOIN AGAINST THE SAME TABLE TWICE (MULTIPLE FKS TO A SINGLE TABLE!?)
;; Query should look something like:
;; SELECT USERS__via__SENDER_ID.NAME AS NAME, count(*) AS count
;; FROM PUBLIC.MESSAGES
;; LEFT JOIN PUBLIC.USERS USERS__via__RECIEVER_ID
;;   ON PUBLIC.MESSAGES.RECIEVER_ID = USERS__via__RECIEVER_ID.ID
;; LEFT JOIN PUBLIC.USERS USERS__via__SENDER_ID
;;   ON PUBLIC.MESSAGES.SENDER_ID = USERS__via__SENDER_ID.ID
;; WHERE USERS__via__RECIEVER_ID.NAME = 'Rasta Toucan'
;; GROUP BY USERS__via__SENDER_ID.NAME
;; ORDER BY USERS__via__SENDER_ID.NAME ASC
(datasets/expect-with-engines (non-timeseries-engines-with-feature :foreign-keys)
  [["Bob the Sea Gull" 2]
   ["Brenda Blackbird" 2]
   ["Lucky Pigeon"     2]
   ["Peter Pelican"    5]
   ["Ronald Raven"     1]]
  (data/dataset avian-singles
    (format-rows-by [str int]
      (rows (data/run-query messages
              (ql/aggregation (ql/count))
              (ql/breakout $sender_id->users.name)
              (ql/filter (ql/= $reciever_id->users.name "Rasta Toucan")))))))
