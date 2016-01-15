(ns metabase.driver.query-processor.macros-test
  (:require [expectations :refer :all]
            [metabase.driver.query-processor.macros :refer :all]
            [metabase.models.database :refer [Database]]
            [metabase.models.metric :refer [Metric]]
            [metabase.models.segment :refer [Segment]]
            [metabase.models.table :refer [Table]]
            [metabase.test.data.users :refer :all]
            [metabase.test.util :as tu]))

;; expand-macros

;; no Segment or Metric should yield exact same query
(expect
  {:database 1
   :type     :query
   :query    {:aggregation ["rows"]
              :filter      ["AND" [">" 4 1]]
              :breakout    [17]}}
  (expand-macros {:database 1
                  :type     :query
                  :query    {:aggregation ["rows"]
                             :filter      ["AND" [">" 4 1]]
                             :breakout    [17]}}))

;; just segments
(expect
  {:database 1
   :type     :query
   :query    {:aggregation ["rows"]
              :filter      ["AND" ["AND" ["=" 5 "abc"]] ["OR" ["AND" ["IS_NULL" 7]] [">" 4 1]]]
              :breakout    [17]}}
  (tu/with-temp Database [{database-id :id} {:name      "Macro Expansion Test"
                                             :engine    :yeehaw
                                             :details   {}
                                             :is_sample false}]
    (tu/with-temp Table [{table-id :id} {:name   "Macro Expansion Table"
                                         :db_id  database-id
                                         :active true}]
      (tu/with-temp Segment [{segment1 :id} {:creator_id  (user->id :crowberto)
                                             :table_id    table-id
                                             :name        "Test Segment"
                                             :definition  {:filter ["AND" ["=" 5 "abc"]]}}]
        (tu/with-temp Segment [{segment2 :id} {:creator_id  (user->id :crowberto)
                                               :table_id    table-id
                                               :name        "Test Segment"
                                               :definition  {:filter ["AND" ["IS_NULL" 7]]}}]
          (expand-macros {:database 1
                          :type     :query
                          :query    {:aggregation ["rows"]
                                     :filter      ["AND" ["SEGMENT" segment1] ["OR" ["SEGMENT" segment2] [">" 4 1]]]
                                     :breakout    [17]}}))))))

;; just a metric (w/out nested segments)
(expect
  {:database 1
   :type     :query
   :query    {:aggregation ["count"]
              :filter      ["AND" ["AND" [">" 4 1]] ["AND" ["=" 5 "abc"]]]
              :breakout    [17]
              :order_by    [[1 "ASC"]]}}
  (tu/with-temp Database [{database-id :id} {:name      "Macro Expansion Test"
                                             :engine    :yeehaw
                                             :details   {}
                                             :is_sample false}]
    (tu/with-temp Table [{table-id :id} {:name   "Macro Expansion Table"
                                         :db_id  database-id
                                         :active true}]
      (tu/with-temp Metric [{metric1 :id} {:creator_id  (user->id :crowberto)
                                           :table_id    table-id
                                           :name        "Test Metric"
                                           :definition  {:aggregation ["count"]
                                                         :filter      ["AND" ["=" 5 "abc"]]}}]
        (expand-macros {:database 1
                        :type     :query
                        :query    {:aggregation ["METRIC" metric1]
                                   :filter      ["AND" [">" 4 1]]
                                   :breakout    [17]
                                   :order_by    [[1 "ASC"]]}})))))

;; check that when the original filter is empty we simply use our metric filter definition instead
(expect
  {:database 1
   :type     :query
   :query    {:aggregation ["count"]
              :filter      ["AND" ["=" 5 "abc"]]
              :breakout    [17]
              :order_by    [[1 "ASC"]]}}
  (tu/with-temp Database [{database-id :id} {:name      "Macro Expansion Test"
                                             :engine    :yeehaw
                                             :details   {}
                                             :is_sample false}]
    (tu/with-temp Table [{table-id :id} {:name   "Macro Expansion Table"
                                         :db_id  database-id
                                         :active true}]
      (tu/with-temp Metric [{metric1 :id} {:creator_id  (user->id :crowberto)
                                           :table_id    table-id
                                           :name        "Test Metric"
                                           :definition  {:aggregation ["count"]
                                                         :filter      ["AND" ["=" 5 "abc"]]}}]
        (expand-macros {:database 1
                        :type     :query
                        :query    {:aggregation ["METRIC" metric1]
                                   :filter      []
                                   :breakout    [17]
                                   :order_by    [[1 "ASC"]]}})))))

;; metric w/ no filter definition
(expect
  {:database 1
   :type     :query
   :query    {:aggregation ["count"]
              :filter      ["AND" ["=" 5 "abc"]]
              :breakout    [17]
              :order_by    [[1 "ASC"]]}}
  (tu/with-temp Database [{database-id :id} {:name      "Macro Expansion Test"
                                             :engine    :yeehaw
                                             :details   {}
                                             :is_sample false}]
    (tu/with-temp Table [{table-id :id} {:name   "Macro Expansion Table"
                                         :db_id  database-id
                                         :active true}]
      (tu/with-temp Metric [{metric1 :id} {:creator_id  (user->id :crowberto)
                                           :table_id    table-id
                                           :name        "Test Metric"
                                           :definition  {:aggregation ["count"]}}]
        (expand-macros {:database 1
                        :type     :query
                        :query    {:aggregation ["METRIC" metric1]
                                   :filter      ["AND" ["=" 5 "abc"]]
                                   :breakout    [17]
                                   :order_by    [[1 "ASC"]]}})))))

;; a metric w/ nested segments
(expect
  {:database 1
   :type     :query
   :query    {:aggregation ["sum" 18]
              :filter      ["AND" ["AND" [">" 4 1] ["AND" ["IS_NULL" 7]]] ["AND" ["=" 5 "abc"] ["AND" ["BETWEEN" 9 0 25]]]]
              :breakout    [17]
              :order_by    [[1 "ASC"]]}}
  (tu/with-temp Database [{database-id :id} {:name      "Macro Expansion Test"
                                             :engine    :yeehaw
                                             :details   {}
                                             :is_sample false}]
    (tu/with-temp Table [{table-id :id} {:name   "Macro Expansion Table"
                                         :db_id  database-id
                                         :active true}]
      (tu/with-temp Segment [{segment1 :id} {:creator_id  (user->id :crowberto)
                                             :table_id    table-id
                                             :name        "Test Segment"
                                             :definition  {:filter ["AND" ["BETWEEN" 9 0 25]]}}]
        (tu/with-temp Segment [{segment2 :id} {:creator_id  (user->id :crowberto)
                                               :table_id    table-id
                                               :name        "Test Segment"
                                               :definition  {:filter ["AND" ["IS_NULL" 7]]}}]
          (tu/with-temp Metric [{metric1 :id} {:creator_id  (user->id :crowberto)
                                               :table_id    table-id
                                               :name        "Test Metric"
                                               :definition  {:aggregation ["sum" 18]
                                                             :filter      ["AND" ["=" 5 "abc"] ["SEGMENT" segment1]]}}]
            (expand-macros {:database 1
                            :type     :query
                            :query    {:aggregation ["METRIC" metric1]
                                       :filter      ["AND" [">" 4 1] ["SEGMENT" segment2]]
                                       :breakout    [17]
                                       :order_by    [[1 "ASC"]]}})))))))
