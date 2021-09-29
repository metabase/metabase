(ns metabase.automagic-dashboards.comparison-test
  (:require [clojure.test :refer :all]
            [metabase.automagic-dashboards.comparison :as c :refer :all]
            [metabase.automagic-dashboards.core :as automagic-dashboards]
            [metabase.models :refer [Card Segment Table]]
            [metabase.models.query :as query]
            [metabase.test :as mt]
            [metabase.test.automagic-dashboards :refer :all]))

(def ^:private segment
  (delay
   {:table_id   (mt/id :venues)
    :definition {:filter [:> [:field (mt/id :venues :price) nil] 10]}}))

(defn- test-comparison
  [left right]
  (-> left
      (automagic-dashboards/automagic-analysis {})
      (c/comparison-dashboard left right {})
      :ordered_cards
      count
      pos?))

;; TODO -- I don't know what these are supposed to test. So I have no idea what to name them.

(deftest test-1
  (mt/with-temp Segment [{segment-id :id} @segment]
    (mt/with-test-user :rasta
      (with-dashboard-cleanup
        (is (some? (test-comparison (Table (mt/id :venues)) (Segment segment-id))))
        (is (some? (test-comparison (Segment segment-id) (Table (mt/id :venues)))))))))

(deftest test-2
  (mt/with-temp* [Segment [{segment1-id :id} @segment]
                  Segment [{segment2-id :id} {:table_id   (mt/id :venues)
                                              :definition {:filter [:< [:field (mt/id :venues :price) nil] 4]}}]]
    (mt/with-test-user :rasta
      (with-dashboard-cleanup
        (is (some? (test-comparison (Segment segment1-id) (Segment segment2-id))))))))

(deftest test-3
  (mt/with-test-user :rasta
    (with-dashboard-cleanup
      (let [q (query/adhoc-query {:query    {:filter       (-> @segment :definition :filter)
                                             :source-table (mt/id :venues)}
                                  :type     :query
                                  :database (mt/id)})]
        (is (some? (test-comparison (Table (mt/id :venues)) q)))))))

(deftest test-4
  (mt/with-temp Card [{card-id :id} {:table_id      (mt/id :venues)
                                     :dataset_query {:query    {:filter       (-> @segment :definition :filter)
                                                                :source-table (mt/id :venues)}
                                                     :type     :query
                                                     :database (mt/id)}}]
    (mt/with-test-user :rasta
      (with-dashboard-cleanup
        (is (some? (test-comparison (Table (mt/id :venues)) (Card card-id))))))))
