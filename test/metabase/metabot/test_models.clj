(ns metabase.metabot.test-models
  (:require [clojure.string :as str]
            [clojure.walk :as walk]
            [metabase.metabot.infer-mbql :as infer-mbql]
            [metabase.models :refer [Database Field Table]]
            [metabase.test :as mt]
            [metabase.util :as u]
            [toucan2.core :as t2]))

(defmacro total-orders []
  `{:dataset_query
    {:database (mt/id)
     :type     :query
     :query    {:source-table (mt/id :orders)
                :joins        [{:fields       [[:field (mt/id :people :address) {:join-alias "People - User"}]
                                               [:field (mt/id :people :email) {:join-alias "People - User"}]
                                               [:field (mt/id :people :name) {:join-alias "People - User"}]
                                               [:field (mt/id :people :city) {:join-alias "People - User"}]
                                               [:field (mt/id :people :longitude) {:join-alias "People - User"}]
                                               [:field (mt/id :people :state) {:join-alias "People - User"}]
                                               [:field (mt/id :people :source) {:join-alias "People - User"}]
                                               [:field (mt/id :people :birth_date) {:join-alias "People - User"}]
                                               [:field (mt/id :people :zip) {:join-alias "People - User"}]
                                               [:field (mt/id :people :latitude) {:join-alias "People - User"}]
                                               [:field (mt/id :people :created_at) {:join-alias "People - User"}]]
                                :alias        "People - User"
                                :condition    [:=
                                               [:field (mt/id :orders :user_id) nil]
                                               [:field (mt/id :people :id) {:join-alias "People - User"}]]
                                :source-table (mt/id :people)}
                               {:fields       [[:field (mt/id :products :ean) {:join-alias "Products"}]
                                               [:field (mt/id :products :title) {:join-alias "Products"}]
                                               [:field (mt/id :products :category) {:join-alias "Products"}]
                                               [:field (mt/id :products :vendor) {:join-alias "Products"}]
                                               [:field (mt/id :products :price) {:join-alias "Products"}]
                                               [:field (mt/id :products :rating) {:join-alias "Products"}]
                                               [:field (mt/id :products :created_at) {:join-alias "Products"}]]
                                :alias        "Products"
                                :condition    [:=
                                               [:field (mt/id :orders :product_id) nil]
                                               [:field (mt/id :products :id) {:join-alias "Products"}]]
                                :source-table (mt/id :products)}]
                :fields       [[:field (mt/id :orders :user_id) nil]
                               [:field (mt/id :orders :product_id) nil]
                               [:field (mt/id :orders :subtotal) nil]
                               [:field (mt/id :orders :tax) nil]
                               [:field (mt/id :orders :total) nil]
                               [:field (mt/id :orders :discount) nil]
                               [:field (mt/id :orders :created_at) nil]
                               [:field (mt/id :orders :quantity) nil]]
                :order-by     [[:asc
                                [:field
                                 (mt/id :orders :total)
                                 {:base-type :type/Float :effective-type "type/Float"}]]]}}
    :dataset true})

(defn- real-response->test-response
  "Takes an MBQL response with integer ids and replaces with (mt/id ...) references."
  [response]
  (let [name->keyword (comp u/lower-case-en keyword)]
    (walk/prewalk
      (fn [m]
        (if (vector? m)
          (let [[k o id & r] m]
            (case k
              :database (into [k `(~'mt/id)] r)
              :field (let [{field-name :name table-id :table_id} (t2/select-one [Field :name :table_id] :id id)
                           table-name (t2/select-one-fn :name Table :id table-id)]
                       (into [k o `(~'mt/id ~(name->keyword table-name) ~(name->keyword field-name))] r))
              :source-table (if (and
                                  (string? o)
                                  (str/starts-with? o "card__"))
                              [k `(~'format "card__%s" ~'model-id)]
                              m)
              m))
          m))
      response)))

(defmacro infer-mbql [dataset model prompt]
  `(mt/dataset ~dataset
     (mt/with-temp* [Card [m# (~model)]]
       (let [mbql# (infer-mbql/infer-mbql m# ~prompt)]
         {:mbql      mbql#
          :test-mbql (real-response->test-response mbql#)}))))

(comment
  (infer-mbql sample-dataset total-orders "Provide descriptive stats for sales per state")
  (infer-mbql sample-dataset total-orders "What are the 5 highest rated products by average product rating?")
  (infer-mbql sample-dataset total-orders "What are the 10 highest rated individual products?")
  (infer-mbql sample-dataset total-orders "What products have a rating greater than 2.0?")
  (infer-mbql sample-dataset total-orders "How many sales had a product price greater than the discount?")
  (infer-mbql sample-dataset total-orders "How many sales had a product price less than the discount?")
  ;;Doesn't work -- probably need unary operators
  (infer-mbql sample-dataset total-orders "How many sales weren't discounted?")
  (infer-mbql sample-dataset total-orders "How many sales are there?")
  (infer-mbql sample-dataset total-orders "Show me total sales grouped by category where rating is between 1.5 and 3.4.")
  (infer-mbql sample-dataset total-orders "Show me email addresses from gmail.")
  (infer-mbql sample-dataset total-orders "What is the most common product category purchased by gmail users?")
  ;; Also doesn't work but maybe we don't expect it to. Rosebud is a non-low-cardinality city and we need to provide context
  (infer-mbql sample-dataset total-orders "Show me the total sales for products sold in Rosebud.")
  (infer-mbql sample-dataset total-orders "Show me the total sales for products sold to residents of Rosebud.")
  (infer-mbql sample-dataset total-orders "What cities do people live in?")
  (infer-mbql sample-dataset total-orders "How many sales were in Idaho?")
  (infer-mbql sample-dataset total-orders "How much revenue did we have in the states CO UT and NV?")
  ;; I think this generally works using "CO" "UT" "NV" as the states (which I think is incomplete)
  (infer-mbql sample-dataset total-orders "How many sales were in the intermountain west?")
  ;; Doesn't seem to work but suggests a solution that does...what?
  (infer-mbql sample-dataset total-orders "How many sales were in the pacific northwest?")
  ;; Doesn't know what rust belt is -- but our SQL generator does know
  (infer-mbql sample-dataset total-orders "How many sales occurred in the rust belt?")
  ;; This does work ("CA" "OR" "WA")
  (infer-mbql sample-dataset total-orders "How many sales occurred on the west coast?")
  ;; Can't seem to figure this out
  (infer-mbql sample-dataset total-orders "What is the total revenue from sales in the pacific northwest?")
  (infer-mbql sample-dataset total-orders "How many gizmos did I sell?")
  (infer-mbql sample-dataset total-orders "How many sales did I have in each category?")
  (infer-mbql sample-dataset total-orders "What is the average sales revenue in each category?"))
