(ns metabase.transforms.test-dataset
  "A minimal but sufficient dataset for testing transforms functionality.
   This dataset is intentionally small to speed up test execution, especially
   on cloud databases like Snowflake where database creation is expensive."
  (:require
   [metabase.test :as mt]))

;; We define our own dataset so that we don't interfere with other tests
;; that could be run in parallel on the same db instance
;; e.g., metabase.driver.snowflake-test/describe-database-test

(mt/defdataset transforms-test
  "A small dataset specifically for transform tests. Contains enough data to test:
   - Basic transformations (filtering, aggregation)
   - Multiple tables for joins
   - Different data types
   - Enough rows to verify correctness without being slow"
  ;; Table order matters!
  [["transforms_customers"
    [{:field-name "name" :base-type :type/Text}
     {:field-name "email" :base-type :type/Text}
     {:field-name "joined_at" :base-type :type/DateTime}]
    [["Alice Smith" "alice@example.com" #t "2023-06-01T10:00:00"]
     ["Bob Johnson" "bob@example.com" #t "2023-07-15T10:00:00"]
     ["Carol White" "carol@example.com" #t "2023-08-20T10:00:00"]
     ["David Brown" "david@example.com" #t "2023-09-10T10:00:00"]]]

   ["transforms_products"
    [{:field-name "name" :base-type :type/Text}
     {:field-name "category" :base-type :type/Text}
     {:field-name "price" :base-type :type/Float}
     {:field-name "created_at" :base-type :type/DateTime}]
    [["Widget A" "Widget" 19.99 #t "2024-01-01T10:00:00"]
     ["Doohickey X" "Doohickey" 29.99 #t "2024-01-02T10:00:00"]
     ["Doohickey Y" "Doohickey" 49.99 #t "2024-01-03T10:00:00"]
     ["Doohickey Z" "Doohickey" 39.99 #t "2024-01-04T10:00:00"]
     ["Gadget Pro" "Gadget" 99.99 #t "2024-01-05T10:00:00"]
     ["Gizmo Lite" "Gizmo" 59.99 #t "2024-01-06T10:00:00"]
     ["Widget B" "Widget" 24.99 #t "2024-01-07T10:00:00"]
     ["Gizmo Plus" "Gizmo" 44.99 #t "2024-01-08T10:00:00"]
     ["Widget C" "Widget" 14.99 #t "2024-01-09T10:00:00"]
     ["Widget D" "Widget" 34.99 #t "2024-01-10T10:00:00"]
     ["Gadget Max" "Gadget" 149.99 #t "2024-01-11T10:00:00"]
     ["Gizmo Pro" "Gizmo" 89.99 #t "2024-01-12T10:00:00"]
     ["Doohickey A" "Doohickey" 19.99 #t "2024-01-13T10:00:00"]
     ["Gizmo Ultra" "Gizmo" 199.99 #t "2024-01-14T10:00:00"]
     ["Widget E" "Widget" 44.99 #t "2024-01-15T10:00:00"]
     ["Gadget Mini" "Gadget" 79.99 #t "2024-01-16T10:00:00"]]]

   ["transforms_orders"
    [{:field-name "product_id" :base-type :type/Integer :fk "transforms_products"}
     {:field-name "customer_id" :base-type :type/Integer :fk "transforms_customers"}
     {:field-name "quantity" :base-type :type/Integer}
     {:field-name "total" :base-type :type/Float}
     {:field-name "order_date" :base-type :type/DateTime}]
    [[1 1 2 39.98 #t "2024-01-15T14:00:00"]
     [3 2 1 49.99 #t "2024-01-16T14:00:00"]
     [5 1 1 99.99 #t "2024-01-17T14:00:00"]
     [2 3 3 89.97 #t "2024-01-18T14:00:00"]
     [4 2 2 79.98 #t "2024-01-19T14:00:00"]
     [6 4 1 59.99 #t "2024-01-20T14:00:00"]
     [1 3 1 19.99 #t "2024-01-21T14:00:00"]
     [7 1 2 49.98 #t "2024-01-22T14:00:00"]
     [9 2 1 14.99 #t "2024-01-23T14:00:00"]
     [10 4 3 104.97 #t "2024-01-24T14:00:00"]
     [11 1 1 149.99 #t "2024-01-25T14:00:00"]
     [16 3 2 159.98 #t "2024-01-26T14:00:00"]]]])
