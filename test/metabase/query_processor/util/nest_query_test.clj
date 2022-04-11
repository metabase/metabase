(ns metabase.query-processor.util.nest-query-test
  (:require [clojure.test :refer :all]
            [clojure.walk :as walk]
            [metabase.driver :as driver]
            [metabase.models.field :refer [Field]]
            [metabase.query-processor :as qp]
            [metabase.query-processor.util.add-alias-info :as add]
            [metabase.query-processor.util.nest-query :as nest-query]
            [metabase.test :as mt]))

;; TODO -- this is duplicated with [[metabase.query-processor.util.add-alias-info-test/remove-source-metadata]]
(defn- remove-source-metadata [x]
  (walk/postwalk
   (fn [x]
     (if ((every-pred map? :source-metadata) x)
       (dissoc x :source-metadata)
       x))
   x))

(defn- nest-expressions [query]
  (mt/with-everything-store
    (driver/with-driver :h2
      (-> query
          qp/preprocess
          :query
          nest-query/nest-expressions
          remove-source-metadata))))

(deftest nest-expressions-test
  (is (partial= (mt/$ids venues
                  {:source-query {:source-table $$venues
                                  :expressions  {"double_price" [:* [:field %price {::add/source-table  $$venues
                                                                                    ::add/source-alias  "PRICE"
                                                                                    ::add/desired-alias "PRICE"
                                                                                    ::add/position      5}]
                                                                 2]}
                                  :fields       [[:field %id          {::add/source-table  $$venues
                                                                       ::add/source-alias  "ID"
                                                                       ::add/desired-alias "ID"
                                                                       ::add/position      0}]
                                                 [:field %name        {::add/source-table  $$venues
                                                                       ::add/source-alias  "NAME"
                                                                       ::add/desired-alias "NAME"
                                                                       ::add/position      1}]
                                                 [:field %category_id {::add/source-table  $$venues
                                                                       ::add/source-alias  "CATEGORY_ID"
                                                                       ::add/desired-alias "CATEGORY_ID"
                                                                       ::add/position      2}]
                                                 [:field %latitude    {::add/source-table  $$venues
                                                                       ::add/source-alias  "LATITUDE"
                                                                       ::add/desired-alias "LATITUDE"
                                                                       ::add/position      3}]
                                                 [:field %longitude   {::add/source-table  $$venues
                                                                       ::add/source-alias  "LONGITUDE"
                                                                       ::add/desired-alias "LONGITUDE"
                                                                       ::add/position      4}]
                                                 [:field %price       {::add/source-table  $$venues
                                                                       ::add/source-alias  "PRICE"
                                                                       ::add/desired-alias "PRICE"
                                                                       ::add/position      5}]
                                                 [:expression "double_price" {::add/desired-alias "double_price"
                                                                              ::add/position      6}]]}
                   :breakout     [[:field %price {::add/source-table  ::add/source
                                                  ::add/source-alias  "PRICE"
                                                  ::add/desired-alias "PRICE"
                                                  ::add/position      0}]]
                   :aggregation  [[:aggregation-options [:count] {:name               "count"
                                                                  ::add/desired-alias "count"
                                                                  ::add/position      1}]]
                   :fields       [[:field "double_price" {:base-type          :type/Float
                                                          ::add/source-table  ::add/source
                                                          ::add/source-alias  "double_price"
                                                          ::add/desired-alias "double_price"
                                                          ::add/position      2}]]
                   :order-by     [[:asc [:field %price {::add/source-table  ::add/source
                                                        ::add/source-alias  "PRICE"
                                                        ::add/desired-alias "PRICE"
                                                        ::add/position      0}]]]})
                (nest-expressions
                 (mt/mbql-query venues
                   {:expressions {"double_price" [:* $price 2]}
                    :breakout    [$price]
                    :aggregation [[:count]]
                    :fields      [[:expression "double_price"]]})))))

