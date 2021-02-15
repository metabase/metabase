(ns metabase.driver.sql.query-processor-test
  (:require [clojure.string :as str]
            [clojure.test :refer :all]
            [honeysql.core :as hsql]
            [metabase.driver :as driver]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.models.setting :as setting]
            [metabase.query-processor :as qp]
            [metabase.test :as mt]
            [metabase.util.honeysql-extensions :as hx]
            [pretty.core :refer [PrettyPrintable]])
  (:import metabase.util.honeysql_extensions.Identifier))

(deftest process-mbql-query-keys-test
  (testing "make sure our logic for deciding which order to process keys in the query works as expected"
    (is (= [:source-table :breakout :aggregation :fields :abc :def]
           (#'sql.qp/query->keys-in-application-order
            {:def          6
             :abc          5
             :source-table 1
             :aggregation  3
             :fields       4
             :breakout     2})))))

;; Let's make sure we're actually attempting to generate the correctl HoneySQL for stuff so we don't sit around
;; scratching our heads wondering why the queries themselves aren't working

;; We'll slap together a driver called `::id-swap` whose only purpose is to replace instances of `Identifier` with
;; `CustomIdentifier` when `->honeysql` is called. This way we can be sure it's being called everywhere it's used so
;; drivers have the chance to do custom things as needed. Also `::id-swap` will record the current `*table-alias*` at
;; the time `->honeysql` is called so we can make sure that's correct
(driver/register! ::id-swap, :parent :sql, :abstract? true)

