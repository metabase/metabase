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
  (mt/dataset sample-dataset
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
