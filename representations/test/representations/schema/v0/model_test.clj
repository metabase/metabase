(ns representations.schema.v0.model-test
  (:require [clojure.test :refer [deftest testing is]]
            [representations.read :as read]
            [representations.schema.v0.model :as model]
            [representations.util.malli :as mu]))

(deftest model-schema-test
  (testing "model representation with native query is valid"
    (let [model {:type :model
                 :version :v0
                 :name "model-123"
                 :display_name "User Orders"
                 :description "All orders for active users"
                 :database "database-1"
                 :query "SELECT * FROM orders WHERE user_active = true"}]
      (is (= model
             (read/parse model)))))
  (testing "model representation with mbql query is valid"
    (let [model {:type :model
                 :version :v0
                 :name "model-123"
                 :display_name "User Orders"
                 :database "database-1"
                 :query {:source-table 1}}]
      (is (= model
             (read/parse model)))))
  (testing "model representation with columns is valid"
    (let [model {:type :model
                 :version :v0
                 :name "sales-data-model"
                 :display_name "Sales Data Model"
                 :description "Contains sales data of particular note"
                 :database "database-1"
                 :query {:source-table 1}
                 :columns [{:name "CATEGORY"
                            :display_name "Product"
                            :description "The type of product"
                            :visibility "normal"}
                           {:name "CREATED_AT"
                            :display_name "Day of Creation: Day"
                            :description "The date and time an order was submitted"
                            :visibility "normal"}
                           {:name "avg_3"
                            :display_name "Tax"
                            :currency "USD"
                            :settings {:currency "USD"}}]}]
      (is (= model
             (read/parse model))))))

(deftest model-column-test
  (testing "model column with all fields including settings"
    (let [col {:name "price"
               :display_name "Product Price"
               :description "The price of the product in USD"
               :visibility "normal"
               :visibility_type "normal"
               :fk_target_field_id 123
               :currency "USD"
               :settings {:column_title "Custom Title"
                          :text_align "right"
                          :text_wrapping true
                          :view_as "auto"
                          :link_text "View"
                          :link_url "https://example.com"
                          :show_mini_bar true
                          :number_style "currency"
                          :currency "USD"
                          :currency_style "symbol"
                          :date_style "YYYY-MM-DD"
                          :date_separator "/"
                          :date_abbreviate false
                          :time_enabled "seconds"
                          :time_style "HH:mm:ss"}}]
      (is (= col (mu/coerce ::model/model-column col))))))
