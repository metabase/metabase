(ns metabase.query-processor-test.explicit-joins-test
  (:require [expectations :refer [expect]]
            [metabase.query-processor-test :as qp.test]
            [metabase.test.data :as data]
            [metabase.test.data.datasets :as datasets]))

(defn- native-form [results]
  (let [data (qp.test/data results)]
    (get-in data [:native_form :query] data)))

;; Can we specify an *explicit* JOIN using the default options?
(expect
  (str "SELECT \"PUBLIC\".\"VENUES\".\"ID\" AS \"ID\","
       " \"PUBLIC\".\"VENUES\".\"CATEGORY_ID\" AS \"CATEGORY_ID\","
       " \"PUBLIC\".\"VENUES\".\"LATITUDE\" AS \"LATITUDE\","
       " \"PUBLIC\".\"VENUES\".\"LONGITUDE\" AS \"LONGITUDE\","
       " \"PUBLIC\".\"VENUES\".\"NAME\" AS \"NAME\","
       " \"PUBLIC\".\"VENUES\".\"PRICE\" AS \"PRICE\" "
       "FROM \"PUBLIC\".\"VENUES\" "
       "LEFT JOIN \"PUBLIC\".\"CATEGORIES\" \"CATEGORIES\""
       " ON \"PUBLIC\".\"VENUES\".\"CATEGORY_ID\" = 1 "
       "LIMIT 1048576")
  (native-form
   (data/run-mbql-query venues
     {:joins    [{:source-table $$categories
                  :condition    [:= [:field-id $category_id] 1]}]})))

;; TODO - need to
(datasets/expect-with-drivers (qp.test/non-timeseries-drivers-with-feature :left-join)
  [["Red Medicine"          "Asian"]
   ["Stout Burgers & Beers" "Burger"]
   ["The Apple Pan"         "Burger"]]
  (qp.test/rows
    (data/run-mbql-query venues
      {:fields   [[:field-id $name] [:joined-field "CATEGORIES" [:field-id $categories.name]]]
       :joins    [{:source-table $$categories
                   :condition    [:= [:field-id $category_id] [:joined-field "CATEGORIES" [:field-id $id]]]}]
       :order-by [[:asc [:field-id $id]]]
       :limit    3})))

;; TODO Can we supply a custom alias?

;; TODO Can we do a left outer join?

;; TODO Can we do a right outer join?

;; TODO Can we do an inner join?

;; TODO Can we do a full join?

;; TODO Can we automatically include `:all` Fields?

;; TODO Can we include no Fields (with `:none`)?

;; TODO Can we include a list of specific Fields?

;; TODO Can we join on a custom condition?

;; TODO Can we join on bucketed datetimes?

;; TODO Can we join against a source nested MBQL query?

;; TODO Can we join against a source nested native query?

;; TODO Can we include a list of specific Field for the source nested query?

;; TODO Do joins inside nested queries work?

;; TODO Can we join the same table twice with different conditions?

;; TODO Can we join the same table twice with the same condition?