(deftest nest-expressions-with-existing-non-expression-fields-test
  (testing "Other `:fields` besides the `:expressions` should be preserved in the top level"
    (is (partial= (mt/$ids checkins
                    {:source-query {:source-table $$checkins
                                    :expressions  {"double_id" [:*
                                                                [:field %checkins.id {::add/source-table  $$checkins
                                                                                      ::add/source-alias  "ID"
                                                                                      ::add/desired-alias "ID"
                                                                                      ::add/position      0}]
                                                                2]}
                                    :fields       [[:field %id {::add/source-table  $$checkins
                                                                ::add/source-alias  "ID"
                                                                ::add/desired-alias "ID"
                                                                ::add/position      0}]
                                                   [:field %date {:temporal-unit      :default
                                                                  ::add/source-table  $$checkins
                                                                  ::add/source-alias  "DATE"
                                                                  ::add/desired-alias "DATE"
                                                                  ::add/position      1}]
                                                   [:field %user_id {::add/source-table  $$checkins
                                                                     ::add/source-alias  "USER_ID"
                                                                     ::add/desired-alias "USER_ID"
                                                                     ::add/position      2}]
                                                   [:field %venue_id {::add/source-table  $$checkins
                                                                      ::add/source-alias  "VENUE_ID"
                                                                      ::add/desired-alias "VENUE_ID"
                                                                      ::add/position      3}]
                                                   [:expression "double_id" {::add/desired-alias "double_id"
                                                                             ::add/position      4}]]}
                     :fields       [[:field "double_id" {:base-type          :type/Float
                                                         ::add/source-table  ::add/source
                                                         ::add/source-alias  "double_id"
                                                         ::add/desired-alias "double_id"
                                                         ::add/position      0}]
                                    [:field %date {:temporal-unit            :day
                                                   ::nest-query/outer-select true
                                                   ::add/source-table        ::add/source
                                                   ::add/source-alias        "DATE"
                                                   ::add/desired-alias       "DATE"
                                                   ::add/position            1}]
                                    [:field %date {:temporal-unit            :month
                                                   ::nest-query/outer-select true
                                                   ::add/source-table        ::add/source
                                                   ::add/source-alias        "DATE"
                                                   ::add/desired-alias       "DATE_2"
                                                   ::add/position            2}]]
                     :limit        1})
                  (nest-expressions
                   (mt/mbql-query checkins
                     {:expressions {"double_id" [:* $id 2]}
                      :fields      [[:expression "double_id"]
                                    !day.date
                                    !month.date]
                      :limit       1}))))))

(deftest multiple-expressions-test
  (testing "Make sure the nested version of the query doesn't mix up expressions if we have ones that reference others"
    (is (partial= (mt/$ids venues
                    {:source-query {:source-table $$venues
                                    :expressions  {"big_price"
                                                   [:+
                                                    [:field %price {::add/position      5
                                                                    ::add/source-table  $$venues
                                                                    ::add/source-alias  "PRICE"
                                                                    ::add/desired-alias "PRICE"}]
                                                    2]

                                                   "my_cool_new_field"
                                                   [:/
                                                    [:field %price {::add/position      5
                                                                    ::add/source-table  $$venues
                                                                    ::add/source-alias  "PRICE"
                                                                    ::add/desired-alias "PRICE"}]
                                                    [:expression "big_price" {::add/position      6
                                                                              ::add/desired-alias "big_price"}]]}
                                    :fields [[:field %id {::add/position      0
                                                          ::add/source-table  $$venues
                                                          ::add/source-alias  "ID"
                                                          ::add/desired-alias "ID"}]
                                             [:field %name {::add/position      1
                                                            ::add/source-table  $$venues
                                                            ::add/source-alias  "NAME"
                                                            ::add/desired-alias "NAME"}]
                                             [:field %category_id {::add/position      2
                                                                   ::add/source-table  $$venues
                                                                   ::add/source-alias  "CATEGORY_ID"
                                                                   ::add/desired-alias "CATEGORY_ID"}]
                                             [:field %latitude {::add/position      3
                                                                ::add/source-table  $$venues
                                                                ::add/source-alias  "LATITUDE"
                                                                ::add/desired-alias "LATITUDE"}]
                                             [:field %longitude {::add/position      4
                                                                 ::add/source-table  $$venues
                                                                 ::add/source-alias  "LONGITUDE"
                                                                 ::add/desired-alias "LONGITUDE"}]
                                             [:field %price {::add/position      5
                                                             ::add/source-table  $$venues
                                                             ::add/source-alias  "PRICE"
                                                             ::add/desired-alias "PRICE"}]
                                             [:expression "big_price" {::add/position      6
                                                                       ::add/desired-alias "big_price"}]
                                             [:expression "my_cool_new_field" {::add/position      7
                                                                               ::add/desired-alias "my_cool_new_field"}]]}
                     :fields   [[:field "my_cool_new_field" {:base-type          :type/Float
                                                             ::add/position      0
                                                             ::add/source-table  ::add/source
                                                             ::add/source-alias  "my_cool_new_field"
                                                             ::add/desired-alias "my_cool_new_field"}]]
                     :order-by [[:asc [:field %id {::add/source-table ::add/source
                                                   ::add/source-alias "ID"}]]]
                     :limit    3})
                  (nest-expressions
                   (mt/mbql-query venues
                     {:expressions {"big_price"         [:+ $price 2]
                                    "my_cool_new_field" [:/ $price [:expression "big_price"]]}
                      :fields      [[:expression "my_cool_new_field"]]
                      :order-by    [[:asc $id]]
                      :limit       3}))))))