(defrecord ^:private CustomIdentifier [identifier table-alias]
  PrettyPrintable
  (pretty [_]
    (let [identifier (cons 'id (cons (:identifier-type identifier) (:components identifier)))]
      (if table-alias
        (list 'bound-alias table-alias identifier)
        identifier))))

(defn- id [& args]
  (CustomIdentifier. (apply hx/identifier args) nil))

(defn- bound-alias [table-alias identifier]
  (assoc identifier :table-alias table-alias))

(defmethod sql.qp/->honeysql [::id-swap Identifier]
  [driver identifier]
  ((get-method sql.qp/->honeysql [:sql Identifier]) driver (CustomIdentifier. identifier sql.qp/*table-alias*)))

(deftest generate-honeysql-for-join-test
  (testing "Test that the correct HoneySQL gets generated for a query with a join, and that the correct identifiers are used"
    (mt/with-everything-store
      (is (= {:select    [[(id :field "PUBLIC" "VENUES" "ID")          (id :field-alias "ID")]
                          [(id :field "PUBLIC" "VENUES" "NAME")        (id :field-alias "NAME")]
                          [(id :field "PUBLIC" "VENUES" "CATEGORY_ID") (id :field-alias "CATEGORY_ID")]
                          [(id :field "PUBLIC" "VENUES" "LATITUDE")    (id :field-alias "LATITUDE")]
                          [(id :field "PUBLIC" "VENUES" "LONGITUDE")   (id :field-alias "LONGITUDE")]
                          [(id :field "PUBLIC" "VENUES" "PRICE")       (id :field-alias "PRICE")]]
              :from      [(id :table "PUBLIC" "VENUES")]
              :where     [:=
                          (bound-alias "c" (id :field "c" "NAME"))
                          "BBQ"]
              :left-join [[(id :table "PUBLIC" "CATEGORIES") (id :table-alias "c")]
                          [:=
                           (id :field "PUBLIC" "VENUES" "CATEGORY_ID")
                           (bound-alias "c" (id :field "c" "ID"))]]
              :order-by  [[(id :field "PUBLIC" "VENUES" "ID") :asc]]
              :limit     100}
             (#'sql.qp/mbql->honeysql
              ::id-swap
              (mt/mbql-query venues
                {:source-table $$venues
                 :order-by     [[:asc $id]]
                 :filter       [:=
                                [:joined-field "c" $categories.name]
                                [:value "BBQ" {:base_type :type/Text, :semantic_type :type/Name, :database_type "VARCHAR"}]]
                 :fields       [$id $name $category_id $latitude $longitude $price]
                 :limit        100
                 :joins        [{:source-table $$categories
                                 :alias        "c",
                                 :strategy     :left-join
                                 :condition    [:=
                                                $category_id
                                                [:joined-field "c" $categories.id]]
                                 :fk-field-id  (mt/id :venues :category_id)
                                 :fields       :none}]})))))))

(deftest correct-identifiers-test
  (testing "This HAIRY query tests that the correct identifiers and aliases are used with both a nested query and JOIN in play."
    ;; TODO `*table-alias*` stays bound to `:source` in a few places below where it probably shouldn't (for the
    ;; top-level SELECT `:field-alias` identifiers and the `v` `:table-alias` identifier) but since drivers shouldn't
    ;; be qualifying aliases with aliases things still work the right way.
    (mt/with-everything-store
      (driver/with-driver :h2
        (is (= {:select    [[(bound-alias "v" (id :field "v" "NAME")) (bound-alias "source" (id :field-alias "v__NAME"))]
                            [:%count.*                                (bound-alias "source" (id :field-alias "count"))]]
                :from      [[{:select [[(id :field "PUBLIC" "CHECKINS" "ID")       (id :field-alias "ID")]
                                       [(id :field "PUBLIC" "CHECKINS" "DATE")     (id :field-alias "DATE")]
                                       [(id :field "PUBLIC" "CHECKINS" "USER_ID")  (id :field-alias "USER_ID")]
                                       [(id :field "PUBLIC" "CHECKINS" "VENUE_ID") (id :field-alias "VENUE_ID")]]
                              :from   [(id :table "PUBLIC" "CHECKINS")]
                              :where  [:>
                                       (id :field "PUBLIC" "CHECKINS" "DATE")
                                       #t "2015-01-01T00:00:00.000-00:00"]}
                             (id :table-alias "source")]]
                :left-join [[(id :table "PUBLIC" "VENUES") (bound-alias "source" (id :table-alias "v"))]
                            [:=
                             (bound-alias "source" (id :field "source" "VENUE_ID"))
                             (bound-alias "v" (id :field "v" "ID"))]],

                :group-by  [(bound-alias "v" (id :field "v" "NAME"))]
                :where     [:and
                            [:like (bound-alias "v" (id :field "v" "NAME")) "F%"]
                            [:> (bound-alias "source" (id :field "source" "user_id")) 0]],
                :order-by  [[(bound-alias "v" (id :field "v" "NAME")) :asc]]}
               (#'sql.qp/mbql->honeysql
                ::id-swap
                (mt/mbql-query checkins
                                 {:source-query {:source-table $$checkins
                                                 :fields       [$id [:datetime-field $date :default] $user_id $venue_id]
                                                 :filter       [:>
                                                                $date
                                                                [:absolute-datetime #t "2015-01-01T00:00:00.000000000-00:00" :default]],},
                                  :aggregation  [[:count]]
                                  :order-by     [[:asc [:joined-field "v" $venues.name]]]
                                  :breakout     [[:joined-field "v" $venues.name]],
                                  :filter       [:and
                                                 [:starts-with
                                                  [:joined-field "v" $venues.name]
                                                  [:value "F" {:base_type :type/Text, :semantic_type :type/Name, :database_type "VARCHAR"}]]
                                                 [:> [:field-literal "user_id" :type/Integer] 0]]
                                  :joins        [{:source-table $$venues
                                                  :alias        "v"
                                                  :strategy     :left-join
                                                  :condition    [:=
                                                                 $venue_id
                                                                 [:joined-field "v" $venues.id]]
                                                  :fk-field-id  (mt/id :checkins :venue_id)
                                                  :fields       :none}]}))))))))

(deftest handle-named-aggregations-test
  (testing "Check that named aggregations are handled correctly"
    (mt/with-everything-store
      (driver/with-driver :h2
        (is (= {:select   [[(id :field "PUBLIC" "VENUES" "PRICE")                        (id :field-alias "PRICE")]
                           [(hsql/call :avg (id :field "PUBLIC" "VENUES" "CATEGORY_ID")) (id :field-alias "avg_2")]]
                :from     [(id :table "PUBLIC" "VENUES")]
                :group-by [(id :field "PUBLIC" "VENUES" "PRICE")]
                :order-by [[(id :field-alias "avg_2") :asc]]}
               (#'sql.qp/mbql->honeysql
                ::id-swap
                (mt/mbql-query venues
                  {:aggregation [[:aggregation-options [:avg $category_id] {:name "avg_2"}]]
                   :breakout    [$price]
                   :order-by    [[:asc [:aggregation 0]]]}))))))))

(deftest handle-source-query-params-test
  (testing "params from source queries should get passed in to the top-level. Semicolons should be removed"
    (mt/with-everything-store
      (driver/with-driver :h2
        (is (= {:query  "SELECT \"source\".* FROM (SELECT * FROM some_table WHERE name = ?) \"source\" WHERE (\"source\".\"name\" <> ? OR \"source\".\"name\" IS NULL)"
                :params ["Cam" "Lucky Pigeon"]}
               (sql.qp/mbql->native :h2
                 (mt/mbql-query venues
                   {:source-query {:native "SELECT * FROM some_table WHERE name = ?;", :params ["Cam"]}
                    :filter       [:!= *name/Integer "Lucky Pigeon"]}))))))))

(deftest joins-against-native-queries-test
  (testing "Joins against native SQL queries should get converted appropriately! make sure correct HoneySQL is generated"
    (mt/with-everything-store
      (driver/with-driver :h2
        (is (= [[(sql.qp/->SQLSourceQuery "SELECT * FROM VENUES;" [])
                 (hx/identifier :table-alias "card")]
                [:=
                 (hx/identifier :field "PUBLIC" "CHECKINS" "VENUE_ID")
                 (hx/identifier :field "id")]]
               (sql.qp/join->honeysql :h2
                 (mt/$ids checkins
                   {:source-query {:native "SELECT * FROM VENUES;", :params []}
                    :alias        "card"
                    :strategy     :left-join
                    :condition    [:= $venue_id &card.*id/Integer]}))))))))

(deftest compile-honeysql-test
  (testing "make sure the generated HoneySQL will compile to the correct SQL"
    (is (= ["INNER JOIN (SELECT * FROM VENUES) card ON PUBLIC.CHECKINS.VENUE_ID = id"]
           (hsql/format {:join (mt/with-everything-store
                                 (driver/with-driver :h2
                                   (sql.qp/join->honeysql :h2
                                     (mt/$ids checkins
                                       {:source-query {:native "SELECT * FROM VENUES;", :params []}
                                        :alias        "card"
                                        :strategy     :left-join
                                        :condition    [:= $venue_id &card.*id/Integer]}))))})))))

(deftest adjust-start-of-week-test
  (driver/with-driver :h2
    (with-redefs [driver/db-start-of-week (constantly :monday)
                  setting/get-keyword     (constantly :sunday)]
      (is (= (hsql/call :dateadd (hx/literal "day")
                        (hsql/call :cast -1 #sql/raw "long")
                        (hsql/call :week (hsql/call :dateadd (hx/literal "day")
                                                    (hsql/call :cast 1 #sql/raw "long")
                                                    :created_at)))
             (sql.qp/adjust-start-of-week :h2 (partial hsql/call :week) :created_at))))
    (testing "Do we skip the adjustment if offset = 0"
      (with-redefs [driver/db-start-of-week (constantly :monday)
                    setting/get-keyword     (constantly :monday)]
        (is (= (hsql/call :week :created_at)
               (sql.qp/adjust-start-of-week :h2 (partial hsql/call :week) :created_at)))))))

(defn- query-on-dataset-with-nils
  [query]
  (mt/rows
    (qp/process-query {:database (mt/id)
                       :type     :query
                       :query    (merge
                                  {:source-query {:native "select 'foo' as a union select null as a union select 'bar' as a"}
                                   :order-by     [[:asc [:field-literal "A" :type/Text]]]}
                                  query)})))

(deftest correct-for-null-behaviour
  (testing "NULLs should be treated intuitively in filters (SQL has somewhat unintuitive semantics where NULLs get propagated out of expressions)."
    (is (= [[nil] ["bar"]]
           (query-on-dataset-with-nils {:filter [:not [:starts-with [:field-literal "A" :type/Text] "f"]]})))
    (is (= [[nil] ["bar"]]
           (query-on-dataset-with-nils {:filter [:not [:ends-with [:field-literal "A" :type/Text] "o"]]})))
    (is (= [[nil] ["bar"]]
           (query-on-dataset-with-nils {:filter [:not [:contains [:field-literal "A" :type/Text] "f"]]})))
    (is (= [[nil] ["bar"]]
           (query-on-dataset-with-nils {:filter [:!= [:field-literal "A" :type/Text] "foo"]}))))
  (testing "Null behaviour correction fix should work with joined fields (#13534)"
    (is (= [[1000]]
           (mt/rows
             (mt/run-mbql-query checkins
               {:filter      [:!= &u.users.name "foo"]
                :aggregation [:count]
                :joins       [{:source-table $$users
                               :alias        "u"
                               :condition    [:= $user_id &u.users.id]}]}))))))

(defn- pretty-sql [s]
  (-> s
      (str/replace #"\"([\w\d_]+)\"" "$1")
      (str/replace #"PUBLIC\." "")))

(defn- mbql->native [query]
  (mt/with-everything-store
    (driver/with-driver :h2
      (-> (sql.qp/mbql->native :h2 query)
          :query
          pretty-sql))))

(deftest joined-field-clauses-test
  (testing "Should correctly compile `:joined-field` clauses"
    (testing "when the join is at the same level"
      (is (= "SELECT c.NAME AS c__NAME FROM VENUES LEFT JOIN CATEGORIES c ON VENUES.CATEGORY_ID = c.ID"
             (mbql->native
              (mt/mbql-query venues
                {:fields [[:joined-field "c" $categories.name]]
                 :joins  [{:fields       [[:joined-field "c" $categories.name]]
                           :source-table $$categories
                           :strategy     :left-join
                           :condition    [:= $category_id [:joined-field "c" $categories.id]]
                           :alias        "c"}]})))))
    (testing "when the join is NOT at the same level"
      (is (= (str "SELECT source.c__NAME AS c__NAME "
                  "FROM ("
                  "SELECT c.NAME AS c__NAME "
                  "FROM VENUES"
                  " LEFT JOIN CATEGORIES c"
                  " ON VENUES.CATEGORY_ID = c.ID"
                  ") source")
             (mbql->native
              (mt/mbql-query venues
                {:fields       [[:joined-field "c" $categories.name]]
                 :source-query {:source-table $$venues
                                :fields       [[:joined-field "c" $categories.name]]
                                :joins        [{:fields       [[:joined-field "c" $categories.name]]
                                                :source-table $$categories
                                                :strategy     :left-join
                                                :condition    [:= $category_id [:joined-field "c" $categories.id]]
                                                :alias        "c"}]}})))))))

(deftest ambiguous-field-metadata-test
  (testing "With queries that refer to the same field more than once, can we generate sane SQL?"
    (mt/dataset sample-dataset
      (is (= (str "SELECT"
                  " ORDERS.ID AS ID,"
                  " ORDERS.PRODUCT_ID AS PRODUCT_ID,"
                  " PRODUCTS__via__PRODUCT_ID.TITLE AS PRODUCTS__via__PRODUCT_ID__TITLE,"
                  " Products.ID AS Products__ID,"
                  " Products.TITLE AS Products__TITLE "
                  "FROM ORDERS "
                  "LEFT JOIN PRODUCTS Products"
                  " ON ORDERS.PRODUCT_ID = Products.ID"
                  " LEFT JOIN PRODUCTS PRODUCTS__via__PRODUCT_ID"
                  " ON ORDERS.PRODUCT_ID = PRODUCTS__via__PRODUCT_ID.ID "
                  "ORDER BY ORDERS.ID ASC "
                  "LIMIT 2")
             (mbql->native
              (mt/mbql-query orders
                {:joins    [{:strategy     :left-join
                             :source-table $$products
                             :condition    [:= $product_id &Products.products.id]
                             :alias        "Products"}
                            {:strategy     :left-join
                             :source-table $$products
                             :alias        "PRODUCTS__via__PRODUCT_ID"
                             :fk-field-id  %product_id
                             :condition    [:= $product_id &PRODUCTS__via__PRODUCT_ID.products.id]}]
                 :order-by [[:asc $id]]
                 :limit    2
                 :fields   [$id
                            $product_id
                            &PRODUCTS__via__PRODUCT_ID.products.title
                            &Products.products.id
                            &Products.products.title]})))))))

(deftest multiple-joins-with-expressions-test
  (testing "We should be able to compile a complicated query with multiple joins and expressions correctly"
    (mt/dataset sample-dataset
      (is (= (str "SELECT source.PRODUCTS__via__PRODUCT_ID__CATEGORY AS PRODUCTS__via__PRODUCT_ID__CATEGORY,"
                  " source.PEOPLE__via__USER_ID__SOURCE AS PEOPLE__via__USER_ID__SOURCE,"
                  " parsedatetime(year(source.CREATED_AT), 'yyyy') AS CREATED_AT,"
                  " source.\"pivot-grouping\" AS \"pivot-grouping\", count(*) AS count "
                  "FROM ("
                  "SELECT PRODUCTS__via__PRODUCT_ID.CATEGORY AS PRODUCTS__via__PRODUCT_ID__CATEGORY,"
                  " PEOPLE__via__USER_ID.SOURCE AS PEOPLE__via__USER_ID__SOURCE,"
                  " ORDERS.CREATED_AT AS CREATED_AT, abs(0) AS \"pivot-grouping\","
                  " ORDERS.PRODUCT_ID AS PRODUCT_ID,"
                  " PRODUCTS__via__PRODUCT_ID.ID AS PRODUCTS__via__PRODUCT_ID__ID,"
                  " ORDERS.USER_ID AS USER_ID, PEOPLE__via__USER_ID.ID AS PEOPLE__via__USER_ID__ID "
                  "FROM ORDERS"
                  " LEFT JOIN PRODUCTS PRODUCTS__via__PRODUCT_ID"
                  " ON ORDERS.PRODUCT_ID = PRODUCTS__via__PRODUCT_ID.ID "
                  "LEFT JOIN PEOPLE PEOPLE__via__USER_ID"
                  " ON ORDERS.USER_ID = PEOPLE__via__USER_ID.ID"
                  ") source "
                  "WHERE ((source.PEOPLE__via__USER_ID__SOURCE = ? OR source.PEOPLE__via__USER_ID__SOURCE = ?)"
                  " AND (source.PRODUCTS__via__PRODUCT_ID__CATEGORY = ?"
                  " OR source.PRODUCTS__via__PRODUCT_ID__CATEGORY = ?)"
                  " AND parsedatetime(year(source.CREATED_AT), 'yyyy')"
                  " BETWEEN parsedatetime(year(dateadd('year', CAST(-2 AS long), now())), 'yyyy')"
                  " AND parsedatetime(year(dateadd('year', CAST(-1 AS long), now())), 'yyyy')) "
                  "GROUP BY source.PRODUCTS__via__PRODUCT_ID__CATEGORY,"
                  " source.PEOPLE__via__USER_ID__SOURCE,"
                  " parsedatetime(year(source.CREATED_AT), 'yyyy'),"
                  " source.\"pivot-grouping\" "
                  "ORDER BY source.PRODUCTS__via__PRODUCT_ID__CATEGORY ASC,"
                  " source.PEOPLE__via__USER_ID__SOURCE ASC,"
                  " parsedatetime(year(source.CREATED_AT), 'yyyy') ASC,"
                  " source.\"pivot-grouping\" ASC")
             (mbql->native
              (mt/mbql-query orders
                {:aggregation [[:aggregation-options [:count] {:name "count"}]]
                 :breakout    [&PRODUCTS__via__PRODUCT_ID.products.category
                               &PEOPLE__via__USER_ID.people.source
                               !year.created_at
                               [:expression "pivot-grouping"]]
                 :filter      [:and
                               [:or
                                [:=
                                 &PEOPLE__via__USER_ID.people.source
                                 [:value "Facebook" {:base_type :type/Text, :semantic_type nil, :database_type "VARCHAR", :name "SOURCE"}]]
                                [:=
                                 &PEOPLE__via__USER_ID.people.source
                                 [:value "Google" {:base_type :type/Text, :semantic_type nil, :database_type "VARCHAR", :name "SOURCE"}]]]
                               [:or
                                [:=
                                 &PRODUCTS__via__PRODUCT_ID.products.category
                                 [:value "Doohickey" {:base_type :type/Text, :semantic_type nil, :database_type "VARCHAR", :name "CATEGORY"}]]
                                [:=
                                 &PRODUCTS__via__PRODUCT_ID.products.category
                                 [:value "Gizmo" {:base_type :type/Text, :semantic_type nil, :database_type "VARCHAR", :name "CATEGORY"}]]]
                               [:between !year.created_at [:relative-datetime -2 :year] [:relative-datetime -1 :year]]]
                 :expressions {:pivot-grouping [:abs 0]}
                 :order-by    [[:asc &PRODUCTS__via__PRODUCT_ID.products.category]
                               [:asc &PEOPLE__via__USER_ID.people.source]
                               [:asc !year.created_at]
                               [:asc [:expression "pivot-grouping"]]]
                 :joins       [{:source-table $$products
                                :strategy     :left-join
                                :alias        "PRODUCTS__via__PRODUCT_ID"
                                :fk-field-id  %product_id
                                :condition    [:= $product_id &PRODUCTS__via__PRODUCT_ID.products.id]}
                               {:source-table $$people
                                :strategy     :left-join
                                :alias        "PEOPLE__via__USER_ID",
                                :fk-field-id  %user_id
                                :condition    [:= $user_id &PEOPLE__via__USER_ID.people.id]}]})))))))

(deftest referernce-aggregation-expressions-in-joins-test
  (testing "See if we can correctly compile a query that references expressions that come from a join"
    (is (= (str "SELECT source.ID AS ID,"
                " source.NAME AS NAME,"
                " source.CATEGORY_ID AS CATEGORY_ID,"
                " source.LATITUDE AS LATITUDE, source.LONGITUDE AS LONGITUDE, source.PRICE AS PRICE,"
                " source.RelativePrice AS RelativePrice,"
                " source.CategoriesStats__CATEGORY_ID AS CategoriesStats__CATEGORY_ID,"
                " source.MaxPrice AS MaxPrice,"
                " source.AvgPrice AS AvgPrice,"
                " source.MinPrice AS MinPrice "
                "FROM ("
                "SELECT VENUES.ID AS ID, VENUES.NAME AS NAME, VENUES.CATEGORY_ID AS CATEGORY_ID,"
                " VENUES.LATITUDE AS LATITUDE, VENUES.LONGITUDE AS LONGITUDE, VENUES.PRICE AS PRICE,"
                " (CAST(VENUES.PRICE AS float) / CASE WHEN CategoriesStats.AvgPrice = 0 THEN NULL ELSE CategoriesStats.AvgPrice END) AS RelativePrice,"
                " CategoriesStats.CATEGORY_ID AS CategoriesStats__CATEGORY_ID,"
                " CategoriesStats.MaxPrice AS MaxPrice,"
                " CategoriesStats.AvgPrice AS AvgPrice,"
                " CategoriesStats.MinPrice AS MinPrice "
                "FROM VENUES "
                "LEFT JOIN ("
                "SELECT VENUES.CATEGORY_ID AS CATEGORY_ID, max(VENUES.PRICE) AS MaxPrice, avg(VENUES.PRICE) AS AvgPrice,"
                " min(VENUES.PRICE) AS MinPrice "
                "FROM VENUES "
                "GROUP BY VENUES.CATEGORY_ID"
                ") CategoriesStats"
                " ON VENUES.CATEGORY_ID = CategoriesStats.CATEGORY_ID"
                ") source "
                "LIMIT 3")
           (mbql->native
            (mt/mbql-query venues
              {:fields      [$id
                             $name
                             $category_ID
                             $latitude
                             $longitude
                             $price
                             [:expression "RelativePrice"]
                             &CategoriesStats.category_id
                             &CategoriesStats.*MaxPrice/Integer
                             &CategoriesStats.*AvgPrice/Integer
                             &CategoriesStats.*MinPrice/Integer]
               :expressions {:RelativePrice [:/ $price &CategoriesStats.*AvgPrice/Integer]},
               :joins       [{:strategy     :left-join
                              :condition    [:= $category_id &CategoriesStats.venues.category_id]
                              :source-query {:source-table $$venues
                                             :aggregation  [[:aggregation-options [:max $price] {:name "MaxPrice"}]
                                                            [:aggregation-options [:avg $price] {:name "AvgPrice"}]
                                                            [:aggregation-options [:min $price] {:name "MinPrice"}]],
                                             :breakout     [$category_id]}
                              :alias        "CategoriesStats"
                              :fields       :all}]
               :limit       3}))))))
