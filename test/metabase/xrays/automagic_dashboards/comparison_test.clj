(ns metabase.xrays.automagic-dashboards.comparison-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.xrays.api.automagic-dashboards :as api.automagic-dashboards]
   [metabase.xrays.automagic-dashboards.comparison :as c]
   [metabase.xrays.automagic-dashboards.core :as magic]
   [metabase.xrays.test-util.automagic-dashboards :refer [with-rollback-only-transaction]]
   [toucan2.core :as t2]))

(defn- pmbql-segment-definition
  "Create an MBQL5 segment definition"
  [table-id field-id value]
  (let [metadata-provider (mt/metadata-provider)
        table (lib.metadata/table metadata-provider table-id)
        query (lib/query metadata-provider table)
        field (lib.metadata/field metadata-provider field-id)]
    (lib/filter query (lib/> field value))))

(def ^:private segment
  (delay
    {:table_id (mt/id :venues)
     :definition (pmbql-segment-definition (mt/id :venues) (mt/id :venues :price) 10)}))

(defn- test-comparison
  [left right]
  (-> left
      (magic/automagic-analysis {})
      (c/comparison-dashboard left right {})
      :dashcards
      count
      pos?))

;; TODO -- I don't know what these are supposed to test. So I have no idea what to name them.

(deftest ^:parallel test-1
  (mt/with-temp [:model/Segment {segment-id :id} @segment]
    (mt/with-test-user :rasta
      (with-rollback-only-transaction
        (is (some? (test-comparison (t2/select-one :model/Table :id (mt/id :venues)) (t2/select-one :model/Segment :id segment-id))))
        (is (some? (test-comparison (t2/select-one :model/Segment :id segment-id) (t2/select-one :model/Table :id (mt/id :venues)))))))))

(deftest ^:parallel test-2
  (mt/with-temp [:model/Segment {segment1-id :id} @segment
                 :model/Segment {segment2-id :id} {:table_id (mt/id :venues)
                                                   :definition (let [metadata-provider (mt/metadata-provider)
                                                                     table (lib.metadata/table metadata-provider (mt/id :venues))
                                                                     query (lib/query metadata-provider table)
                                                                     field (lib.metadata/field metadata-provider (mt/id :venues :price))]
                                                                 (lib/filter query (lib/< field 4)))}]
    (mt/with-test-user :rasta
      (with-rollback-only-transaction
        (is (some? (test-comparison (t2/select-one :model/Segment :id segment1-id) (t2/select-one :model/Segment :id segment2-id))))))))

(deftest ^:parallel test-3
  (mt/with-test-user :rasta
    (with-rollback-only-transaction
      (let [q (api.automagic-dashboards/adhoc-query-instance {:query    {:filter       [:> [:field (mt/id :venues :price) nil] 10]
                                                                         :source-table (mt/id :venues)}
                                                              :type     :query
                                                              :database (mt/id)})]
        (is (some? (test-comparison (t2/select-one :model/Table :id (mt/id :venues)) q)))))))

(deftest ^:parallel test-4
  (mt/with-temp [:model/Card {card-id :id} {:table_id      (mt/id :venues)
                                            :dataset_query {:query    {:filter       [:> [:field (mt/id :venues :price) nil] 10]
                                                                       :source-table (mt/id :venues)}
                                                            :type     :query
                                                            :database (mt/id)}}]
    (mt/with-test-user :rasta
      (with-rollback-only-transaction
        (is (some? (test-comparison (t2/select-one :model/Table :id (mt/id :venues)) (t2/select-one :model/Card :id card-id))))))))