(deftest nest-expressions-ignore-source-queries-test
  (testing (str "When 'raising' :expression clauses, only raise ones in the current level. Handle duplicate expression "
                "names correctly.")
    (let [query (mt/mbql-query venues
                  {:source-query {:source-table $$venues
                                  :expressions  {"x" [:* $price 2]}
                                  :fields       [$id [:expression "x"]]}
                   :expressions  {"x" [:* $price 4]}
                   :fields       [$id [:expression "x"]]
                   :limit        1})]
      (mt/with-native-query-testing-context query
        (is (partial= (mt/$ids venues
                        {:fields       [[:field %id {::add/source-table  ::add/source
                                                     ::add/source-alias  "ID"
                                                     ::add/desired-alias "ID"
                                                     ::add/position      0}]
                                        [:field "x_2" {:base-type          :type/Float
                                                       ::add/source-table  ::add/source
                                                       ::add/source-alias  "x_2"
                                                       ::add/desired-alias "x_2"
                                                       ::add/position      1}]]
                         :source-query {:expressions  {"x" [:*
                                                            [:field %price {::add/source-table ::add/source
                                                                            ::add/source-alias "PRICE"}]
                                                            4]}
                                        :fields       [[:field %id {::add/source-table  ::add/source
                                                                    ::add/source-alias  "ID"
                                                                    ::add/desired-alias "ID"
                                                                    ::add/position      0}]
                                                       [:field "x" {:base-type          :type/Float
                                                                    ::add/source-table  ::add/source
                                                                    ::add/source-alias  "x"
                                                                    ::add/desired-alias "x"
                                                                    ::add/position      1}]
                                                       [:expression "x" {::add/desired-alias "x_2"
                                                                         ::add/position      2}]]
                                        :source-query {:source-table $$venues
                                                       :expressions  {"x" [:*
                                                                           [:field %price {::add/source-table $$venues
                                                                                           ::add/source-alias "PRICE"}]
                                                                           2]}
                                                       :fields       [[:field %id {::add/source-table  $$venues
                                                                                   ::add/source-alias  "ID"
                                                                                   ::add/desired-alias "ID"
                                                                                   ::add/position      0}]
                                                                      [:expression "x" {::add/desired-alias "x"
                                                                                        ::add/position      1}]]}}
                         :limit        1})
                      (nest-expressions query)))))))

