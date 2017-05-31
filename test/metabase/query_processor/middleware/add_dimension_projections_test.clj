(ns metabase.query-processor.middleware.add-dimension-projections-test
  "Tests for the Query Processor cache."
  (:require [expectations :refer :all]
            [metabase.query-processor.middleware.add-dimension-projections :refer :all]
            [metabase.query-processor.interface :as i]
            [metabase.test.util :as tu]
            [toucan.db :as db]
            [metabase.query-processor.middleware.expand :as ql]))

(tu/resolve-private-vars metabase.query-processor.middleware.add-dimension-projections remap-results add-fk-remaps)

(def col-defaults
  {:description nil
     :source :fields,
     :extra_info {},
     :fk_field_id nil,
     :values [],
     :dimensions [],
     :visibility_type :normal,
     :target nil,
     :remapped_from nil,
     :remapped_to nil})

(def example-resultset
  {:rows
   [[1 "Red Medicine" 4 3]
    [2 "Stout Burgers & Beers" 11 2]
    [3 "The Apple Pan" 11 2]
    [4 "Wurstküche" 29 2]
    [5 "Brite Spot Family Restaurant" 20 2]],
   :columns ["ID" "NAME" "CATEGORY_ID" "PRICE"],
   :cols
   (mapv #(merge col-defaults %)
         [
          ;; 0
          {:table_id 4,
           :schema_name "PUBLIC",
           :special_type :type/PK,
           :name "ID",
           :id 12,
           :display_name "ID",
           :base_type :type/BigInteger}
          ;; 1
          {:table_id 4,
           :schema_name "PUBLIC",
           :special_type :type/Name,
           :name "NAME",
           :id 15,
           :display_name "Name",
           :base_type :type/Text}
          ;; 2
          {:table_id 4,
           :schema_name "PUBLIC",
           :special_type :type/FK,
           :name "CATEGORY_ID",
           :extra_info {:target_table_id 1},
           :id 11,
           :values {:id 1, :human_readable_values ["Foo" "Bar" "Baz" "Qux"],
                    :values [4 11 29 20], :field_id 33}
           :dimensions {:id 1 :type "internal" :name "Foo" :field_id 10}
           :display_name "Category ID",
           :base_type :type/Integer}
          ;; 3
          {:table_id 4,
           :schema_name "PUBLIC",
           :special_type :type/Category,
           :name "PRICE",
           :id 16,
           :display_name "Price",
           :base_type :type/Integer}])})

(expect
  (-> example-resultset
      (assoc :rows [[1 "Red Medicine" 4 3 "Foo"]
                    [2 "Stout Burgers & Beers" 11 2 "Bar"]
                    [3 "The Apple Pan" 11 2 "Bar"]
                    [4 "Wurstküche" 29 2 "Baz"]
                    [5 "Brite Spot Family Restaurant" 20 2 "Qux"]])
      (update :columns conj "Foo")
      (update :cols (fn [cols]
                      (conj (mapv (fn [col] (dissoc col :dimensions :values)) cols)
                            {:description nil,
                             :id nil,
                             :table_id nil,
                             :expression-name "Foo",
                             :source :fields,
                             :name "Foo",
                             :display_name "Foo",
                             :target nil,
                             :extra_info {}
                             :remapped_from "CATEGORY_ID"
                             :remapped_to nil})))
      (update :cols #(mapv (fn [col]
                             (if (= "CATEGORY_ID" (:name col))
                               (assoc col
                                 :remapped_to "Foo"
                                 :remapped_from nil)
                               col))
                           %)))
  (remap-results example-resultset))

(def field-defaults
  {:dimensions [],
   :values [],
   :visibility-type :normal})

(def example-query
  {:query
   {:fields
    (mapv #(merge field-defaults %)
          [{:description "A unique internal identifier for the review. Should not be used externally.",
            :base-type :type/BigInteger,
            :table-id 4,
            :special-type :type/PK,
            :field-name "ID",
            :field-display-name "ID",
            :position 0,
            :field-id 31,
            :table-name "REVIEWS",
            :schema-name "PUBLIC"}
           {:description "The review the user left. Limited to 2000 characters.",
            :base-type :type/Text,
            :table-id 4,
            :special-type :type/Description,
            :field-name "BODY",
            :field-display-name "Body",
            :position 0,
            :field-id 29,
            :table-name "REVIEWS",
            :schema-name "PUBLIC"}
           {:field-id 32,
            :field-name "PRODUCT_ID",
            :field-display-name "Product ID",
            :base-type :type/Integer,
            :special-type :type/FK,
            :table-id 4,
            :schema-name "PUBLIC",
            :table-name "REVIEWS",
            :position 0,
            :fk-field-id nil,
            :description "The product the review was for",
            :parent-id nil,
            :parent nil,
            :remapped-from nil,
            :remapped-to nil,
            :dimensions {:id 2, :name "Product", :field_id 32, :human_readable_field_id 27, :type "external"}}])}})

(expect
  (-> example-query
      ;; This needs to be fixed, we don't know the name of the new
      ;; column until it gets resolved, so it doesn't get set here
      (update-in [:query :fields] conj (i/map->FieldPlaceholder {:fk-field-id 32
                                                                 :field-id 27
                                                                 :remapped-from "PRODUCT_ID"
                                                                 :remapped-to nil
                                                                 :field-display-name "Product"})))
  (add-fk-remaps example-query))

(def external-remapped-result
  (-> example-resultset
      (update :cols conj {:description "The name of the product as it should be displayed to customers.",
                          :table_id 3,
                          :schema_name nil,
                          :special_type :type/Category,
                          :name "CATEGORY",
                          :source :fields,
                          :remapped_from "CATEGORY_ID",
                          :extra_info {},
                          :fk_field_id 32,
                          :remapped_to nil,
                          :id 27,
                          :visibility_type :normal,
                          :target nil,
                          :display_name "Category",
                          :base_type :type/Text})
      (update-in [:cols 2]
                 (fn [col]
                   (-> col
                       (update :values merge {:human_readable_values [] })
                       (update :dimensions merge {:type "external" :human_readable_field_id 27}))))))

(expect
  (-> external-remapped-result
      (update :cols (fn [col] (mapv #(dissoc % :dimensions :values) col)))
      (update-in [:cols 2] assoc :remapped_to "CATEGORY"))
  (remap-results external-remapped-result))
