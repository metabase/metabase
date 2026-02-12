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

;;; ------------------------------------------------ Text Output Tests -----------------------------------------------

(deftest results-suitable-for-text-test
  (testing "results-suitable-for-text? returns true only for scalars and empty results"
    (testing "scalar results are suitable for text"
      (let [results {:data {:rows [[42]] :cols [{:name "count"}]}}]
        (is (slackbot.query/results-suitable-for-text? results :scalar))))

    (testing "smartscalar results are suitable for text"
      (let [results {:data {:rows [[100]] :cols [{:name "total"}]}}]
        (is (slackbot.query/results-suitable-for-text? results :smartscalar))))

    (testing "empty results are suitable for text"
      (let [results {:data {:rows [] :cols [{:name "a"}]}}]
        (is (slackbot.query/results-suitable-for-text? results :table))))

    (testing "single cell results are suitable for text"
      (let [results {:data {:rows [[42]] :cols [{:name "count"}]}}]
        (is (slackbot.query/results-suitable-for-text? results :table))))

    (testing "multi-row tables are not suitable for text (use table blocks instead)"
      (let [results {:data {:rows [[1 "a"] [2 "b"]]
                            :cols [{:name "id"} {:name "name"}]}}]
        (is (not (slackbot.query/results-suitable-for-text? results :table)))))))

