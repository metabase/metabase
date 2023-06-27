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
  (let [query   (lib/query meta/metadata-provider (meta/table-metadata :venues))
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
  (let [query   (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
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
  (let [query   (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
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
  (let [query   (lib.tu/query-with-card-source-table)
        columns (lib/orderable-columns query)
        groups  (lib/group-columns columns)]
    (is (=? [{::lib.column-group/group-type :group-type/main
              ::lib.column-group/columns    [{:display-name "User ID", :lib/source :source/card}
                                             {:display-name "Count", :lib/source :source/card}]}
             {::lib.column-group/group-type :group-type/join.implicit
              :fk-field-id                  (meta/id :checkins :user-id)
              ::lib.column-group/columns    [{:display-name "ID", :lib/source :source/implicitly-joinable}
                                             {:display-name "Name", :lib/source :source/implicitly-joinable}
                                             {:display-name "Last Login", :lib/source :source/implicitly-joinable}]}]
            groups))
    (testing `lib/display-info
      (is (=? [{:name                   "My Card"
                :display-name           "My Card"
                :is-from-join           false
                :is-implicitly-joinable false}
               {:name                   "USER_ID"
                :display-name           "User ID"
                :fk-reference-name      "User"
                :is-from-join           false
                :is-implicitly-joinable true}]
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
  (let [query   (lib.tu/query-with-expression)
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
  (let [query   (-> (lib.tu/query-with-card-source-table)
                    (lib/expression "expr" (lib/absolute-datetime "2020" :month)))
        columns (lib/orderable-columns query)
        groups  (lib/group-columns columns)]
    (is (=? [{::lib.column-group/group-type :group-type/main
              ::lib.column-group/columns    [{:display-name "User ID", :lib/source :source/card}
                                             {:display-name "Count", :lib/source :source/card}
                                             {:display-name "expr", :lib/source :source/expressions}]}
             {::lib.column-group/group-type :group-type/join.implicit
              :fk-field-id                  (meta/id :checkins :user-id)
              ::lib.column-group/columns    [{:display-name "ID", :lib/source :source/implicitly-joinable}
                                             {:display-name "Name", :lib/source :source/implicitly-joinable}
                                             {:display-name "Last Login", :lib/source :source/implicitly-joinable}] }]
            groups))
    (testing `lib/display-info
      (is (=? [{:name                   "My Card"
                :display-name           "My Card"
                :is-from-join           false
                :is-implicitly-joinable false}
               {:name                   "USER_ID"
                :display-name           "User ID"
                :fk-reference-name      "User"
                :is-from-join           false
                :is-implicitly-joinable true}]
              (for [group groups]
                (lib/display-info query group)))))
    (testing `lib/columns-group-columns
      (is (= columns
             (mapcat lib/columns-group-columns groups))))))

(deftest ^:parallel native-query-test
  (let [query  (lib.tu/native-query)
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
  (let [query  (-> (lib.tu/native-query)
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
