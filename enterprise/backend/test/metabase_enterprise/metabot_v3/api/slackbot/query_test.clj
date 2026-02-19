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

;;; ------------------------------------------------ Query Execution -------------------------------------------------

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

;;; ------------------------------------------------ PNG Generation --------------------------------------------------

(deftest generate-adhoc-png-table-test
  (testing "generate-adhoc-png renders table visualization as PNG"
    (mt/with-current-user (mt/user->id :rasta)
      (let [mp      (mt/metadata-provider)
            query   (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                        (lib/limit 10))
            results (slackbot.query/execute-adhoc-query query)
            png     (#'slackbot.query/generate-adhoc-png results :table)
            image   (bytes->image png)]
        (testing "returns parseable PNG"
          (is (some? image)))
        (testing "image has reasonable dimensions"
          (is (< 100 (.getWidth image))))))))

(deftest generate-adhoc-png-bar-chart-test
  (testing "generate-adhoc-png renders bar chart visualization as PNG"
    (mt/with-current-user (mt/user->id :rasta)
      (let [mp      (mt/metadata-provider)
            query   (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                        (lib/aggregate (lib/count))
                        (lib/breakout (lib.metadata/field mp (mt/id :venues :category_id))))
            results (slackbot.query/execute-adhoc-query query)
            png     (#'slackbot.query/generate-adhoc-png results :bar)
            image   (bytes->image png)]
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
              results    (slackbot.query/execute-adhoc-query query)
              png        (#'slackbot.query/generate-adhoc-png results :line)
              image      (bytes->image png)]
          (testing "returns parseable PNG"
            (is (some? image))))))))

;;; ------------------------------------------------ Table Blocks ----------------------------------------------------

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

      (testing "table is truncated to 99 data rows plus header"
        (let [table-block (first blocks)
              rows        (:rows table-block)]
          (is (= 100 (count rows)))))

      (testing "includes truncation message"
        (is (= 2 (count blocks)))
        (let [context-block (second blocks)]
          (is (= "context" (:type context-block)))
          (is (= "Showing 99 of 150 rows"
                 (get-in context-block [:elements 0 :text])))))))

  (testing "format-results-as-table-blocks handles scalar (single-cell) results"
    (let [results {:data {:rows [[42]]
                          :cols [{:name "count" :display_name "Count" :base_type :type/Integer}]}}
          blocks  (slackbot.query/format-results-as-table-blocks results)]
      (testing "returns a 1x1 table with header"
        (let [table-block (first blocks)
              rows        (:rows table-block)]
          (is (= 2 (count rows))) ; 1 header + 1 data row
          (is (= "Count" (get-in rows [0 0 :text])))
          (is (= "42" (get-in rows [1 0 :text])))))))

  (testing "format-results-as-table-blocks handles empty results"
    (let [results {:data {:rows []
                          :cols [{:name "count" :display_name "Count" :base_type :type/Integer}]}}
          blocks  (slackbot.query/format-results-as-table-blocks results)]
      (testing "returns a table with only header row"
        (let [table-block (first blocks)
              rows        (:rows table-block)]
          (is (= 1 (count rows))) ; header only
          (is (= "Count" (get-in rows [0 0 :text])))))))

  (testing "format-results-as-table-blocks handles FK remapped columns"
    (let [;; Simulate FK remapping: USER_ID is remapped to show USER.NAME
          ;; The data has both USER_ID (raw FK) and NAME (human-readable value from FK target)
          results {:data {:rows [[1 100 "Alice"]
                                 [2 200 "Bob"]]
                          :cols [{:name         "id"
                                  :display_name "ID"
                                  :base_type    :type/Integer}
                                 {:name         "user_id"
                                  :display_name "User ID"
                                  :base_type    :type/Integer
                                  :remapped_to  "user_name"}
                                 {:name         "user_name"
                                  :display_name "User Name"
                                  :base_type    :type/Text
                                  :remapped_from "user_id"}]}}
          blocks  (slackbot.query/format-results-as-table-blocks results)]

      (testing "skips remapped_from column (the duplicate)"
        (let [table-block (first blocks)
              header-row  (first (:rows table-block))]
          ;; Should only have 2 columns: ID and User Name (not 3)
          (is (= 2 (count header-row)))))

      (testing "uses remapped column's display name in header"
        (let [table-block (first blocks)
              header-row  (first (:rows table-block))]
          (is (= "ID" (get-in header-row [0 :text])))
          (is (= "User Name" (get-in header-row [1 :text])))))

      (testing "substitutes remapped values in data rows"
        (let [table-block (first blocks)
              data-rows   (rest (:rows table-block))]
          ;; First row should show "1" and "Alice" (not "100")
          (is (= "1" (get-in (first data-rows) [0 :text])))
          (is (= "Alice" (get-in (first data-rows) [1 :text])))
          ;; Second row should show "2" and "Bob" (not "200")
          (is (= "2" (get-in (second data-rows) [0 :text])))
          (is (= "Bob" (get-in (second data-rows) [1 :text]))))))))

;;; -------------------------------------------- generate-adhoc-output -----------------------------------------------

(deftest generate-adhoc-output-chart-display-test
  (testing "generate-adhoc-output renders chart display types as PNG images"
    (mt/with-current-user (mt/user->id :rasta)
      (let [mp    (mt/metadata-provider)
            query (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                      (lib/aggregate (lib/count))
                      (lib/breakout (lib.metadata/field mp (mt/id :venues :category_id))))]

        (testing "bar chart renders as image"
          (let [{:keys [type content]} (slackbot.query/generate-adhoc-output query :display :bar)]
            (is (= :image type))
            (is (bytes? content))
            (is (some? (bytes->image content)))))

        (testing "line chart renders as image"
          (let [{:keys [type content]} (slackbot.query/generate-adhoc-output query :display :line)]
            (is (= :image type))
            (is (bytes? content))))

        (testing "pie chart renders as image"
          (let [{:keys [type content]} (slackbot.query/generate-adhoc-output query :display :pie)]
            (is (= :image type))
            (is (bytes? content))))))))

(deftest generate-adhoc-output-table-display-test
  (testing "generate-adhoc-output renders table display as Slack table blocks"
    (mt/with-current-user (mt/user->id :rasta)
      (let [mp    (mt/metadata-provider)
            query (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                      (lib/limit 5))]

        (testing "table display renders as table blocks"
          (let [{:keys [type content]} (slackbot.query/generate-adhoc-output query :display :table)]
            (is (= :table type))
            (is (vector? content))
            (is (= "table" (:type (first content))))))

        (testing "scalar display renders as table blocks"
          (let [scalar-query (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                                 (lib/aggregate (lib/count)))
                {:keys [type content]} (slackbot.query/generate-adhoc-output scalar-query :display :scalar)]
            (is (= :table type))
            (is (= "table" (:type (first content))))))))))

(deftest generate-adhoc-output-default-display-test
  (testing "generate-adhoc-output defaults to table display"
    (mt/with-current-user (mt/user->id :rasta)
      (let [mp    (mt/metadata-provider)
            query (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                      (lib/limit 3))
            {:keys [type content]} (slackbot.query/generate-adhoc-output query)]
        (is (= :table type))
        (is (vector? content))
        (is (= "table" (:type (first content)))))))) ; header only
