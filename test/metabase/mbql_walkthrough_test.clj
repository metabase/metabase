(ns metabase.mbql-walkthrough-test
  "This namespace serves several purposes:
  1. It provides a (hopefully growing) walkthrough of how to write MBQL queries
  2. It provides examples of how to write data-driven test cases for MBQL
  3. It provides a central location of MBQL examples
  4. It can be used as a centralized, data-driven location to source MBQL for your tests"
  (:require
   [clojure.core.async :as a]
   [clojure.math.numeric-tower :as math]
   [clojure.test :refer :all]
   [metabase.query-processor :as qp]
   [metabase.query-processor.async :as qp.async]
   [metabase.test :as mt]
   [metabase.models.card :refer [Card]]
   [toucan2.tools.with-temp :as t2.with-temp]))

(defn full-join-orders-test-query
  "This query does a full natural join of the orders, products, and people tables by user and product id."
  []
  (mt/$ids
   {:source-table :$$orders
    :joins        [{:fields       [:&u.people.address
                                   :&u.people.birth_date
                                   :&u.people.city
                                   :&u.people.created_at
                                   :&u.people.email
                                   :&u.people.id
                                   :&u.people.latitude
                                   :&u.people.longitude
                                   :&u.people.name
                                   :&u.people.password
                                   :&u.people.source
                                   :&u.people.state
                                   :&u.people.zip]
                    :source-table :$$people
                    :alias        :u
                    :condition    [:= :$orders.user_id :&u.people.id]}
                   {:fields       [:&p.products.category
                                   :&p.products.created_at
                                   :&p.products.ean
                                   :&p.products.id
                                   :&p.products.price
                                   :&p.products.rating
                                   :&p.products.title
                                   :&p.products.vendor]
                    :source-table :$$products
                    :alias        :p
                    :condition    [:= :$orders.product_id :&p.products.id]}]
    :fields       [:$orders.created_at
                   :$orders.discount
                   :$orders.id
                   :$orders.product_id
                   :$orders.quantity
                   :$orders.subtotal
                   :$orders.tax
                   :$orders.total
                   :$orders.user_id]}))

(def joined-metadata-map
  "`full-join-orders-test-query` will create aliased column names. The following map can be used to rename each of these
  as if you had done metadata column renaming in the UI."
  {"p → Rating"     "PRODUCT_RATING",
   "Product ID"     "PRODUCT_ID",
   "Discount"       "ORDER_DISCOUNT",
   "u → Zip"        "CUSTOMER_ZIP",
   "Created At"     "ORDER_CREATION_TIME",
   "u → ID"         "CUSTOMER_ID",
   "p → Price"      "PRODUCT_PRICE",
   "User ID"        "ORDER_USER_ID",
   "u → State"      "CUSTOMER_STATE",
   "u → Name"       "CUSTOMER_NAME",
   "p → Vendor"     "PRODUCT_VENDOR",
   "u → City"       "CUSTOMER_CITY",
   "p → ID"         "PRODUCT_ID",
   "ID"             "ORDER_ID",
   "Tax"            "ORDER_TAX",
   "Quantity"       "ORDER_QUANTITY",
   "u → Email"      "CUSTOMER_EMAIL",
   "Total"          "ORDER_TOTAL",
   "p → Created At" "PRODUCT_CREATION_TIME",
   "p → Title"      "PRODUCT_TITLE",
   "u → Password"   "CUSTOMER_PASSWORD",
   "p → Category"   "PRODUCT_CATEGORY",
   "p → Ean"        "PRODUCT_EAN",
   "u → Latitude"   "CUSTOMER_LATITUDE",
   "Subtotal"       "ORDER_SUBTOTAL",
   "u → Address"    "CUSTOMER_ADDRESS",
   "u → Source"     "CUSTOMER_SOURCE",
   "u → Longitude"  "CUSTOMER_LONGITUDE",
   "u → Created At" "CUSTOMER_CREATION_TIME",
   "u → Birth Date" "CUSTOMER_BIRTH_DATE"})

(defn- result-metadata-for-query [query]
  (first
   (a/alts!!
    [(qp.async/result-metadata-for-query-async query)
     (a/timeout 1000)])))

