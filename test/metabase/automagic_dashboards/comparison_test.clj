(ns metabase.automagic-dashboards.comparison-test
  (:require [expectations :refer :all]
            [metabase
             [models :refer [Card Segment Table]]
             [test :as mt]]
            [metabase.automagic-dashboards
             [comparison :as c :refer :all]
             [core :refer [automagic-analysis]]]
            [metabase.models.query :as query]
            [metabase.test
             [automagic-dashboards :refer :all]
             [data :as data]]
            [toucan.util.test :as tt]))

(def ^:private segment
  (delay
   {:table_id   (data/id :venues)
    :definition {:filter [:> [:field-id (data/id :venues :price)] 10]}}))

(defn- test-comparison
  [left right]
  (-> left
      (automagic-analysis {})
      (comparison-dashboard left right {})
      :ordered_cards
      count
      pos?))

(expect
  (tt/with-temp* [Segment [{segment-id :id} @segment]]
    (mt/with-test-user :rasta
      (with-dashboard-cleanup
        (and (test-comparison (Table (data/id :venues)) (Segment segment-id))
             (test-comparison (Segment segment-id) (Table (data/id :venues))))))))

(expect
  (tt/with-temp* [Segment [{segment1-id :id} @segment]
                  Segment [{segment2-id :id} {:table_id (data/id :venues)
                                              :definition {:filter [:< [:field-id (data/id :venues :price)] 4]}}]]
    (mt/with-test-user :rasta
      (with-dashboard-cleanup
        (test-comparison (Segment segment1-id) (Segment segment2-id))))))

(expect
  (mt/with-test-user :rasta
    (with-dashboard-cleanup
      (let [q (query/adhoc-query {:query {:filter (-> @segment :definition :filter)
                                          :source-table (data/id :venues)}
                                  :type :query
                                  :database (data/id)})]
        (test-comparison (Table (data/id :venues)) q)))))

(expect
  (tt/with-temp* [Card [{card-id :id} {:table_id      (data/id :venues)
                                       :dataset_query {:query {:filter (-> @segment :definition :filter)
                                                               :source-table (data/id :venues)}
                                                       :type :query
                                                       :database (data/id)}}]]
    (mt/with-test-user :rasta
      (with-dashboard-cleanup
        (test-comparison (Table (data/id :venues)) (Card card-id))))))
