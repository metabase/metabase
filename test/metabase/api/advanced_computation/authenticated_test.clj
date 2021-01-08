(ns metabase.api.advanced-computation.authenticated-test
  (:require [clojure.test :refer :all]
            [metabase.api.advanced-computation.common-test :as common]
            [metabase.api.embed-test :as embed-test]
            [metabase.test :as mt]
            [metabase.util :as u]))

(deftest pivot-dataset-test
  (mt/test-drivers common/applicable-drivers
    (mt/dataset sample-dataset
      (testing "POST /api/advanced_computation/pivot/dataset"
        (testing "Run a pivot table"
          (let [result (mt/user-http-request :rasta :post 202 "advanced_computation/pivot/dataset" (common/pivot-query))
                rows   (mt/rows result)]
            (is (= 1192 (:row_count result)))
            (is (= "completed" (:status result)))
            (is (= 6 (count (get-in result [:data :cols]))))
            (is (= 1192 (count rows)))

            (is (= ["AK" "Affiliate" "Doohickey" 0 18 81] (first rows)))
            (is (= ["WV" "Facebook" nil 4 45 292] (nth rows 1000)))
            (is (= [nil nil nil 7 18760 69540] (last rows)))))

        (testing "with an added expression"
          (let [query (-> (common/pivot-query)
                          (assoc-in [:query :fields] [[:expression "test-expr"]])
                          (assoc-in [:query :expressions] {:test-expr [:ltrim "wheeee"]}))
                result (mt/user-http-request :rasta :post 202 "advanced_computation/pivot/dataset" query)
                rows (mt/rows result)]
            (is (= 1192 (:row_count result)))
            (is (= 1192 (count rows)))

            (let [cols (get-in result [:data :cols])]
              (is (= 7 (count cols)))
              (is (= {:base_type "type/Text"
                      :special_type nil
                      :name "test-expr"
                      :display_name "test-expr"
                      :expression_name "test-expr"
                      :field_ref ["expression" "test-expr"]
                      :source "breakout"}
                     (nth cols 3))))

            (is (= [nil nil nil "wheeee" 7 18760 69540] (last rows)))))))))

(deftest pivot-filter-dataset-test
  (mt/test-drivers common/applicable-drivers
    (mt/dataset sample-dataset
      (testing "POST /api/advanced_computation/pivot/dataset"
        (testing "Run a pivot table"
          (let [result (mt/user-http-request :rasta :post 202 "advanced_computation/pivot/dataset" (common/filters-query))
                rows   (mt/rows result)]
            (is (= 230 (:row_count result)))
            (is (= "completed" (:status result)))
            (is (= 4 (count (get-in result [:data :cols]))))
            (is (= 230 (count rows)))

            (is (= ["AK" "Google" 0 119] (first rows)))
            (is (= ["AK" "Organic" 0 89] (second rows)))
            (is (= ["MS" "Google" 0 43] (nth rows 135)))
            (is (= ["MS" nil 2 136] (nth rows 205)))
            (is (= [nil nil 3 7562] (last rows)))))))))

(deftest pivot-parameter-dataset-test
  (mt/test-drivers common/applicable-drivers
    (mt/dataset sample-dataset
      (testing "POST /api/advanced_computation/pivot/dataset"
        (testing "Run a pivot table"
          (let [result (mt/user-http-request :rasta :post 202 "advanced_computation/pivot/dataset" (common/parameters-query))
                rows   (mt/rows result)]
            (is (= 225 (:row_count result)))
            (is (= "completed" (:status result)))
            (is (= 4 (count (get-in result [:data :cols]))))
            (is (= 225 (count rows)))

            (is (= ["AK" "Google" 0 27] (first rows)))
            (is (= ["AK" "Organic" 0 25] (second rows)))
            (is (= ["MN" "Organic" 0 39] (nth rows 130)))
            (is (= ["NE" nil 2 59] (nth rows 205)))
            (is (= [nil nil 3 2009] (last rows)))))))))

(deftest pivot-card-test
  (mt/test-drivers common/applicable-drivers
    (mt/dataset sample-dataset
      (testing "POST /api/advanced_computation/pivot/card/id"
        (embed-test/with-temp-card [card (common/pivot-card)]
          (let [result (mt/user-http-request :rasta :post 202 (format "advanced_computation/pivot/card/%d/query" (u/get-id card)))
                rows   (mt/rows result)]
            (is (= 2273 (:row_count result)))
            (is (= "completed" (:status result)))
            (is (= 6 (count (get-in result [:data :cols]))))
            (is (= 2273 (count rows)))

            (is (= ["AK" "Affiliate" "Doohickey" 0 18 81] (first rows)))
            (is (= ["MS" "Organic" "Gizmo" 0 16 42] (nth rows 445)))
            (is (= ["ND" nil nil 6 589 2183] (nth rows 2250)))
            (is (= [nil nil nil 7 18760 69540] (last rows)))))))))
