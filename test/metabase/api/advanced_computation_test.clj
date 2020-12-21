(ns metabase.api.advanced-computation-test
  "Unit tests for /api/advanced_computation endpoints."
  (:require [clojure.test :refer :all]
            [metabase
             [http-client :as http]
             [models :refer [Card]]
             [test :as mt]
             [util :as u]]
            [metabase.test.fixtures :as fixtures])
  (:import java.util.UUID))

(use-fixtures :once (fixtures/initialize :db))

(defn- pivot-query
  []
  (-> (mt/mbql-query orders
        {:aggregation [[:count] [:sum $orders.quantity]]
         :breakout    [[:fk-> $orders.user_id $people.state]
                       [:fk-> $orders.user_id $people.source]
                       [:fk-> $orders.product_id $products.category]]})
      (assoc :pivot_rows [1 0]
             :pivot_cols [2])))

(defn- filters-query
  []
  (-> (mt/mbql-query orders
        {:aggregation [[:count]]
         :breakout    [[:fk-> $orders.user_id $people.state]
                       [:fk-> $orders.user_id $people.source]]
         :filter      [:and [:= [:fk-> $orders.user_id $people.source] "Google" "Organic"]]})
      (assoc :pivot_rows [0]
             :pivot_cols [1])))

(defn- parameters-query
  []
  (-> (mt/mbql-query orders
        {:aggregation [[:count]]
         :breakout    [[:fk-> $orders.user_id $people.state]
                       [:fk-> $orders.user_id $people.source]]
         :filter      [:and [:= [:fk-> $orders.user_id $people.source] "Google" "Organic"]]
         :parameters  [{:type   "category"
                        :target [:dimension [:fk-> $orders.product_id $products.category]]
                        :value  "Gadget"}]})
      (assoc :pivot_rows [0]
             :pivot_cols [1])))

(defn- pivot-card
  []
  {:dataset_query (pivot-query)})

(defn- shared-obj []
  {:public_uuid       (str (UUID/randomUUID))
   :made_public_by_id (mt/user->id :crowberto)})

(defn- do-with-temp-pivot-card
  {:style/indent 0}
  [f]
  (mt/with-temp* [Card [card  {:dataset_query (pivot-query)}]]
    (f (mt/db) card)))

(defmacro ^:private with-temp-pivot-card
  {:style/indent 1}
  [[db-binding card-binding] & body]
  `(do-with-temp-pivot-card (fn [~(or db-binding '_) ~(or card-binding '_)]
                              ~@body)))

(defmacro ^:private with-temp-pivot-public-card {:style/indent 1} [[binding & [card]] & body]
  `(let [card-settings# (merge (pivot-card) (shared-obj) ~card)]
     (mt/with-temp Card [card# card-settings#]
       ;; add :public_uuid back in to the value that gets bound because it might not come back from post-select if
       ;; public sharing is disabled; but we still want to test it
       (let [~binding (assoc card# :public_uuid (:public_uuid card-settings#))]
         ~@body))))

(deftest pivot-dataset-test
  (mt/dataset sample-dataset
    (testing "POST /api/advanced_computation/pivot/dataset"
      (testing "Run a pivot table"
        (let [result (mt/user-http-request :rasta :post 202 "advanced_computation/pivot/dataset" (pivot-query))
              rows   (mt/rows result)]
          (is (= 1192 (:row_count result)))
          (is (= "completed" (:status result)))
          (is (= 6 (count (get-in result [:data :cols]))))
          (is (= 1192 (count rows)))

          (is (= ["AK" "Affiliate" "Doohickey" 18 81 0] (first rows)))
          (is (= ["WV" "Facebook" nil 45 292 4] (nth rows 1000)))
          (is (= [nil nil nil 18760 69540 7] (last rows)))))

      (testing "with an added expression"
        (let [query (-> (pivot-query)
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
                    :source "fields"}
                   (nth cols 5))))

          (is (= [nil nil nil 18760 69540 "wheeee" 7] (last rows))))))))

(deftest pivot-filter-dataset-test
  (mt/dataset sample-dataset
    (testing "POST /api/advanced_computation/pivot/dataset"
       (testing "Run a pivot table"
         (let [result (mt/user-http-request :rasta :post 202 "advanced_computation/pivot/dataset" (filters-query))
               rows   (mt/rows result)]
           (is (= 230 (:row_count result)))
           (is (= "completed" (:status result)))
           (is (= 4 (count (get-in result [:data :cols]))))
           (is (= 230 (count rows)))

           (is (= ["AK" "Google" 119 0] (first rows)))
           (is (= ["AK" "Organic" 89 0] (second rows)))
           (is (= ["MS" "Google" 43 0] (nth rows 135)))
           (is (= ["MS" nil 136 2] (nth rows 205)))
           (is (= [nil nil 7562 3] (last rows))))))))

(deftest pivot-parameter-dataset-test
  (mt/with-log-level :error
    (mt/dataset sample-dataset
     (testing "POST /api/advanced_computation/pivot/dataset"
       (testing "Run a pivot table"
         (let [result (mt/user-http-request :rasta :post 202 "advanced_computation/pivot/dataset" (parameters-query))
               rows   (mt/rows result)]
           (is (= 225 (:row_count result)))
           (is (= "completed" (:status result)))
           (is (= 4 (count (get-in result [:data :cols]))))
           (is (= 225 (count rows)))

           (is (= ["AK" "Google" 27 0] (first rows)))
           (is (= ["AK" "Organic" 25 0] (second rows)))
           (is (= ["MN" "Organic" 39 0] (nth rows 130)))
           (is (= ["NE" nil 59 2] (nth rows 205)))
           (is (= [nil nil 2009 3] (last rows)))))))))


(deftest pivot-card-test
  (mt/dataset sample-dataset
    (testing "POST /api/advanced_computation/pivot/card/id"
      (with-temp-pivot-card [_ card]
        (let [result (mt/user-http-request :rasta :post 202 (format "advanced_computation/pivot/card/%d/query" (u/get-id card)))
              rows   (mt/rows result)]
          (is (= 2273 (:row_count result)))
          (is (= "completed" (:status result)))
          (is (= 6 (count (get-in result [:data :cols]))))
          (is (= 2273 (count rows)))

          (is (= ["AK" "Affiliate" "Doohickey" 18 81 0] (first rows)))
          (is (= ["MS" "Organic" "Gizmo" 16 42 0] (nth rows 445)))
          (is (= ["ND" nil nil 589 2183 6] (nth rows 2250)))
          (is (= [nil nil nil 18760 69540 7] (last rows))))))))

(deftest pivot-public-card-test
  (mt/dataset sample-dataset
    (testing "GET /api/advanced_computation/public/pivot/card/:uuid/query"
      (mt/with-temporary-setting-values [enable-public-sharing true]
        (with-temp-pivot-public-card [{uuid :public_uuid}]
          (let [result (http/client :get 202 (format "advanced_computation/public/pivot/card/%s/query" uuid))
                rows   (mt/rows result)]
            (is (nil? (:row_count result))) ;; row_count isn't included in public endpoints
            (is (= "completed" (:status result)))
            (is (= 6 (count (get-in result [:data :cols]))))
            (is (= 2273 (count rows)))

            (is (= ["AK" "Affiliate" "Doohickey" 18 81 0] (first rows)))
            (is (= ["CO" "Affiliate" "Gadget" 62 211 0] (nth rows 100)))
            (is (= ["ND" nil nil 589 2183 6] (nth rows 2250)))
            (is (= [nil nil nil 18760 69540 7] (last rows)))))))))