(deftest nest-expressions-with-joins-test
  (testing "If there are any `:joins`, those need to be nested into the `:source-query` as well."
    (is (partial= (mt/$ids venues
                    {:source-query {:source-table $$venues
                                    :joins        [{:strategy     :left-join
                                                    :condition    [:=
                                                                   [:field %category_id {::add/source-table  $$venues
                                                                                         ::add/source-alias  "CATEGORY_ID"
                                                                                         ::add/desired-alias "CATEGORY_ID"
                                                                                         ::add/position      2}]
                                                                   [:field %category_id {:join-alias         "CategoriesStats"
                                                                                         ::add/source-table  "CategoriesStats"
                                                                                         ::add/source-alias  "CATEGORY_ID"
                                                                                         ::add/desired-alias "CategoriesStats__CATEGORY_ID"
                                                                                         ::add/position      7}]]
                                                    :source-query {:source-table $$venues
                                                                   :aggregation  [[:aggregation-options
                                                                                   [:max [:field %price {::add/source-table $$venues
                                                                                                         ::add/source-alias "PRICE"}]]
                                                                                   {:name               "MaxPrice"
                                                                                    ::add/desired-alias "MaxPrice"
                                                                                    ::add/position      1}]
                                                                                  [:aggregation-options
                                                                                   [:avg
                                                                                    [:field
                                                                                     %price
                                                                                     {::add/source-table $$venues
                                                                                      ::add/source-alias "PRICE"}]]
                                                                                   {:name               "AvgPrice"
                                                                                    ::add/desired-alias "AvgPrice"
                                                                                    ::add/position      2}]
                                                                                  [:aggregation-options
                                                                                   [:min [:field %price {::add/source-table $$venues
                                                                                                         ::add/source-alias "PRICE"}]]
                                                                                   {:name               "MinPrice"
                                                                                    ::add/desired-alias "MinPrice"
                                                                                    ::add/position      3}]]
                                                                   :breakout     [[:field %category_id {::add/source-table  $$venues
                                                                                                        ::add/source-alias  "CATEGORY_ID"
                                                                                                        ::add/desired-alias "CATEGORY_ID"
                                                                                                        ::add/position      0}]]
                                                                   :order-by     [[:asc [:field %category_id {::add/source-table  $$venues
                                                                                                              ::add/source-alias  "CATEGORY_ID"
                                                                                                              ::add/desired-alias "CATEGORY_ID"
                                                                                                              ::add/position      0}]]]}
                                                    :alias        "CategoriesStats"
                                                    :fields       [[:field %category_id {:join-alias         "CategoriesStats"
                                                                                         ::add/source-table  "CategoriesStats"
                                                                                         ::add/source-alias  "CATEGORY_ID"
                                                                                         ::add/desired-alias "CategoriesStats__CATEGORY_ID"
                                                                                         ::add/position      7}]
                                                                   [:field "MaxPrice" {:base-type          :type/Integer
                                                                                       :join-alias         "CategoriesStats"
                                                                                       ::add/source-table  "CategoriesStats"
                                                                                       ::add/source-alias  "MaxPrice"
                                                                                       ::add/desired-alias "CategoriesStats__MaxPrice"
                                                                                       ::add/position      8}]
                                                                   [:field "AvgPrice" {:base-type          :type/Integer
                                                                                       :join-alias         "CategoriesStats"
                                                                                       ::add/source-table  "CategoriesStats"
                                                                                       ::add/source-alias  "AvgPrice"
                                                                                       ::add/desired-alias "CategoriesStats__AvgPrice"
                                                                                       ::add/position      9}]
                                                                   [:field "MinPrice" {:base-type          :type/Integer
                                                                                       :join-alias         "CategoriesStats"
                                                                                       ::add/source-table  "CategoriesStats"
                                                                                       ::add/source-alias  "MinPrice"
                                                                                       ::add/desired-alias "CategoriesStats__MinPrice"
                                                                                       ::add/position      10}]]}]
                                    :expressions  {"RelativePrice" [:/
                                                                    [:field %price {::add/source-table  $$venues
                                                                                    ::add/source-alias  "PRICE"
                                                                                    ::add/desired-alias "PRICE"
                                                                                    ::add/position      5}]
                                                                    [:field "AvgPrice" {:base-type          :type/Integer
                                                                                        :join-alias         "CategoriesStats"
                                                                                        ::add/source-table  "CategoriesStats"
                                                                                        ::add/source-alias  "AvgPrice"
                                                                                        ::add/desired-alias "CategoriesStats__AvgPrice"
                                                                                        ::add/position      9}]]}
                                    :fields       [[:field %id {::add/source-table  $$venues
                                                                ::add/source-alias  "ID"
                                                                ::add/desired-alias "ID"
                                                                ::add/position      0}]
                                                   [:field %name {::add/source-table  $$venues
                                                                  ::add/source-alias  "NAME"
                                                                  ::add/desired-alias "NAME"
                                                                  ::add/position      1}]
                                                   [:field %category_id {::add/source-table  $$venues
                                                                         ::add/source-alias  "CATEGORY_ID"
                                                                         ::add/desired-alias "CATEGORY_ID"
                                                                         ::add/position      2}]
                                                   [:field %latitude {::add/source-table  $$venues
                                                                      ::add/source-alias  "LATITUDE"
                                                                      ::add/desired-alias "LATITUDE"
                                                                      ::add/position      3}]
                                                   [:field %longitude {::add/source-table  $$venues
                                                                       ::add/source-alias  "LONGITUDE"
                                                                       ::add/desired-alias "LONGITUDE"
                                                                       ::add/position      4}]
                                                   [:field %price {::add/source-table  $$venues
                                                                   ::add/source-alias  "PRICE"
                                                                   ::add/desired-alias "PRICE"
                                                                   ::add/position      5}]
                                                   [:expression "RelativePrice" {::add/desired-alias "RelativePrice"
                                                                                 ::add/position      6}]
                                                   [:field %category_id {:join-alias         "CategoriesStats"
                                                                         ::add/source-table  "CategoriesStats"
                                                                         ::add/source-alias  "CATEGORY_ID"
                                                                         ::add/desired-alias "CategoriesStats__CATEGORY_ID"
                                                                         ::add/position      7}]
                                                   [:field "MaxPrice" {:base-type          :type/Integer
                                                                       :join-alias         "CategoriesStats"
                                                                       ::add/source-table  "CategoriesStats"
                                                                       ::add/source-alias  "MaxPrice"
                                                                       ::add/desired-alias "CategoriesStats__MaxPrice"
                                                                       ::add/position      8}]
                                                   [:field "AvgPrice" {:base-type          :type/Integer
                                                                       :join-alias         "CategoriesStats"
                                                                       ::add/source-table  "CategoriesStats"
                                                                       ::add/source-alias  "AvgPrice"
                                                                       ::add/desired-alias "CategoriesStats__AvgPrice"
                                                                       ::add/position      9}]
                                                   [:field "MinPrice" {:base-type          :type/Integer
                                                                       :join-alias         "CategoriesStats"
                                                                       ::add/source-table  "CategoriesStats"
                                                                       ::add/source-alias  "MinPrice"
                                                                       ::add/desired-alias "CategoriesStats__MinPrice"
                                                                       ::add/position      10}]]}
                     :fields       [[:field %id {::add/source-table  ::add/source
                                                 ::add/source-alias  "ID"
                                                 ::add/desired-alias "ID"
                                                 ::add/position      0}]
                                    [:field %name {::add/source-table  ::add/source
                                                   ::add/source-alias  "NAME"
                                                   ::add/desired-alias "NAME"
                                                   ::add/position      1}]
                                    [:field %category_id {::add/source-table  ::add/source
                                                          ::add/source-alias  "CATEGORY_ID"
                                                          ::add/desired-alias "CATEGORY_ID"
                                                          ::add/position      2}]
                                    [:field %latitude {::add/source-table  ::add/source
                                                       ::add/source-alias  "LATITUDE"
                                                       ::add/desired-alias "LATITUDE"
                                                       ::add/position      3}]
                                    [:field %longitude {::add/source-table  ::add/source
                                                        ::add/source-alias  "LONGITUDE"
                                                        ::add/desired-alias "LONGITUDE"
                                                        ::add/position      4}]
                                    [:field %price {::add/source-table  ::add/source
                                                    ::add/source-alias  "PRICE"
                                                    ::add/desired-alias "PRICE"
                                                    ::add/position      5}]
                                    [:field "RelativePrice" {:base-type          :type/Float
                                                             ::add/source-table  ::add/source
                                                             ::add/source-alias  "RelativePrice"
                                                             ::add/desired-alias "RelativePrice"
                                                             ::add/position      6}]
                                    [:field %category_id {:join-alias         "CategoriesStats"
                                                          ::add/source-alias  "CategoriesStats__CATEGORY_ID"
                                                          ::add/desired-alias "CategoriesStats__CATEGORY_ID"
                                                          ::add/source-table  ::add/source
                                                          ::add/position      7}]
                                    [:field "MaxPrice" {:base-type          :type/Integer
                                                        :join-alias         "CategoriesStats"
                                                        ::add/source-alias  "CategoriesStats__MaxPrice"
                                                        ::add/desired-alias "CategoriesStats__MaxPrice"
                                                        ::add/source-table  ::add/source
                                                        ::add/position      8}]
                                    [:field "AvgPrice" {:base-type          :type/Integer
                                                        :join-alias         "CategoriesStats"
                                                        ::add/source-alias  "CategoriesStats__AvgPrice"
                                                        ::add/desired-alias "CategoriesStats__AvgPrice"
                                                        ::add/source-table  ::add/source
                                                        ::add/position      9}]
                                    [:field "MinPrice" {:base-type          :type/Integer
                                                        :join-alias         "CategoriesStats"
                                                        ::add/source-alias  "CategoriesStats__MinPrice"
                                                        ::add/desired-alias "CategoriesStats__MinPrice"
                                                        ::add/source-table  ::add/source
                                                        ::add/position      10}]]
                     :limit        3})
                  (nest-expressions
                   (mt/mbql-query venues
                     {:fields      [$id
                                    $name
                                    $category_id
                                    $latitude
                                    $longitude
                                    $price
                                    [:expression "RelativePrice"]
                                    &CategoriesStats.category_id
                                    &CategoriesStats.*MaxPrice/Integer
                                    &CategoriesStats.*AvgPrice/Integer
                                    &CategoriesStats.*MinPrice/Integer]
                      :expressions {"RelativePrice" [:/ $price &CategoriesStats.*AvgPrice/Integer]}
                      :joins       [{:strategy     :left-join
                                     :condition    [:= $category_id &CategoriesStats.category_id]
                                     :source-query {:source-table $$venues
                                                    :aggregation  [[:aggregation-options [:max $price] {:name "MaxPrice"}]
                                                                   [:aggregation-options [:avg $price] {:name "AvgPrice"}]
                                                                   [:aggregation-options [:min $price] {:name "MinPrice"}]]
                                                    :breakout     [$category_id]}
                                     :alias        "CategoriesStats"
                                     :fields       :all}]
                      :limit       3}))))))

