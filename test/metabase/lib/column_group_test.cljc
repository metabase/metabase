(ns metabase.lib.column-group-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [malli.core :as mc]
   [metabase.lib.column-group :as lib.column-group]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel basic-test
  (let [query   (lib/query-for-table-name meta/metadata-provider "VENUES")
        columns (lib/orderable-columns query)
        groups  (lib/group-columns columns)]
    (is (not (mc/explain [:sequential @#'lib.column-group/ColumnGroup] groups)))
    (is (=? [{::lib.column-group/group-type :group-type/main
              :lib/type                     :metadata/column-group
              ::lib.column-group/columns    [{:name "ID", :display_name "ID"}
                                             {:name "NAME", :display_name "Name"}
                                             {:name "CATEGORY_ID", :display_name "Category ID"}
                                             {:name "LATITUDE", :display_name "Latitude"}
                                             {:name "LONGITUDE", :display_name "Longitude"}
                                             {:name "PRICE", :display_name "Price"}]}
             {::lib.column-group/group-type :group-type/join.implicit
              :lib/type                     :metadata/column-group
              ::lib.column-group/columns    [{:name "ID", :display_name "ID"}
                                             {:name "NAME", :display_name "Name"}]}]
            groups))
    (testing `lib/display-info
      (is (=? [{:is_from_join           false
                :is_implicitly_joinable false
                :name                   "VENUES"
                :display_name           "Venues"}
               {:is_from_join           false
                :is_implicitly_joinable true
                :name                   "CATEGORY_ID"
                :display_name           "Category ID"
                :fk_reference_name      "Category"}]
              (for [group groups]
                (lib/display-info query group)))))
    (testing `lib/columns-group-columns
      (is (= columns
             (mapcat lib/columns-group-columns groups))))))

(deftest ^:parallel aggregation-and-breakout-test
  (let [query   (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                    (lib/aggregate (lib/sum (lib/field "VENUES" "ID")))
                    (lib/breakout (lib/field "VENUES" "NAME")))
        columns (lib/orderable-columns query)
        groups  (lib/group-columns columns)]
    (is (=? [{::lib.column-group/group-type :group-type/main
              ::lib.column-group/columns    [{:display_name "Name", :lib/source :source/breakouts}
                                             {:display_name "Sum of ID", :lib/source :source/aggregations}]}]
            groups))
    (testing `lib/display-info
      (is (=? [{:is_from_join           false
                :is_implicitly_joinable false
                :name                   "VENUES"
                :display_name           "Venues"}]
              (for [group groups]
                (lib/display-info query group)))))
    (testing `lib/columns-group-columns
      (is (= columns
             (mapcat lib/columns-group-columns groups))))))

(deftest ^:parallel multi-stage-test
  (let [query   (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                    (lib/aggregate (lib/sum (lib/field "VENUES" "ID")))
                    (lib/breakout (lib/field "VENUES" "NAME"))
                    (lib/append-stage))
        columns (lib/orderable-columns query)
        groups  (lib/group-columns columns)]
    (is (=? [{::lib.column-group/group-type :group-type/main
              ::lib.column-group/columns    [{:display_name "Name", :lib/source :source/previous-stage}
                                             {:display_name "Sum of ID", :lib/source :source/previous-stage}]}]
            groups))
    (testing `lib/display-info
      (is (=? [{:display_name ""
                :is_from_join false
                :is_implicitly_joinable false}]
              (for [group groups]
                (lib/display-info query group)))))
    (testing `lib/columns-group-columns
      (is (= columns
             (mapcat lib/columns-group-columns groups))))))

(deftest ^:parallel source-card-test
  (let [query   (lib.tu/query-with-card-source-table)
        columns (lib/orderable-columns query)
        groups  (lib/group-columns columns)]
    (is (=? [{::lib.column-group/group-type :group-type/main
              ::lib.column-group/columns    [{:display_name "User ID", :lib/source :source/card}
                                             {:display_name "Count", :lib/source :source/card}]}
             {::lib.column-group/group-type :group-type/join.implicit
              :fk-field-id                  (meta/id :checkins :user-id)
              ::lib.column-group/columns    [{:display_name "ID", :lib/source :source/implicitly-joinable}
                                             {:display_name "Name", :lib/source :source/implicitly-joinable}
                                             {:display_name "Last Login", :lib/source :source/implicitly-joinable}]}]
            groups))
    (testing `lib/display-info
      (is (=? [{:name                   "My Card"
                :display_name           "My Card"
                :is_from_join           false
                :is_implicitly_joinable false}
               {:name                   "USER_ID"
                :display_name           "User ID"
                :fk_reference_name      "User"
                :is_from_join           false
                :is_implicitly_joinable true}]
              (for [group groups]
                (lib/display-info query group)))))
    (testing `lib/columns-group-columns
      (is (= columns
             (mapcat lib/columns-group-columns groups))))))

(deftest ^:parallel joins-test
  (let [query   (lib.tu/query-with-join)
        columns (lib/orderable-columns query)
        groups  (lib/group-columns columns)]
    (is (=? [{::lib.column-group/group-type :group-type/main
              ::lib.column-group/columns    [{:name "ID", :display_name "ID"}
                                             {:name "NAME", :display_name "Name"}
                                             {:name "CATEGORY_ID", :display_name "Category ID"}
                                             {:name "LATITUDE", :display_name "Latitude"}
                                             {:name "LONGITUDE", :display_name "Longitude"}
                                             {:name "PRICE", :display_name "Price"}]}
             {::lib.column-group/group-type :group-type/join.explicit
              :join-alias                   "Cat"
              ::lib.column-group/columns    [{:display_name "ID", :lib/source :source/joins}
                                             {:display_name "Name", :lib/source :source/joins}]}]
            groups))
    (testing `lib/display-info
      (is (=? [{:is_from_join           false
                :is_implicitly_joinable false
                :name                   "VENUES"
                :display_name           "Venues"}
               {:is_from_join           true
                :is_implicitly_joinable false
                :name                   "Cat"
                :display_name           "Categories"}]
              (for [group groups]
                (lib/display-info query group)))))
    (testing `lib/columns-group-columns
      (is (= columns
             (mapcat lib/columns-group-columns groups))))))

(deftest ^:parallel expressions-test
  (let [query   (lib.tu/query-with-expression)
        columns (lib/orderable-columns query)
        groups  (lib/group-columns columns)]
    (is (=? [{::lib.column-group/group-type :group-type/main
              ::lib.column-group/columns    [{:name "ID", :display_name "ID"}
                                             {:name "NAME", :display_name "Name"}
                                             {:name "CATEGORY_ID", :display_name "Category ID"}
                                             {:name "LATITUDE", :display_name "Latitude"}
                                             {:name "LONGITUDE", :display_name "Longitude"}
                                             {:name "PRICE", :display_name "Price"}
                                             {:display_name "expr", :lib/source :source/expressions}]}
             {::lib.column-group/group-type :group-type/join.implicit
              :lib/type                     :metadata/column-group
              ::lib.column-group/columns    [{:name "ID", :display_name "ID"}
                                             {:name "NAME", :display_name "Name"}]}]
            groups))
    (testing `lib/display-info
      (is (=? [{:is_from_join           false
                :is_implicitly_joinable false
                :name                   "VENUES"
                :display_name           "Venues"}
               {:is_from_join           false
                :is_implicitly_joinable true
                :name                   "CATEGORY_ID"
                :display_name           "Category ID"
                :fk_reference_name      "Category"}]
              (for [group groups]
                (lib/display-info query group)))))
    (testing `lib/columns-group-columns
      (is (= columns
             (mapcat lib/columns-group-columns groups))))))

(deftest ^:parallel source-card-with-expressions-test
  (let [query   (-> (lib.tu/query-with-card-source-table)
                    (lib/expression "expr" (lib/absolute-datetime "2020" :month)))
        columns (lib/orderable-columns query)
        groups  (lib/group-columns columns)]
    (is (=? [{::lib.column-group/group-type :group-type/main
              ::lib.column-group/columns    [{:display_name "User ID", :lib/source :source/card}
                                             {:display_name "Count", :lib/source :source/card}
                                             {:display_name "expr", :lib/source :source/expressions}]}
             {::lib.column-group/group-type :group-type/join.implicit
              :fk-field-id                  (meta/id :checkins :user-id)
              ::lib.column-group/columns    [{:display_name "ID", :lib/source :source/implicitly-joinable}
                                             {:display_name "Name", :lib/source :source/implicitly-joinable}
                                             {:display_name "Last Login", :lib/source :source/implicitly-joinable}] }]
            groups))
    (testing `lib/display-info
      (is (=? [{:name                   "My Card"
                :display_name           "My Card"
                :is_from_join           false
                :is_implicitly_joinable false}
               {:name                   "USER_ID"
                :display_name           "User ID"
                :fk_reference_name      "User"
                :is_from_join           false
                :is_implicitly_joinable true}]
              (for [group groups]
                (lib/display-info query group)))))
    (testing `lib/columns-group-columns
      (is (= columns
             (mapcat lib/columns-group-columns groups))))))

(deftest ^:parallel native-query-test
  (let [query  (lib.tu/native-query)
        groups (lib/group-columns (lib/orderable-columns query))]
    (is (=? [{::lib.column-group/group-type :group-type/main
              ::lib.column-group/columns    [{:display_name "another Field", :lib/source :source/native}
                                             {:display_name "sum of User ID", :lib/source :source/native}]}]
            groups))
    (testing `lib/display-info
      (is (=? [{:display_name           "Native query"
                :is_from_join           false
                :is_implicitly_joinable false}]
              (for [group groups]
                (lib/display-info query group)))))))

(deftest ^:parallel native-source-query-test
  (let [query  (-> (lib.tu/native-query)
                   lib/append-stage)
        groups (lib/group-columns (lib/orderable-columns query))]
    (is (=? [{::lib.column-group/group-type :group-type/main
              ::lib.column-group/columns    [{:display_name "another Field", :lib/source :source/previous-stage}
                                             {:display_name "sum of User ID", :lib/source :source/previous-stage}]}]
            groups))
    (testing `lib/display-info
      (is (=? [{:display_name           ""
                :is_from_join           false
                :is_implicitly_joinable false}]
              (for [group groups]
                (lib/display-info query group)))))))