(deftest select-*-with-limit-test
  (testing "Using a model as the base, select the first N of everything."
    (mt/dataset sample-dataset
      (mt/with-non-admin-groups-no-root-collection-perms
        (let [source-query {:database (mt/id)
                            :type     :query
                            :query    (full-join-orders-test-query)}]
          (t2.with-temp/with-temp
           [Card {card-id :id :as card} {:table_id      (mt/id :orders)
                                         :dataset_query source-query
                                         :dataset       true}]
            (let [limit         10
                  dataset-query {:database   (mt/id)
                                 :type       :query
                                 :query      {:source-table (format "card__%s" card-id)
                                              :limit        limit}
                                 :parameters []}
                  dataset       (qp/process-query dataset-query)
                  data          (get-in dataset [:data :rows])]
              (is (= limit (count data)))
              (is (= ["ADDRESS" "BIRTH_DATE" "CATEGORY" "CITY" "CREATED_AT" "CREATED_AT_2" "CREATED_AT_3" "DISCOUNT"
                      "EAN" "EMAIL" "ID" "ID_2" "ID_3" "LATITUDE" "LONGITUDE" "NAME" "PASSWORD" "PRICE" "PRODUCT_ID"
                      "QUANTITY" "RATING" "SOURCE" "STATE" "SUBTOTAL" "TAX" "TITLE" "TOTAL" "USER_ID" "VENDOR" "ZIP"]
                     (sort (map :name (get-in dataset [:data :results_metadata :columns]))))))))))))