(deftest nest-expressions-eliminate-duplicate-coercion-test
  (testing "If coercion happens in the source query, don't do it a second time in the parent query (#12430)"
    (mt/with-temp-vals-in-db Field (mt/id :venues :price) {:coercion_strategy :Coercion/UNIXSeconds->DateTime
                                                           :effective_type    :type/DateTime}
      (is (partial= (mt/$ids venues
                      {:source-query {:source-table $$venues
                                      :expressions  {"test" [:* 1 1]}
                                      :fields       [[:field %id {::add/source-table  $$venues
                                                                  ::add/source-alias  "ID"
                                                                  ::add/desired-alias "ID"
                                                                  ::add/position      0}]
                                                     [:field %name {::add/source-table  $$venues
                                                                    ::add/source-alias  "NAME"
                                                                    ::add/desired-alias "NAME"
                                                                    ::add/position      1}]
                                                     [:field %category_id {::add/source-table  $$venues
                                                                           ::add/source-alias  "CATEGORY_ID"
                                                                           ::add/desired-alias "CATEGORY_ID"
                                                                           ::add/position      2}]
                                                     [:field %latitude {::add/source-table  $$venues
                                                                        ::add/source-alias  "LATITUDE"
                                                                        ::add/desired-alias "LATITUDE"
                                                                        ::add/position      3}]
                                                     [:field %longitude {::add/source-table  $$venues
                                                                         ::add/source-alias  "LONGITUDE"
                                                                         ::add/desired-alias "LONGITUDE"
                                                                         ::add/position      4}]
                                                     [:field %price {:temporal-unit      :default
                                                                     ::add/source-table  $$venues
                                                                     ::add/source-alias  "PRICE"
                                                                     ::add/desired-alias "PRICE"
                                                                     ::add/position      5}]
                                                     [:expression "test" {::add/desired-alias "test"
                                                                          ::add/position     6}]]}
                       :fields       [[:field %price {:temporal-unit            :default
                                                      ::nest-query/outer-select true
                                                      ::add/source-table        ::add/source
                                                      ::add/source-alias        "PRICE"
                                                      ::add/desired-alias       "PRICE"
                                                      ::add/position            0}]
                                      [:field "test" {:base-type          :type/Float
                                                      ::add/source-table  ::add/source
                                                      ::add/source-alias  "test"
                                                      ::add/desired-alias "test"
                                                      ::add/position      1}]]
                       :limit        1})
                    (nest-expressions
                     (mt/mbql-query venues
                       {:expressions {"test" ["*" 1 1]}
                        :fields      [$price
                                      [:expression "test"]]
                        :limit       1})))))))

