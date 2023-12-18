(ns  dev.debug-qp-test
  (:require [clojure.test :refer :all]
            [dev.debug-qp :as debug-qp]
            [metabase.test :as mt]))

(deftest add-names-test
  (testing "Joins"
    (is (= [{:strategy     :left-join
             :alias        "CATEGORIES__via__CATEGORY_ID"
             :condition    [:=
                            [:field
                             (mt/id :venues :category_id)
                             (symbol "#_\"VENUES.CATEGORY_ID\"")
                             nil]
                            [:field
                             (mt/id :categories :id)
                             (symbol "#_\"CATEGORIES.ID\"")
                             {:join-alias "CATEGORIES__via__CATEGORY_ID"}]]
             :source-table (list 'do (symbol "#_\"CATEGORIES\"") (mt/id :categories))
             :fk-field-id  (list 'do (symbol "#_\"VENUES.CATEGORY_ID\"") (mt/id :venues :category_id))}]
           (debug-qp/add-names
            [{:strategy     :left-join
              :alias        "CATEGORIES__via__CATEGORY_ID"
              :condition    [:=
                             [:field (mt/id :venues :category_id) nil]
                             [:field (mt/id :categories :id) {:join-alias "CATEGORIES__via__CATEGORY_ID"}]]
              :source-table (mt/id :categories)
              :fk-field-id  (mt/id :venues :category_id)}])))))

(deftest to-mbql-shorthand-test
  (mt/dataset test-data
    (testing "Normal Field ID clause"
      (is (= '$user_id
             (debug-qp/expand-symbolize [:field (mt/id :orders :user_id) nil])))
      (is (= '$products.id
             (debug-qp/expand-symbolize [:field (mt/id :products :id) nil]))))
    (testing "Field literal name"
      (is (= '*wow/Text
             (debug-qp/expand-symbolize [:field "wow" {:base-type :type/Text}])))
      (is (= [:field "w o w" {:base-type :type/Text}]
             (debug-qp/expand-symbolize [:field "w o w" {:base-type :type/Text}]))))
    (testing "Field with join alias"
      (is (= '&P.people.source
             (debug-qp/expand-symbolize [:field (mt/id :people :source) {:join-alias "P"}])))
      (is (= [:field '%people.id {:join-alias "People - User"}]
             (debug-qp/expand-symbolize [:field (mt/id :people :id) {:join-alias "People - User"}])))
      (is (= '&Q.*ID/BigInteger
             (debug-qp/expand-symbolize [:field "ID" {:base-type :type/BigInteger, :join-alias "Q"}]))))
    (testing "Field with source-field"
      (is (= '$product_id->products.id
             (debug-qp/expand-symbolize [:field (mt/id :products :id) {:source-field (mt/id :orders :product_id)}])))
      (is (= '$product_id->*wow/Text
             (debug-qp/expand-symbolize [:field "wow" {:base-type :type/Text, :source-field (mt/id :orders :product_id)}]))))
    (testing "Binned field - no expansion (%id only)"
      (is (= [:field '%people.source {:binning {:strategy :default}}]
             (debug-qp/expand-symbolize [:field (mt/id :people :source) {:binning {:strategy :default}}]))))
    (testing "Field with temporal unit"
      (is (= '!default.created_at
             (debug-qp/expand-symbolize [:field (mt/id :orders :created_at) {:temporal-unit :default}]))))
    (testing "Field with join alias AND temporal unit"
      (is (= '!default.&P1.created_at
             (debug-qp/expand-symbolize [:field (mt/id :orders :created_at) {:temporal-unit :default, :join-alias "P1"}]))))

    (testing "source table"
      (is (= '(mt/mbql-query orders
                {:joins [{:source-table $$people}]})
             (debug-qp/to-mbql-shorthand
              {:database (mt/id)
               :type     :query
               :query    {:source-table (mt/id :orders)
                          :joins        [{:source-table (mt/id :people)}]}}))))))

(deftest to-mbql-shorthand-joins-test
  (testing :fk-field-id
    (is (= '(mt/$ids venues
              [{:strategy     :left-join
                :alias        "CATEGORIES__via__CATEGORY_ID"
                :condition    [:= $category_id &CATEGORIES__via__CATEGORY_ID.categories.id]
                :source-table $$categories
                :fk-field-id  %category_id}])
           (debug-qp/to-mbql-shorthand
            [{:strategy     :left-join
              :alias        "CATEGORIES__via__CATEGORY_ID"
              :condition    [:=
                             [:field (mt/id :venues :category_id) nil]
                             [:field (mt/id :categories :id) {:join-alias "CATEGORIES__via__CATEGORY_ID"}]]
              :source-table (mt/id :categories)
              :fk-field-id  (mt/id :venues :category_id)}]
            "venues")))))