(deftest select-fields-from-model-with-limit-test
  (testing "Using a model as the base, select some fields and limit the number of results."
    (mt/dataset sample-dataset
      (mt/with-non-admin-groups-no-root-collection-perms
        (let [source-query {:database (mt/id)
                            :type     :query
                            :query    (full-join-orders-test-query)}]
          (t2.with-temp/with-temp
           [Card {card-id :id :as card} {:table_id      (mt/id :orders)
                                         :dataset_query source-query
                                         :dataset       true}]
            (let [limit           10
                  selected-fields [[:field "SUBTOTAL" {:base-type "type/Float"}]
                                   [:field "TAX" {:base-type "type/Float"}]
                                   [:field "TOTAL" {:base-type "type/Float"}]
                                   [:field "DISCOUNT" {:base-type "type/Float"}]]
                  dataset-query   {:database   (mt/id)
                                   :type       :query
                                   :query
                                   {:fields       selected-fields
                                    :source-table (format "card__%s" card-id)
                                    :limit        limit}
                                   :parameters []}
                  dataset         (qp/process-query dataset-query)
                  data            (get-in dataset [:data :rows])]
              (is (= limit (count data)))
              (is (every? (comp #(= % (count selected-fields)) count) data)))))))))

(deftest select-fields-from-model-with-filter-test
  (testing "Using a model as the base, filter the data and select some fields."
    (mt/dataset sample-dataset
      (mt/with-non-admin-groups-no-root-collection-perms
        (let [source-query {:database (mt/id)
                            :type     :query
                            :query    (full-join-orders-test-query)}]
          (t2.with-temp/with-temp
           [Card {card-id :id :as card} {:table_id      (mt/id :orders)
                                         :dataset_query source-query
                                         :dataset       true}]
            (let [dataset-query {:type       :query
                                 :query      {:source-table (format "card__%s" card-id)
                                              :fields       [[:field (mt/id :people :state)]
                                                             [:field (mt/id :orders :tax)]]
                                              :filter       ["=" (mt/id :orders :tax) 0.0]}
                                 :database   (mt/id)
                                 :parameters []}

                  dataset       (qp/process-query dataset-query)
                  data          (get-in dataset [:data :rows])]
              ;; We get a bunch of results
              (is (> (count data) 1000))
              ;; But a very small st of states with no tax
              (is (= #{"OR" "MT" "AK" "DE" "NH"}
                     (set (keys (group-by first data))))))))))))

(deftest aggregation-distinct-test
  (testing "Using a model as the base, perform a count aggregation where a filter is true"
    (mt/dataset sample-dataset
      (mt/with-non-admin-groups-no-root-collection-perms
        (let [source-query {:database (mt/id)
                            :type     :query
                            :query    (full-join-orders-test-query)}]
          (t2.with-temp/with-temp
           [Card {card-id :id :as card} {:table_id      (mt/id :orders)
                                         :dataset_query source-query
                                         :dataset       true}]
            (testing "Fields can be referenced by id"
              (let [dataset-query {:type       :query
                                   :query      {:source-table (format "card__%s" card-id)
                                                :aggregation  [[:distinct (mt/id :people :state)]]
                                                :filter       [:= (mt/id :orders :tax) 0.0]}
                                   :database   (mt/id)
                                   :parameters []}
                    dataset       (qp/process-query dataset-query)
                    data          (get-in dataset [:data :rows])]
                ;; 5 states have no sales tax (OR, MT, AK, DE, NH)
                (is (= [[5]] data))))
            (testing "Fields can be referenced by name"
              (let [dataset-query {:type       :query
                                   :query      {:source-table (format "card__%s" card-id)
                                                :aggregation  [[:distinct [:field "STATE" {:base-type "type/Text"}]]]
                                                :filter       [:= [:field "TAX" {:base-type "type/Float"}] 0.0]}
                                   :database   (mt/id)
                                   :parameters []}
                    dataset       (qp/process-query dataset-query)
                    data          (get-in dataset [:data :rows])]
                ;; 5 states have no sales tax (OR, MT, AK, DE, NH)
                (is (= [[5]] data))))))))))

(deftest aggregation+breakout-average-price-by-states-with-no-tax-test
  (testing "Using a model as the base, compute the average price of each product by states with no sales tax"
    (mt/dataset sample-dataset
      (mt/with-non-admin-groups-no-root-collection-perms
        (let [source-query {:database (mt/id)
                            :type     :query
                            :query    (full-join-orders-test-query)}]
          (t2.with-temp/with-temp
           [Card {card-id :id :as card} {:table_id      (mt/id :orders)
                                         :dataset_query source-query
                                         :dataset       true}]
            (testing "Fields can be referenced by id"
              (let [dataset-query {:type       :query
                                   :query      {:breakout     [[:field (mt/id :people :state)]],
                                                :aggregation  [["avg" ["field" (mt/id :products :price)]]],
                                                :source-table (format "card__%s" card-id)
                                                :filter       [:= (mt/id :orders :tax) 0.0]}
                                   :database   (mt/id)
                                   :parameters []}
                    dataset       (qp/process-query dataset-query)
                    data          (get-in dataset [:data :rows])]
                (is (= [["AK" 55] ["DE" 51] ["MT" 55] ["NH" 59] ["OR" 57]]
                       (map (fn [[state avg-price]] [state (math/round avg-price)]) data)))))
            (testing "Fields can be referenced by name"
              (let [dataset-query {:type       :query
                                   :query      {:breakout     [[:field "STATE" {:base-type "type/Text"}]]
                                                :aggregation  [[:avg [:field "PRICE" {:base-type "type/Float"}]]]
                                                :source-table (format "card__%s" card-id)
                                                :filter       [:= (mt/id :orders :tax) 0.0]}
                                   :database   (mt/id)
                                   :parameters []}
                    dataset       (qp/process-query dataset-query)
                    data          (get-in dataset [:data :rows])]
                (is (= [["AK" 55] ["DE" 51] ["MT" 55] ["NH" 59] ["OR" 57]]
                       (map (fn [[state avg-price]] [state (math/round avg-price)]) data)))))))))))

(deftest referencing-fields-by-name-does-not-use-metadata-display-names-test
  (testing "Nominal field selection uses underlying field names, not metadata display names"
    (mt/dataset sample-dataset
      (mt/with-non-admin-groups-no-root-collection-perms
        (let [source-query {:database (mt/id)
                            :type     :query
                            :query    (full-join-orders-test-query)}]
          (t2.with-temp/with-temp
           [Card {card-id :id :as card} {:table_id        (mt/id :orders)
                                         :dataset_query   source-query
                                         :result_metadata (->> (mt/with-test-user :rasta (result-metadata-for-query source-query))
                                                               (map (fn [m] (update m :display_name joined-metadata-map))))
                                         :dataset         true}]
            (let [dataset-query {:type       :query

                                 :query      {;; Not CUSTOMER_STATE
                                              :breakout     [[:field "STATE" {:base-type "type/Text"}]]
                                              ;; Not PRODUCT_PRICE
                                              :aggregation  [[:avg [:field "PRICE" {:base-type "type/Float"}]]]
                                              :source-table (format "card__%s" card-id)
                                              :filter       [:= (mt/id :orders :tax) 0.0]}
                                 :database   (mt/id)
                                 :parameters []}
                  dataset       (qp/process-query dataset-query)
                  data          (get-in dataset [:data :rows])]
              (is (= [["AK" 55] ["DE" 51] ["MT" 55] ["NH" 59] ["OR" 57]]
                     (map (fn [[state avg-price]] [state (math/round avg-price)]) data))))))))))

(deftest custom-expression-column-example-test
  (testing "Create a custom 'Discount percentage' column as described at https://www.metabase.com/learn/questions/custom-expressions"
    (mt/dataset sample-dataset
      (mt/with-non-admin-groups-no-root-collection-perms
        (let [source-query {:database (mt/id)
                            :type     :query
                            :query    (full-join-orders-test-query)}]
          (t2.with-temp/with-temp
           [Card {card-id :id :as card} {:table_id      (mt/id :orders)
                                         :dataset_query source-query
                                         :dataset       true}]
            (let [dataset-query {:type       :query
                                 :query      {:expressions {"Discount percentage"
                                                            ["*"
                                                             100
                                                             ["/"
                                                              (mt/id :orders :discount)
                                                              (mt/id :orders :subtotal)]]},
                                              :fields
                                              [["expression" "Discount percentage" {:base-type "type/Float"}]],
                                              :source-table (format "card__%s" card-id)}
                                 :database   (mt/id)
                                 :parameters []}
                  dataset       (qp/process-query dataset-query)
                  data          (get-in dataset [:data :rows])]
              (is (every? (fn [row] (= 1 (count row))) data))
              data)))))))

(deftest custom-expression-example-test
  (testing "Create a custom expression that follows the example at https://www.metabase.com/learn/questions/custom-expressions"
    (mt/dataset sample-dataset
      (mt/with-non-admin-groups-no-root-collection-perms
        (let [source-query {:database (mt/id)
                            :type     :query
                            :query    (full-join-orders-test-query)}]
          (t2.with-temp/with-temp
           [Card {card-id :id :as card} {:table_id      (mt/id :orders)
                                         :dataset_query source-query
                                         :dataset       true}]
            (let [dataset-query {:type       :query
                                 :query      {:expressions  {"Unit price" [:/
                                                                           ;[:field "SUBTOTAL" {:base-type "type/Float"}]
                                                                           (mt/id :orders :subtotal)
                                                                           (mt/id :orders :quantity)]},
                                              :aggregation
                                              [[:aggregation-options
                                                [:avg [:-
                                                       [:expression "Unit price"]
                                                       [:/ (mt/id :products :price) 2]]]
                                                {:name         "Average net inflow per unit sold"
                                                 :display-name "Average net inflow per unit sold"}]],
                                              :breakout     [["field" "CREATED_AT" {:base-type "type/DateTime" :temporal-unit "month"}]],
                                              :source-table (format "card__%s" card-id)
                                              :filter       [:or
                                                             [:contains
                                                              ;(mt/id :products :title)
                                                              [:field "TITLE" {:base-type "type/Text"}]
                                                              "Wool"]
                                                             [:contains
                                                              ;(mt/id :products :title)
                                                              [:field "TITLE" {:base-type "type/Text"}]
                                                              "Cotton"]]}
                                 :database   (mt/id)
                                 :parameters []}
                  dataset       (qp/process-query dataset-query)
                  data          (get-in dataset [:data :rows])]
              (is (every? (fn [row] (= 2 (count row))) data)))))))))