(deftest multiple-joins-with-expressions-test
  (testing "We should be able to compile a complicated query with multiple joins and expressions correctly"
    (mt/dataset sample-dataset
      (is (partial= (mt/$ids orders
                      (merge {:source-query (let [id                [:field %id {::add/source-table  $$orders
                                                                                 ::add/source-alias  "ID"
                                                                                 ::add/desired-alias "ID"
                                                                                 ::add/position      0}]
                                                  user-id           [:field %user_id {::add/source-table  $$orders
                                                                                      ::add/source-alias  "USER_ID"
                                                                                      ::add/desired-alias "USER_ID"
                                                                                      ::add/position      1}]
                                                  product-id        [:field %product_id {::add/source-table  $$orders
                                                                                         ::add/source-alias  "PRODUCT_ID"
                                                                                         ::add/desired-alias "PRODUCT_ID"
                                                                                         ::add/position      2}]
                                                  subtotal          [:field %subtotal {::add/source-table  $$orders
                                                                                       ::add/source-alias  "SUBTOTAL"
                                                                                       ::add/desired-alias "SUBTOTAL"
                                                                                       ::add/position      3}]
                                                  tax               [:field %tax {::add/source-table  $$orders
                                                                                  ::add/source-alias  "TAX"
                                                                                  ::add/desired-alias "TAX"
                                                                                  ::add/position      4}]
                                                  total             [:field %total {::add/source-table  $$orders
                                                                                    ::add/source-alias  "TOTAL"
                                                                                    ::add/desired-alias "TOTAL"
                                                                                    ::add/position      5}]
                                                  discount          [:field %discount {::add/source-table  $$orders
                                                                                       ::add/source-alias  "DISCOUNT"
                                                                                       ::add/desired-alias "DISCOUNT"
                                                                                       ::add/position      6}]
                                                  created-at        [:field %created_at {:temporal-unit      :default
                                                                                         ::add/source-table  $$orders
                                                                                         ::add/source-alias  "CREATED_AT"
                                                                                         ::add/desired-alias "CREATED_AT"
                                                                                         ::add/position      7}]
                                                  quantity          [:field %quantity {::add/source-table  $$orders
                                                                                       ::add/source-alias  "QUANTITY"
                                                                                       ::add/desired-alias "QUANTITY"
                                                                                       ::add/position      8}]
                                                  pivot-grouping    [:expression "pivot-grouping" {::add/desired-alias "pivot-grouping"
                                                                                                   ::add/position      9}]
                                                  products-category [:field %products.category {:join-alias         "PRODUCTS__via__PRODUCT_ID"
                                                                                                ::add/source-table  "PRODUCTS__via__PRODUCT_ID"
                                                                                                ::add/source-alias  "CATEGORY"
                                                                                                ::add/desired-alias "PRODUCTS__via__PRODUCT_ID__CATEGORY"
                                                                                                ::add/position      10}]
                                                  products-id       [:field %products.id {:join-alias         "PRODUCTS__via__PRODUCT_ID"
                                                                                          ::add/source-table  "PRODUCTS__via__PRODUCT_ID"
                                                                                          ::add/source-alias  "ID"
                                                                                          ::add/desired-alias "PRODUCTS__via__PRODUCT_ID__ID"
                                                                                          ::add/position      11}]]
                                              {:source-table $$orders
                                               :joins        [{:source-table $$products
                                                               :alias        "PRODUCTS__via__PRODUCT_ID"
                                                               :condition    [:= product-id products-id]
                                                               :strategy     :left-join
                                                               :fk-field-id  %product_id}]
                                               :expressions  {"pivot-grouping" [:abs 0]}
                                               :fields       [id
                                                              user-id
                                                              product-id
                                                              subtotal
                                                              tax
                                                              total
                                                              discount
                                                              created-at
                                                              quantity
                                                              pivot-grouping
                                                              products-category
                                                              products-id]})}
                        (let [products-category [:field %products.category {:join-alias         "PRODUCTS__via__PRODUCT_ID"
                                                                            ::add/source-table  ::add/source
                                                                            ::add/source-alias  "PRODUCTS__via__PRODUCT_ID__CATEGORY"
                                                                            ::add/desired-alias "PRODUCTS__via__PRODUCT_ID__CATEGORY"
                                                                            ::add/position      0}]
                              created-at        [:field %created_at {:temporal-unit            :year
                                                                     ::nest-query/outer-select true
                                                                     ::add/source-table        ::add/source
                                                                     ::add/source-alias        "CREATED_AT"
                                                                     ::add/desired-alias       "CREATED_AT"
                                                                     ::add/position            1}]
                              pivot-grouping    [:field "pivot-grouping" {:base-type          :type/Float
                                                                          ::add/source-table  ::add/source
                                                                          ::add/source-alias  "pivot-grouping"
                                                                          ::add/desired-alias "pivot-grouping"
                                                                          ::add/position      2}]]
                          {:breakout    [products-category created-at pivot-grouping]
                           :aggregation [[:aggregation-options [:count] {:name               "count"
                                                                         ::add/desired-alias "count"
                                                                         ::add/position      3}]]
                           :order-by    [[:asc products-category]
                                         [:asc created-at]
                                         [:asc pivot-grouping]]})))
                    (nest-expressions
                     (mt/mbql-query orders
                       {:aggregation [[:aggregation-options [:count] {:name "count"}]]
                        :breakout    [&PRODUCTS__via__PRODUCT_ID.products.category
                                      !year.created_at
                                      [:expression "pivot-grouping"]]
                        :expressions {"pivot-grouping" [:abs 0]}
                        :order-by    [[:asc &PRODUCTS__via__PRODUCT_ID.products.category]
                                      [:asc !year.created_at]
                                      [:asc [:expression "pivot-grouping"]]]
                        :joins       [{:source-table $$products
                                       :strategy     :left-join
                                       :alias        "PRODUCTS__via__PRODUCT_ID"
                                       :fk-field-id  %product_id
                                       :condition    [:= $product_id &PRODUCTS__via__PRODUCT_ID.products.id]}]})))))))

