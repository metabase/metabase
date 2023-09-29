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
