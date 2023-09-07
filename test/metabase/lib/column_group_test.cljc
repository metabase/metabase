(ns metabase.lib.column-group-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [malli.core :as mc]
   [metabase.lib.column-group :as lib.column-group]
   [metabase.lib.core :as lib]
   [metabase.lib.join :as lib.join]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel basic-test
  (let [query   lib.tu/venues-query
        columns (lib/orderable-columns query)
        groups  (lib/group-columns columns)]
    (is (not (mc/explain [:sequential @#'lib.column-group/ColumnGroup] groups)))
    (is (=? [{::lib.column-group/group-type :group-type/main
              :lib/type                     :metadata/column-group
              ::lib.column-group/columns    [{:name "ID", :display-name "ID"}
                                             {:name "NAME", :display-name "Name"}
                                             {:name "CATEGORY_ID", :display-name "Category ID"}
                                             {:name "LATITUDE", :display-name "Latitude"}
                                             {:name "LONGITUDE", :display-name "Longitude"}
                                             {:name "PRICE", :display-name "Price"}]}
             {::lib.column-group/group-type :group-type/join.implicit
              :lib/type                     :metadata/column-group
              ::lib.column-group/columns    [{:name "ID", :display-name "ID"}
                                             {:name "NAME", :display-name "Name"}]}]
            groups))
    (testing `lib/display-info
      (is (=? [{:is-from-join           false
                :is-implicitly-joinable false
                :name                   "VENUES"
                :display-name           "Venues"}
               {:is-from-join           false
                :is-implicitly-joinable true
                :name                   "CATEGORY_ID"
                :display-name           "Category ID"
                :fk-reference-name      "Category"}]
              (for [group groups]
                (lib/display-info query group)))))
    (testing `lib/columns-group-columns
      (is (= columns
             (mapcat lib/columns-group-columns groups))))))

(deftest ^:parallel aggregation-and-breakout-test
  (let [query   (-> lib.tu/venues-query
                    (lib/aggregate (lib/sum (meta/field-metadata :venues :id)))
                    (lib/breakout (meta/field-metadata :venues :name)))
        columns (lib/orderable-columns query)
        groups  (lib/group-columns columns)]
    (is (=? [{::lib.column-group/group-type :group-type/main
              ::lib.column-group/columns    [{:display-name "Name", :lib/source :source/breakouts}
                                             {:display-name "Sum of ID", :lib/source :source/aggregations}]}]
            groups))
    (testing `lib/display-info
      (is (=? [{:is-from-join           false
                :is-implicitly-joinable false
                :name                   "VENUES"
                :display-name           "Venues"}]
              (for [group groups]
                (lib/display-info query group)))))
    (testing `lib/columns-group-columns
      (is (= columns
             (mapcat lib/columns-group-columns groups))))))

(deftest ^:parallel multi-stage-test
  (let [query   (-> lib.tu/venues-query
                    (lib/aggregate (lib/sum (meta/field-metadata :venues :id)))
                    (lib/breakout (meta/field-metadata :venues :name))
                    (lib/append-stage))
        columns (lib/orderable-columns query)
        groups  (lib/group-columns columns)]
    (is (=? [{::lib.column-group/group-type :group-type/main
              ::lib.column-group/columns    [{:display-name "Name", :lib/source :source/previous-stage}
                                             {:display-name "Sum of ID", :lib/source :source/previous-stage}]}]
            groups))
    (testing `lib/display-info
      (is (=? [{:display-name ""
                :is-from-join false
                :is-implicitly-joinable false}]
              (for [group groups]
                (lib/display-info query group)))))
    (testing `lib/columns-group-columns
      (is (= columns
             (mapcat lib/columns-group-columns groups))))))

(deftest ^:parallel source-card-test
  (let [query   lib.tu/query-with-source-card
        columns (lib/orderable-columns query)
        groups  (lib/group-columns columns)]
    (is (=? [{::lib.column-group/group-type :group-type/main
              ::lib.column-group/columns    [{:display-name "User ID", :lib/source :source/card}
                                             {:display-name "Count", :lib/source :source/card}]}]
            groups))
    (testing `lib/display-info
      (is (=? [{:name                   "My Card"
                :display-name           "My Card"
                :is-from-join           false
                :is-implicitly-joinable false}]
              (for [group groups]
                (lib/display-info query group)))))
    (testing `lib/columns-group-columns
      (is (= columns
             (mapcat lib/columns-group-columns groups))))))

(deftest ^:parallel joins-test
  (let [query   lib.tu/query-with-join
        columns (lib/orderable-columns query)
        groups  (lib/group-columns columns)]
    (is (=? [{::lib.column-group/group-type :group-type/main
              ::lib.column-group/columns    [{:name "ID", :display-name "ID"}
                                             {:name "NAME", :display-name "Name"}
                                             {:name "CATEGORY_ID", :display-name "Category ID"}
                                             {:name "LATITUDE", :display-name "Latitude"}
                                             {:name "LONGITUDE", :display-name "Longitude"}
                                             {:name "PRICE", :display-name "Price"}]}
             {::lib.column-group/group-type :group-type/join.explicit
              :join-alias                   "Cat"
              ::lib.column-group/columns    [{:display-name "ID", :lib/source :source/joins}
                                             {:display-name "Name", :lib/source :source/joins}]}]
            groups))
    (testing `lib/display-info
      (is (=? [{:is-from-join           false
                :is-implicitly-joinable false
                :name                   "VENUES"
                :display-name           "Venues"}
               {:is-from-join           true
                :is-implicitly-joinable false
                :name                   "Cat"
                :display-name           "Categories"}]
              (for [group groups]
                (lib/display-info query group)))))
    (testing `lib/columns-group-columns
      (is (= columns
             (mapcat lib/columns-group-columns groups))))))

(deftest ^:parallel expressions-test
  (let [query   lib.tu/query-with-expression
        columns (lib/orderable-columns query)
        groups  (lib/group-columns columns)]
    (is (=? [{::lib.column-group/group-type :group-type/main
              ::lib.column-group/columns    [{:name "ID", :display-name "ID"}
                                             {:name "NAME", :display-name "Name"}
                                             {:name "CATEGORY_ID", :display-name "Category ID"}
                                             {:name "LATITUDE", :display-name "Latitude"}
                                             {:name "LONGITUDE", :display-name "Longitude"}
                                             {:name "PRICE", :display-name "Price"}
                                             {:display-name "expr", :lib/source :source/expressions}]}
             {::lib.column-group/group-type :group-type/join.implicit
              :lib/type                     :metadata/column-group
              ::lib.column-group/columns    [{:name "ID", :display-name "ID"}
                                             {:name "NAME", :display-name "Name"}]}]
            groups))
    (testing `lib/display-info
      (is (=? [{:is-from-join           false
                :is-implicitly-joinable false
                :name                   "VENUES"
                :display-name           "Venues"}
               {:is-from-join           false
                :is-implicitly-joinable true
                :name                   "CATEGORY_ID"
                :display-name           "Category ID"
                :fk-reference-name      "Category"}]
              (for [group groups]
                (lib/display-info query group)))))
    (testing `lib/columns-group-columns
      (is (= columns
             (mapcat lib/columns-group-columns groups))))))

(deftest ^:parallel source-card-with-expressions-test
  (let [query   (-> lib.tu/query-with-source-card
                    (lib/expression "expr" (lib/absolute-datetime "2020" :month)))
        columns (lib/orderable-columns query)
        groups  (lib/group-columns columns)]
    (is (=? [{::lib.column-group/group-type :group-type/main
              ::lib.column-group/columns    [{:display-name "User ID", :lib/source :source/card}
                                             {:display-name "Count", :lib/source :source/card}
                                             {:display-name "expr", :lib/source :source/expressions}]}]
            groups))
    (testing `lib/display-info
      (is (=? [{:name                   "My Card"
                :display-name           "My Card"
                :is-from-join           false
                :is-implicitly-joinable false}]
              (for [group groups]
                (lib/display-info query group)))))
    (testing `lib/columns-group-columns
      (is (= columns
             (mapcat lib/columns-group-columns groups))))))

(deftest ^:parallel native-query-test
  (let [query  lib.tu/native-query
        groups (lib/group-columns (lib/orderable-columns query))]
    (is (=? [{::lib.column-group/group-type :group-type/main
              ::lib.column-group/columns    [{:display-name "another Field", :lib/source :source/native}
                                             {:display-name "sum of User ID", :lib/source :source/native}]}]
            groups))
    (testing `lib/display-info
      (is (=? [{:display-name           "Native query"
                :is-from-join           false
                :is-implicitly-joinable false}]
              (for [group groups]
                (lib/display-info query group)))))))

(deftest ^:parallel native-source-query-test
  (let [query  (-> lib.tu/native-query
                   lib/append-stage)
        groups (lib/group-columns (lib/orderable-columns query))]
    (is (=? [{::lib.column-group/group-type :group-type/main
              ::lib.column-group/columns    [{:display-name "another Field", :lib/source :source/previous-stage}
                                             {:display-name "sum of User ID", :lib/source :source/previous-stage}]}]
            groups))
    (testing `lib/display-info
      (is (=? [{:display-name           ""
                :is-from-join           false
                :is-implicitly-joinable false}]
              (for [group groups]
                (lib/display-info query group)))))))

(defn- rhs-columns [query join-or-joinable]
  (let [cols (lib/join-condition-rhs-columns query join-or-joinable nil nil)]
    (testing `lib/join-condition-rhs-columns
      (is (=? [{:name "ID"}
               {:name "NAME"}]
              cols)))
    cols))

(deftest ^:parallel join-condition-rhs-columns-group-columns-join-test
  (testing "#32509 with an existing join"
    (let [[join] (lib/joins lib.tu/query-with-join)]
      (is (=? {:lib/type :mbql/join}
              join))
      (let [cols   (rhs-columns lib.tu/query-with-join join)
            groups (lib/group-columns cols)]
        (testing `lib/group-columns
          (is (=? [{:lib/type                     :metadata/column-group
                    :join-alias                   "Cat"
                    ::lib.column-group/group-type :group-type/join.explicit
                    ::lib.column-group/columns    [{:name                 "ID"
                                                    :table-id             (meta/id :categories)
                                                    ::lib.join/join-alias "Cat"}
                                                   {:name                 "NAME"
                                                    :table-id             (meta/id :categories)
                                                    ::lib.join/join-alias "Cat"}]}]
                  groups)))
        (testing `lib/display-info
          (is (=? [{:name         "Cat"
                    :display-name "Categories"
                    :is-from-join true}]
                  (for [group groups]
                    (lib/display-info lib.tu/query-with-join group)))))))))

(deftest ^:parallel join-condition-rhs-columns-group-columns-table-test
  (testing "#32509 when building a join against a Table"
    (let [cols   (rhs-columns lib.tu/venues-query (meta/table-metadata :categories))
          groups (lib/group-columns cols)]
      (testing `lib/group-columns
        (is (=? [{:lib/type                     :metadata/column-group
                  :table-id                     (meta/id :categories)
                  ::lib.column-group/group-type :group-type/join.explicit
                  ::lib.column-group/columns    [{:name "ID", :table-id (meta/id :categories)}
                                                 {:name "NAME", :table-id (meta/id :categories)}]}]
                groups)))
      (testing `lib/display-info
        (is (=? [{:name         "CATEGORIES"
                  :display-name "Categories"
                  :is-from-join true}]
                (for [group groups]
                  (lib/display-info lib.tu/venues-query group))))))))

(deftest ^:parallel join-condition-rhs-columns-group-columns-card-test
  (testing "#32509 when building a join against a Card"
    (doseq [{:keys [message card metadata-provider]}
            [{:message           "MBQL Card"
              :card              (:categories lib.tu/mock-cards)
              :metadata-provider lib.tu/metadata-provider-with-mock-cards}
             {:message           "Native Card"
              :card              (lib.tu/mock-cards :categories/native)
              :metadata-provider lib.tu/metadata-provider-with-mock-cards}]]
      (testing message
        (let [cols   (rhs-columns lib.tu/venues-query card)
              groups (lib/group-columns cols)]
          (testing `lib/group-columns
            (is (=? [{:lib/type                     :metadata/column-group
                      :card-id                      (:id card)
                      ::lib.column-group/group-type :group-type/join.explicit
                      ::lib.column-group/columns    [{:name "ID", :lib/card-id (:id card)}
                                                     {:name "NAME", :lib/card-id (:id card)}]}]
                    groups)))
          (testing `lib/display-info
            (testing "Card is not present in MetadataProvider"
              (is (=? [{:display-name (str "Question " (:id card))
                        :is-from-join true}]
                      (for [group groups]
                        (lib/display-info lib.tu/venues-query group)))))
            (testing "Card *is* present in MetadataProvider"
              (let [query (assoc lib.tu/venues-query :lib/metadata metadata-provider)]
                (is (=? [{:name         "Mock categories card"
                          :display-name "Mock Categories Card"
                          :is-from-join true}]
                        (for [group groups]
                          (lib/display-info query group))))))))))))

(deftest ^:parallel self-join-grouping-test
  (let [query   (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                    (lib/with-fields (for [field [:id :tax]]
                                       (lib/ref (meta/field-metadata :orders field))))
                    (lib/join (-> (lib/join-clause (meta/table-metadata :orders)
                                                   [(lib/= (meta/field-metadata :orders :id)
                                                           (meta/field-metadata :orders :id))])
                                  (lib/with-join-fields (for [field [:id :tax]]
                                                          (lib/ref (meta/field-metadata :orders field)))))))
        columns (lib/visible-columns query)
        marked  (metabase.lib.equality/mark-selected-columns query -1 columns (lib/returned-columns query))]
    (is (= 39 (count columns)))
    (is (= 4  (count (lib/returned-columns query))))
    (is (= 39 (count marked)))
    (is (= 4  (count (filter :selected? marked))))
    (is (=? [{::lib.column-group/group-type :group-type/main
              :lib/type :metadata/column-group
              ::lib.column-group/columns
              (for [field-name ["ID" "USER_ID" "PRODUCT_ID" "SUBTOTAL" "TAX"
                                "TOTAL" "DISCOUNT" "CREATED_AT" "QUANTITY"]]
                {:name field-name
                 :lib/desired-column-alias field-name
                 :lib/source :source/table-defaults})}
             {::lib.column-group/group-type :group-type/join.explicit
              :lib/type :metadata/column-group
              ::lib.column-group/columns
              (for [field-name ["ID" "USER_ID" "PRODUCT_ID" "SUBTOTAL" "TAX"
                                "TOTAL" "DISCOUNT" "CREATED_AT" "QUANTITY"]]
                {:name field-name
                 :lib/desired-column-alias (str "Orders__" field-name)
                 :lib/source :source/joins})}
             {::lib.column-group/group-type :group-type/join.implicit
              :lib/type :metadata/column-group
              ::lib.column-group/columns
              (for [field-name ["ID" "ADDRESS" "EMAIL" "PASSWORD" "NAME" "CITY" "LONGITUDE"
                                "STATE" "SOURCE" "BIRTH_DATE" "ZIP" "LATITUDE" "CREATED_AT"]]
                {:name field-name
                 :lib/desired-column-alias (str "PEOPLE__via__USER_ID__" field-name)
                 :lib/source :source/implicitly-joinable})}
             {::lib.column-group/group-type :group-type/join.implicit
              :lib/type :metadata/column-group
              ::lib.column-group/columns
              (for [field-name ["ID" "EAN" "TITLE" "CATEGORY" "VENDOR" "PRICE" "RATING" "CREATED_AT"]]
                {:name field-name
                 :lib/desired-column-alias (str "PRODUCTS__via__PRODUCT_ID__" field-name)
                 :lib/source :source/implicitly-joinable})}]
            (lib/group-columns marked)))
    ))
