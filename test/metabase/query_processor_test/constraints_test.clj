(ns metabase.query-processor-test.constraints-test
  "Test for MBQL `:constraints`"
  (:require [metabase
             [query-processor :as qp]
             [query-processor-test :as qp.test]]
            [metabase.test.data :as data]))

(defn- mbql-query []
  {:database (data/id)
   :type     :query
   :query    {:source-table (data/id :venues)
              :fields       [[:field-id (data/id :venues :name)]]
              :order-by     [[:asc [:field-id (data/id :venues :id)]]]}})

(defn- native-query []
  (qp/query->native (mbql-query)))

;; Do `:max-results` constraints affect the number of rows returned by native queries?
(qp.test/expect-with-non-timeseries-dbs
  [["Red Medicine"]
   ["Stout Burgers & Beers"]
   ["The Apple Pan"]
   ["Wurstküche"]
   ["Brite Spot Family Restaurant"]]
  (qp.test/rows
    (qp/process-query
      {:database    (data/id)
       :type        :native
       :native      (native-query)
       :constraints {:max-results 5}})))

;; does it also work when running via `process-query-and-save-with-max-results-constraints!`, the function that powers
;; endpoints like `POST /api/dataset`?
(qp.test/expect-with-non-timeseries-dbs
  [["Red Medicine"]
   ["Stout Burgers & Beers"]
   ["The Apple Pan"]
   ["Wurstküche"]
   ["Brite Spot Family Restaurant"]]
  (qp.test/rows
    (qp/process-query-and-save-with-max-results-constraints!
        {:database    (data/id)
         :type        :native
         :native      (native-query)
         :constraints {:max-results 5}}
        {:context :question})))

;; constraints should override MBQL `:limit` if lower
(qp.test/expect-with-non-timeseries-dbs
  [["Red Medicine"]
   ["Stout Burgers & Beers"]
   ["The Apple Pan"]]
  (qp.test/rows
    (qp/process-query
      (-> (mbql-query)
          (assoc-in [:query :limit] 10)
          (assoc :constraints {:max-results 3})))))

;; However if `:limit` is lower than `:constraints` we should not return more than the `:limit`
(qp.test/expect-with-non-timeseries-dbs
  [["Red Medicine"]
   ["Stout Burgers & Beers"]
   ["The Apple Pan"]
   ["Wurstküche"]
   ["Brite Spot Family Restaurant"]]
  (qp.test/rows
    (qp/process-query
      (-> (mbql-query)
          (assoc-in [:query :limit] 5)
          (assoc :constraints {:max-results 10})))))
