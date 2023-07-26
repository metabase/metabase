(ns metabase.metabot.metabot-test-models
  (:require [clojure.test :refer :all]
            [metabase.test :as mt]))

(defn full-join-orders-test-query
  "This query does a full natural join of the orders, products, and people tables by user and product id."
  []
  (mt/$ids
   {:source-table $$orders
    :joins        [{:fields       [&u.people.address
                                   &u.people.birth_date
                                   &u.people.city
                                   &u.people.created_at
                                   &u.people.email
                                   &u.people.id
                                   &u.people.latitude
                                   &u.people.longitude
                                   &u.people.name
                                   &u.people.password
                                   &u.people.source
                                   &u.people.state
                                   &u.people.zip]
                    :source-table $$people
                    :alias        :u
                    :condition    [:= $orders.user_id &u.people.id]}
                   {:fields       [&p.products.category
                                   &p.products.created_at
                                   &p.products.ean
                                   &p.products.id
                                   &p.products.price
                                   &p.products.rating
                                   &p.products.title
                                   &p.products.vendor]
                    :source-table $$products
                    :alias        :p
                    :condition    [:= $orders.product_id &p.products.id]}]
    :fields       [$orders.created_at
                   $orders.discount
                   $orders.id
                   $orders.product_id
                   $orders.quantity
                   $orders.subtotal
                   $orders.tax
                   $orders.total
                   $orders.user_id]}))