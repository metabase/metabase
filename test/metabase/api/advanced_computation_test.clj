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
  (mt/mbql-query orders
    {:aggregation [[:count] [:sum $orders.quantity]]
     :breakout    [[:fk-> $orders.user_id $people.state]
                   [:fk-> $orders.user_id $people.source]
                   [:fk-> $orders.product_id $products.category]]}))

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
          (is (= 1384 (:row_count result)))
          (is (= "completed" (:status result)))
          (is (= 6 (count (get-in result [:data :cols]))))
          (is (= 1384 (count rows)))

          ;; spot checking rows, but leaving off the discriminator on the end
          (is (= ["AK" "Affiliate" "Doohickey" 18 81] (drop-last (first rows))))
          (is (= ["MS" nil "Doohickey" 78 291] (drop-last (nth rows 1000))))
          (is (= [nil nil nil 18760 69540] (drop-last (last rows)))))))))

(deftest pivot-card-test
  (mt/dataset sample-dataset
    (testing "POST /api/advanced_computation/pivot/card/id"
      (with-temp-pivot-card [_ card]
        (let [result (mt/user-http-request :rasta :post 202 (format "advanced_computation/pivot/card/%d/query" (u/get-id card)))
              rows   (mt/rows result)]
          (is (= 1384 (:row_count result)))
          (is (= "completed" (:status result)))
          (is (= 6 (count (get-in result [:data :cols]))))
          (is (= 1384 (count rows)))

          ;; spot checking rows, but leaving off the discriminator on the end
          (is (= ["AK" "Affiliate" "Doohickey" 18 81] (drop-last (first rows))))
          (is (= ["MS" nil "Doohickey" 78 291] (drop-last (nth rows 1000))))
          (is (= [nil nil nil 18760 69540] (drop-last (last rows)))))))))

(deftest pivot-public-card-test
  (mt/with-log-level :info
    (mt/dataset sample-dataset
      (testing "GET /api/advanced_computation/public/pivot/card/:uuid/query"
        (mt/with-temporary-setting-values [enable-public-sharing true]
          (with-temp-pivot-public-card [{uuid :public_uuid}]
            (let [result (http/client :get 202 (format "advanced_computation/public/pivot/card/%s/query" uuid))
                  rows   (mt/rows result)]
              (is (nil? (:row_count result))) ;; row_count isn't included in public endpoints
              (is (= "completed" (:status result)))
              (is (= 6 (count (get-in result [:data :cols]))))
              (is (= 1384 (count rows)))

              ;; spot checking rows, but leaving off the discriminator on the end
              (is (= ["AK" "Affiliate" "Doohickey" 18 81] (drop-last (first rows))))
              (is (= ["MS" nil "Doohickey" 78 291] (drop-last (nth rows 1000))))
              (is (= [nil nil nil 18760 69540] (drop-last (last rows)))))))))))
