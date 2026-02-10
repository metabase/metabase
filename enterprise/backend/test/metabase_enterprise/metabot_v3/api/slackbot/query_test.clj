(ns metabase-enterprise.metabot-v3.api.slackbot.query-test
  "Integration tests for ad-hoc query execution and visualization."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.api.slackbot.query :as slackbot.query]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt])
  (:import
   (java.awt.image BufferedImage)
   (java.io ByteArrayInputStream)
   (javax.imageio ImageIO)))

(set! *warn-on-reflection* true)

(defn- bytes->image
  "Parse PNG bytes into a BufferedImage. Returns nil if bytes are not a valid image."
  ^BufferedImage [^bytes b]
  (with-open [input-stream (ByteArrayInputStream. b)]
    (ImageIO/read input-stream)))

(deftest execute-adhoc-query-test
  (testing "execute-adhoc-query runs a query and returns results"
    (mt/with-current-user (mt/user->id :rasta)
      (let [mp      (mt/metadata-provider)
            query   (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                        (lib/limit 5))
            results (slackbot.query/execute-adhoc-query query)]
        (testing "returns query results with expected structure"
          (is (map? results))
          (is (contains? results :data))
          (is (contains? (:data results) :rows))
          (is (contains? (:data results) :cols)))
        (testing "returns correct number of rows"
          (is (= 5 (count (get-in results [:data :rows])))))))))

(deftest execute-adhoc-query-aggregation-test
  (testing "execute-adhoc-query handles aggregation queries"
    (mt/with-current-user (mt/user->id :rasta)
      (let [mp      (mt/metadata-provider)
            query   (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                        (lib/aggregate (lib/count))
                        (lib/breakout (lib.metadata/field mp (mt/id :venues :category_id))))
            results (slackbot.query/execute-adhoc-query query)]
        (testing "returns aggregated results"
          (is (seq (get-in results [:data :rows]))))
        (testing "has correct columns for aggregation"
          (let [col-names (map :name (get-in results [:data :cols]))]
            (is (some #(re-find #"(?i)category" %) col-names))
            (is (some #(re-find #"(?i)count" %) col-names))))))))

(deftest generate-adhoc-png-table-test
  (testing "generate-adhoc-png renders table visualization as PNG"
    (mt/with-current-user (mt/user->id :rasta)
      (let [mp    (mt/metadata-provider)
            query (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                      (lib/limit 10))
            png   (slackbot.query/generate-adhoc-png query :display :table)
            image (bytes->image png)]
        (testing "returns parseable PNG"
          (is (some? image)))
        (testing "image has reasonable dimensions"
          (is (< 100 (.getWidth image))))))))

(deftest generate-adhoc-png-bar-chart-test
  (testing "generate-adhoc-png renders bar chart visualization as PNG"
    (mt/with-current-user (mt/user->id :rasta)
      (let [mp    (mt/metadata-provider)
            query (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                      (lib/aggregate (lib/count))
                      (lib/breakout (lib.metadata/field mp (mt/id :venues :category_id))))
            png   (slackbot.query/generate-adhoc-png query :display :bar)
            image (bytes->image png)]
        (testing "returns parseable PNG"
          (is (some? image)))))))

(deftest generate-adhoc-png-line-chart-test
  (testing "generate-adhoc-png renders line chart visualization as PNG"
    (mt/dataset test-data
      (mt/with-current-user (mt/user->id :rasta)
        (let [mp         (mt/metadata-provider)
              created-at (lib.metadata/field mp (mt/id :orders :created_at))
              query      (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                             (lib/aggregate (lib/count))
                             (lib/breakout (lib/with-temporal-bucket created-at :month))
                             (lib/limit 12))
              png        (slackbot.query/generate-adhoc-png query :display :line)
              image      (bytes->image png)]
          (testing "returns parseable PNG"
            (is (some? image))))))))