(deftest uniquify-aliases-test
  (driver/with-driver :h2
    (mt/dataset sample-dataset
      (mt/with-everything-store
        (is (partial= (mt/$ids products
                        {:source-query       {:source-table $$products
                                              :expressions  {"CATEGORY" [:concat
                                                                         [:field %category {::add/source-table  $$products
                                                                                            ::add/source-alias  "CATEGORY"
                                                                                            ::add/desired-alias "CATEGORY"
                                                                                            ::add/position      3}]
                                                                         "2"]}
                                              :fields       [[:field %id {::add/source-table  $$products
                                                                          ::add/source-alias  "ID"
                                                                          ::add/desired-alias "ID"
                                                                          ::add/position      0}]
                                                             [:field %ean {::add/source-table  $$products
                                                                           ::add/source-alias  "EAN"
                                                                           ::add/desired-alias "EAN"
                                                                           ::add/position      1}]
                                                             [:field %title {::add/source-table  $$products
                                                                             ::add/source-alias  "TITLE"
                                                                             ::add/desired-alias "TITLE"
                                                                             ::add/position      2}]
                                                             [:field %category {::add/source-table  $$products
                                                                                ::add/source-alias  "CATEGORY"
                                                                                ::add/desired-alias "CATEGORY"
                                                                                ::add/position      3}]
                                                             [:field %vendor {::add/source-table  $$products
                                                                              ::add/source-alias  "VENDOR"
                                                                              ::add/desired-alias "VENDOR"
                                                                              ::add/position      4}]
                                                             [:field %price {::add/source-table  $$products
                                                                             ::add/source-alias  "PRICE"
                                                                             ::add/desired-alias "PRICE"
                                                                             ::add/position      5}]
                                                             [:field %rating {::add/source-table  $$products
                                                                              ::add/source-alias  "RATING"
                                                                              ::add/desired-alias "RATING"
                                                                              ::add/position      6}]
                                                             [:field %created_at {:temporal-unit      :default
                                                                                  ::add/source-table  $$products
                                                                                  ::add/source-alias  "CREATED_AT"
                                                                                  ::add/desired-alias "CREATED_AT"
                                                                                  ::add/position      7}]
                                                             [:expression "CATEGORY" {::add/desired-alias "CATEGORY_2"
                                                                                      ::add/position      8}]]}
                         :breakout           [[:field "CATEGORY_2" {:base-type          :type/Text
                                                                    ::add/source-table  ::add/source
                                                                    ::add/source-alias  "CATEGORY_2"
                                                                    ::add/desired-alias "CATEGORY_2"
                                                                    ::add/position      0}]]
                         :aggregation        [[:aggregation-options [:count] {:name               "count"
                                                                              ::add/desired-alias "count"
                                                                              ::add/position      1}]]
                         :order-by           [[:asc [:field "CATEGORY_2" {:base-type          :type/Text
                                                                          ::add/source-table  ::add/source
                                                                          ::add/source-alias  "CATEGORY_2"
                                                                          ::add/desired-alias "CATEGORY_2"
                                                                          ::add/position      0}]]]
                         :limit              1})
                      (-> (mt/mbql-query products
                            {:expressions {"CATEGORY" [:concat $category "2"]}
                             :breakout    [:expression"CATEGORY"]
                             :aggregation [[:count]]
                             :order-by    [[:asc [:expression"CATEGORY"]]]
                             :limit       1})
                          qp/preprocess
                          add/add-alias-info
                          :query
                          nest-query/nest-expressions)))))))
