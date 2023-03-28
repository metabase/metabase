(ns metabase.db.query-test
  (:require
   [cheshire.core :as json]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.db.query :as mdb.query]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]))

(defn- verify-same-query
  "Ensure that the formatted native query derived from an mbql query produce the same results."
  [q]
  (let [{:keys [query]} (qp/compile q)
        formatted-query (mdb.query/format-sql query)
        native-query    {:database (mt/id)
                         :type     :native
                         :native   {:query formatted-query}}]
    (testing "The generated query and formatted query should be substantially identical"
      (is (= (str/replace query #"(?s)\s+" "") (str/replace formatted-query #"(?s)\s+" ""))))
    (testing "The results of the query should be identical"
      (is (= (-> (qp/process-query q) :data :rows)
             (-> (qp/process-query native-query) :data :rows))))))

(deftest ensure-same-queries-test
  (testing "A test with several joins and an aggregate should produce the same result in mbql or the derived native sql"
    (mt/dataset sample-dataset
      (let [q {:type     :query
               :query    (mt/$ids
                          {:source-table (mt/id :orders)
                           :joins        [{:fields       [[:field (mt/id :people :latitude) {:join-alias "People - User"}]
                                                          [:field (mt/id :people :longitude) {:join-alias "People - User"}]
                                                          [:field (mt/id :people :state) {:join-alias "People - User"}]]
                                           :source-table (mt/id :people)
                                           :condition    [:=
                                                          [:field (mt/id :orders :user_id) nil]
                                                          [:field (mt/id :people :id) {:join-alias "People - User"}]]
                                           :alias        "People - User"}
                                          {:fields       [[:field (mt/id :products :rating) {:join-alias "Products"}]
                                                          [:field (mt/id :products :price) {:join-alias "Products"}]]
                                           :source-table (mt/id :products)
                                           :condition    [:=
                                                          [:field (mt/id :orders :product_id) nil]
                                                          [:field (mt/id :products :id) {:join-alias "Products"}]]
                                           :alias        "Products"}]
                           :filter       [:>= [:field (mt/id :products :rating) {:join-alias "Products"}] 3]
                           :aggregation  [[:count]]
                           :breakout     [[:field (mt/id :people :source) {:join-alias "People - User"}]]})
               :database (mt/id)}]
        (verify-same-query q))))
  (testing "A test with several joins a custom column, and an aggregate should produce the same result in mbql or the derived native sql"
    (mt/dataset sample-dataset
      (let [q {:type     :query
               :query    (mt/$ids
                          {:source-table (mt/id :orders)
                           :joins        [{:fields       [[:field (mt/id :people :latitude) {:join-alias "People - User"}]
                                                          [:field (mt/id :people :longitude) {:join-alias "People - User"}]
                                                          [:field (mt/id :people :state) {:join-alias "People - User"}]]
                                           :source-table (mt/id :people)
                                           :condition    [:=
                                                          [:field (mt/id :orders :user_id) nil]
                                                          [:field (mt/id :people :id) {:join-alias "People - User"}]]
                                           :alias        "People - User"}
                                          {:fields       [[:field (mt/id :products :rating) {:join-alias "Products"}]
                                                          [:field (mt/id :products :price) {:join-alias "Products"}]]
                                           :source-table (mt/id :products)
                                           :condition    [:=
                                                          [:field (mt/id :orders :product_id) nil]
                                                          [:field (mt/id :products :id) {:join-alias "Products"}]]
                                           :alias        "Products"}]
                           :expressions  {"Price per Star" [:/
                                                            [:field (mt/id :products :price) {:join-alias "Products"}]
                                                            [:field (mt/id :products :rating) {:join-alias "Products"}]]}
                           :aggregation  [[:avg [:expression "Price per Star"]]],
                           :breakout     [[:field (mt/id :products :category) {:join-alias "Products"}]]})
               :database (mt/id)}]
        (verify-same-query q)))))

(deftest nonsql-dialects-return-original-string-test
  (testing "Passing a mongodb query through format-sql returns the original string"
    (with-open [r (io/reader (io/resource "metabase/db/mongodbquery.json"))]
      (let [query                 (slurp r)
            ;; Formatting a non-sql string returns nothing
            formatted-query       (mdb.query/format-sql query :mongo)
            ;; This is a mongodb query, but if you pass in the wrong driver it will attempt the format
            ;; This is a corner case since the system should always be using the right driver
            weird-formatted-query (mdb.query/format-sql query :postgres)]
        (testing "Formatting a non-sql query returns the same string"
          (is (= query formatted-query)))
        (testing "The wrong formatter will change the format..."
          (is (not= query weird-formatted-query)))
        (testing "...but the resulting data is still the same"
          ;; Bottom line - Use the right driver, but if you use the wrong
          ;; one it should be harmless but annoying
          (is (= (json/parse-string query)
                 (json/parse-string weird-formatted-query))))))))