(deftest format-results-as-text-test
  (testing "format-results-as-text formats scalar and empty results"
    (testing "formats scalar results with bold"
      (let [results {:data {:rows [[42]] :cols [{:name "count"}]}}
            text    (slackbot.query/format-results-as-text results :scalar)]
        (is (string? text))
        (is (re-find #"\*42\*" text))))

    (testing "formats empty results"
      (let [results {:data {:rows [] :cols [{:name "a"}]}}
            text    (slackbot.query/format-results-as-text results :table)]
        (is (= "_No results_" text))))

    (testing "formats single-cell results as scalar"
      (let [results {:data {:rows [[100]] :cols [{:name "total"}]}}
            text    (slackbot.query/format-results-as-text results :table)]
        (is (string? text))
        (is (re-find #"\*100\*" text))))))

(deftest generate-adhoc-output-test
  (testing "generate-adhoc-output with different output modes"
    (mt/with-current-user (mt/user->id :rasta)
      (let [mp    (mt/metadata-provider)
            query (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                      (lib/aggregate (lib/count)))]

        (testing "output-mode :table returns text for scalar display"
          (let [{:keys [type content]} (slackbot.query/generate-adhoc-output
                                        query
                                        :display     :scalar
                                        :output-mode :table)]
            (is (= :text type))
            (is (string? content))
            (is (re-find #"\*\d+\*" content))))

        (testing "output-mode :image returns PNG bytes"
          (let [{:keys [type content]} (slackbot.query/generate-adhoc-output
                                        query
                                        :display     :scalar
                                        :output-mode :image)]
            (is (= :image type))
            (is (bytes? content))
            (is (some? (bytes->image content)))))

        (testing "output-mode :table chooses table blocks for tabular results"
          (let [large-query (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                                (lib/limit 100))
                {:keys [type content]} (slackbot.query/generate-adhoc-output
                                        large-query
                                        :display     :table
                                        :output-mode :table)]
            (is (= :table type))
            (is (vector? content))
            (is (= "table" (:type (first content))))))

        (testing "output-mode :table chooses image for bar charts"
          (let [bar-query (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                              (lib/aggregate (lib/count))
                              (lib/breakout (lib.metadata/field mp (mt/id :venues :category_id))))
                {:keys [type]} (slackbot.query/generate-adhoc-output
                                bar-query
                                :display     :bar
                                :output-mode :table)]
            (is (= :image type))))))))

(deftest generate-adhoc-output-small-table-test
  (testing "generate-adhoc-output uses table blocks for small tables"
    (mt/with-current-user (mt/user->id :rasta)
      (let [mp                     (mt/metadata-provider)
            query                  (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                                       (lib/limit 5))
            {:keys [type content]} (slackbot.query/generate-adhoc-output
                                    query
                                    :display     :table
                                    :output-mode :table)]
        (is (= :table type))
        (is (vector? content))
        (is (= "table" (:type (first content))))))))

;;; ----------------------------------------------- Table Block Tests ------------------------------------------------

(deftest results-suitable-for-table-blocks-test
  (testing "results-suitable-for-table-blocks? returns true for tabular results"
    (testing "table display with data is suitable"
      (let [results {:data {:rows [[1 "a"]] :cols [{:name "id"} {:name "name"}]}}]
        (is (slackbot.query/results-suitable-for-table-blocks? results :table))))

    (testing "pivot display with data is suitable"
      (let [results {:data {:rows [[1 "a"]] :cols [{:name "id"} {:name "name"}]}}]
        (is (slackbot.query/results-suitable-for-table-blocks? results :pivot))))

    (testing "empty results are not suitable"
      (let [results {:data {:rows [] :cols [{:name "id"}]}}]
        (is (not (slackbot.query/results-suitable-for-table-blocks? results :table)))))

    (testing "scalar display is not suitable"
      (let [results {:data {:rows [[42]] :cols [{:name "count"}]}}]
        (is (not (slackbot.query/results-suitable-for-table-blocks? results :scalar)))))

    (testing "bar chart display is not suitable"
      (let [results {:data {:rows [[1 10] [2 20]] :cols [{:name "x"} {:name "y"}]}}]
        (is (not (slackbot.query/results-suitable-for-table-blocks? results :bar)))))))

(deftest format-results-as-table-blocks-test
  (testing "format-results-as-table-blocks creates valid Slack table block structure"
    (let [results {:data {:rows   [[1 "Alice" 100.50]
                                   [2 "Bob" 200.75]]
                          :cols   [{:name "id" :display_name "ID" :base_type :type/Integer}
                                   {:name "name" :display_name "Name" :base_type :type/Text}
                                   {:name "amount" :display_name "Amount" :base_type :type/Float}]}}
          blocks  (slackbot.query/format-results-as-table-blocks results)]

      (testing "returns a vector of blocks"
        (is (vector? blocks))
        (is (pos? (count blocks))))

      (testing "first block is a table block"
        (let [table-block (first blocks)]
          (is (= "table" (:type table-block)))
          (is (contains? table-block :rows))
          (is (contains? table-block :column_settings))))

      (testing "table has header row plus data rows"
        (let [table-block (first blocks)
              rows        (:rows table-block)]
          (is (= 3 (count rows))) ; 1 header + 2 data rows
          (testing "header row has correct values"
            (let [header-row (first rows)]
              (is (= "ID" (get-in header-row [0 :text])))
              (is (= "Name" (get-in header-row [1 :text])))
              (is (= "Amount" (get-in header-row [2 :text])))))))

      (testing "column settings align numeric columns right"
        (let [table-block (first blocks)
              settings    (:column_settings table-block)]
          (is (= "right" (:align (nth settings 0)))) ; ID is integer
          (is (= "left" (:align (nth settings 1))))  ; Name is text
          (is (= "right" (:align (nth settings 2)))))))) ; Amount is float

  (testing "format-results-as-table-blocks truncates large results"
    (let [many-rows (vec (repeat 150 [1 "test"]))
          results   {:data {:rows many-rows
                            :cols [{:name "id"} {:name "name"}]}}
          blocks    (slackbot.query/format-results-as-table-blocks results)]

      (testing "table is truncated to 100 data rows plus header"
        (let [table-block (first blocks)
              rows        (:rows table-block)]
          (is (= 101 (count rows))))) ; 1 header + 100 data rows

      (testing "includes truncation message in context block"
        (is (= 2 (count blocks)))
        (let [context-block (second blocks)]
          (is (= "context" (:type context-block)))
          (is (re-find #"Showing 100 of 150 rows"
                       (get-in context-block [:elements 0 :text]))))))))

(deftest generate-adhoc-output-default-mode-test
  (testing "generate-adhoc-output defaults to :table mode"
    (mt/with-current-user (mt/user->id :rasta)
      (let [mp                     (mt/metadata-provider)
            query                  (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                                       (lib/limit 5))
            {:keys [type content]} (slackbot.query/generate-adhoc-output
                                    query
                                    :display :table)]
        (is (= :table type))
        (is (vector? content))
        (is (= "table" (:type (first content))))))))

;;; ------------------------------------------- Pre-fetched Rows Tests -----------------------------------------------

(deftest generate-adhoc-output-prefetched-rows-test
  (testing "generate-adhoc-output uses pre-fetched rows when provided"
    (let [query          {}  ; Query is ignored when rows are pre-fetched
          rows           [["CA" 150] ["NY" 225] ["TX" 180]]
          result-columns [{:name         "state"
                           :display_name "State"
                           :base_type    :type/Text}
                          {:name         "count"
                           :display_name "Count"
                           :base_type    :type/Integer}]
          {:keys [type content]} (slackbot.query/generate-adhoc-output
                                  query
                                  :display        :table
                                  :output-mode    :table
                                  :rows           rows
                                  :result-columns result-columns)]
      (testing "returns table blocks"
        (is (= :table type))
        (is (vector? content))
        (is (= "table" (:type (first content)))))

      (testing "table contains correct headers"
        (let [header-row (get-in (first content) [:rows 0])]
          (is (= "State" (get-in header-row [0 :text])))
          (is (= "Count" (get-in header-row [1 :text])))))

      (testing "table contains correct data rows"
        (let [data-rows (rest (get-in (first content) [:rows]))]
          (is (= 3 (count data-rows)))
          (is (= "CA" (get-in (first data-rows) [0 :text])))))

      (testing "numeric columns are right-aligned"
        (let [settings (get-in (first content) [:column_settings])]
          (is (= "left" (:align (nth settings 0))))   ; State is text
          (is (= "right" (:align (nth settings 1)))))))) ; Count is integer

  (testing "generate-adhoc-output falls back to query execution when rows not provided"
    (mt/with-current-user (mt/user->id :rasta)
      (let [mp                     (mt/metadata-provider)
            query                  (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                                       (lib/limit 3))
            {:keys [type content]} (slackbot.query/generate-adhoc-output
                                    query
                                    :display        :table
                                    :output-mode    :table
                                    :rows           nil
                                    :result-columns nil)]
        (is (= :table type))
        (is (vector? content)))))

  (testing "generate-adhoc-output handles scalar results from pre-fetched rows"
    (let [query          {}
          rows           [[42]]
          result-columns [{:name "count" :display_name "Count" :base_type :type/Integer}]
          {:keys [type content]} (slackbot.query/generate-adhoc-output
                                  query
                                  :display        :scalar
                                  :output-mode    :table
                                  :rows           rows
                                  :result-columns result-columns)]
      (is (= :text type))
      (is (re-find #"\*42\*" content))))

  (testing "generate-adhoc-output handles empty pre-fetched rows"
    (let [query          {}
          rows           []
          result-columns [{:name "count" :display_name "Count" :base_type :type/Integer}]
          {:keys [type content]} (slackbot.query/generate-adhoc-output
                                  query
                                  :display        :table
                                  :output-mode    :table
                                  :rows           rows
                                  :result-columns result-columns)]
      (is (= :text type))
      (is (= "_No results_" content)))))
