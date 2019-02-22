(ns metabase.driver.sql.query-processor-test
  (:require [expectations :refer [expect]]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.models.segment :refer [Segment]]
            [metabase.query-processor :as qp]
            [metabase.test.data :as data]
            [toucan.util.test :as tt]))

;; make sure our logic for deciding which order to process keys in the query works as expected
(expect
  [:source-table :breakout :aggregation :fields :abc :def]
  (#'sql.qp/query->keys-in-application-order {:def          6
                                              :abc          5
                                              :source-table 1
                                              :aggregation  3
                                              :fields       4
                                              :breakout     2}))


(defn- test-query
  [query]
  (:data (qp/process-query {:database (data/id)
                            :type     :query
                            :query    query})))

(expect
  0.94
  (-> (test-query {:source-table (data/id :venues)
                   :aggregation  [[:share [:< [:field-id (data/id :venues :price)] 4]]]})
      :rows
      ffirst
      double))
(expect
  nil
  (-> (test-query {:source-table (data/id :venues)
                   :aggregation  [[:share [:< [:field-id (data/id :venues :price)] 4]]]
                   :filter       [:> [:field-id (data/id :venues :price)] Long/MAX_VALUE]})
      :rows
      ffirst))
(tt/expect-with-temp [Segment [{segment-id :id} {:table_id   (data/id :venues)
                                                 :definition {:source-table (data/id :venues)
                                                              :filter       [:< [:field-id (data/id :venues :price)] 4]}}]]
   0.94
   (-> (test-query {:source-table (data/id :venues)
                    :aggregation  [[:share [:segment segment-id]]] })
       :rows
       ffirst
       double))
