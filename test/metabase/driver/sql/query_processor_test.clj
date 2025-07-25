(ns ^:mb/driver-tests metabase.driver.sql.query-processor-test
  (:require
   [buddy.core.codecs :as codecs]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.query-processor-test-util :as sql.qp-test-util]
   [metabase.driver.sql.query-processor.deprecated]
   [metabase.lib-be.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.limit :as limit]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.util.add-alias-info :as add]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]
   [metabase.test.data.env :as tx.env]
   [metabase.util.date-2 :as u.date]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli.registry :as mr]))

(comment metabase.driver.sql.query-processor.deprecated/keep-me)

(set! *warn-on-reflection* true)

(deftest ^:parallel compiled-test
  (is (= [:raw "x"]
         (sql.qp/->honeysql :sql (sql.qp/compiled [:raw "x"])))))

(deftest ^:parallel default-select-test
  (is (= ["SELECT \"source\".* FROM (SELECT *) AS \"source\""]
         (->> {:from [[(sql.qp/sql-source-query "SELECT *" nil)
                       [(h2x/identifier :table-alias "source")]]]}
              (#'sql.qp/add-default-select :sql)
              (sql.qp/format-honeysql :sql)))))

(deftest ^:parallel sql-source-query-validation-test
  (testing "[[sql.qp/sql-source-query]] should throw Exceptions if you pass in invalid nonsense"
    (doseq [params [nil [1000]]]
      (testing (format "Params = %s" (pr-str params))
        (is (= {::sql.qp/sql-source-query ["SELECT *" params]}
               (sql.qp/sql-source-query "SELECT *" params)))))
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Expected native source query to be a string, got: clojure.lang.PersistentArrayMap"
         (sql.qp/sql-source-query {:native "SELECT *"} nil)))
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Expected native source query parameters to be sequential, got: java.lang.Long"
         (sql.qp/sql-source-query "SELECT *" 1000)))))

(deftest ^:parallel process-mbql-query-keys-test
  (testing "make sure our logic for deciding which order to process keys in the query works as expected"
    (is (= [:source-table :breakout :aggregation :fields :abc :def]
           (#'sql.qp/query->keys-in-application-order
            {:def          6
             :abc          5
             :source-table 1
             :aggregation  3
             :fields       4
             :breakout     2})))))

(defn- mbql->native [query]
  (qp.store/with-metadata-provider (if (qp.store/initialized?)
                                     (qp.store/metadata-provider)
                                     meta/metadata-provider)
    (driver/with-driver :h2
      (-> (sql.qp/mbql->native :h2 (qp.preprocess/preprocess query))
          :query
          sql.qp-test-util/pretty-sql))))

(deftest ^:parallel not-null-test
  (is (= '{:select [COUNT (*) AS count]
           :from   [CHECKINS]
           :where  [CHECKINS.DATE IS NOT NULL]}
         (-> (lib.tu.macros/mbql-query checkins
               {:aggregation [[:count]]
                :filter      [:not-null $date]})
             mbql->native
             sql.qp-test-util/sql->sql-map))))

(deftest ^:parallel false-equals-false-test
  (is (= '{:select [COUNT (*) AS count]
           :from   [CHECKINS]
           :where  [FALSE = FALSE]}
         (-> (lib.tu.macros/mbql-query checkins
               {:aggregation [[:count]]
                :filter      [:= false false]})
             mbql->native
             sql.qp-test-util/sql->sql-map))))

(deftest ^:parallel case-test
  (testing "Test that boolean case defaults are kept (#24100)"
    (is (= [[1 1 true]
            [2 0 false]]
           (mt/rows
            (mt/run-mbql-query venues
              {:source-table $$venues
               :order-by     [[:asc $id]]
               :expressions  {"First int"  [:case [[[:= $id 1] 1]]    {:default 0}]
                              "First bool" [:case [[[:= $id 1] true]] {:default false}]}
               :fields       [$id [:expression "First int" nil] [:expression "First bool" nil]]
               :limit        2}))))))

(deftest ^:parallel join-test
  (testing "Test that correct identifiers are used for joins"
    (are [join-type] (= '{:select   [VENUES.ID          AS ID
                                     VENUES.NAME        AS NAME
                                     VENUES.CATEGORY_ID AS CATEGORY_ID
                                     VENUES.LATITUDE    AS LATITUDE
                                     VENUES.LONGITUDE   AS LONGITUDE
                                     VENUES.PRICE       AS PRICE]
                          :from     [VENUES]
                          join-type [CATEGORIES AS c
                                     ON VENUES.CATEGORY_ID = c.ID]
                          :where    [c.NAME = ?]
                          :order-by [VENUES.ID ASC]
                          :limit    [100]}
                        (-> (lib.tu.macros/mbql-query venues
                              {:source-table $$venues
                               :order-by     [[:asc $id]]
                               :filter       [:=
                                              &c.categories.name
                                              [:value "BBQ" {:base_type :type/Text, :semantic_type :type/Name, :database_type "VARCHAR"}]]
                               :fields       [$id $name $category-id $latitude $longitude $price]
                               :limit        100
                               :joins        [{:source-table $$categories
                                               :alias        "c"
                                               :strategy     join-type
                                               :condition    [:=
                                                              $category-id
                                                              &c.categories.id]
                                               :fk-field-id  %venues.category-id
                                               :fields       :none}]})
                            mbql->native
                            sql.qp-test-util/sql->sql-map))
      :left-join
      :inner-join)))

(deftest ^:parallel nested-query-and-join-test
  (testing "This HAIRY query tests that the correct identifiers and aliases are used with both a nested query and JOIN in play."
    (is (= '{:select    [v.NAME AS v__NAME
                         COUNT (*) AS count]
             :from      [{:select [CHECKINS.ID       AS ID
                                   CHECKINS.DATE     AS DATE
                                   CHECKINS.USER_ID  AS USER_ID
                                   CHECKINS.VENUE_ID AS VENUE_ID]
                          :from   [CHECKINS]
                          :where  [CHECKINS.DATE > ?]}
                         AS source]
             :left-join [VENUES AS v
                         ON source.VENUE_ID = v.ID]
             :where     [(v.NAME LIKE ?) AND (source.USER_ID > 0)]
             :group-by  [v.NAME]
             :order-by  [v.NAME ASC]}
           (-> (lib.tu.macros/mbql-query checkins
                 {:source-query {:source-table $$checkins
                                 :fields       [$id [:field %date {:temporal-unit :default}] $user-id $venue-id]
                                 :filter       [:>
                                                $date
                                                [:absolute-datetime #t "2015-01-01T00:00:00.000000000-00:00" :default]]}
                  :aggregation  [[:count]]
                  :order-by     [[:asc &v.venues.name]]
                  :breakout     [&v.venues.name]
                  :filter       [:and
                                 [:starts-with
                                  &v.venues.name
                                  [:value "F" {:base_type     :type/Text
                                               :semantic_type :type/Name
                                               :database_type "VARCHAR"}]]
                                 [:> [:field "USER_ID" {:base-type :type/Integer}] 0]]
                  :joins        [{:source-table $$venues
                                  :alias        "v"
                                  :strategy     :left-join
                                  :condition    [:=
                                                 $venue-id
                                                 &v.venues.id]
                                  :fk-field-id  %checkins.venue-id
                                  :fields       :none}]})
               mbql->native
               sql.qp-test-util/sql->sql-map)))))

(deftest ^:parallel handle-named-aggregations-test
  (testing "Check that named aggregations are handled correctly"
    (is (= '{:select   [VENUES.PRICE AS PRICE
                        AVG (VENUES.CATEGORY_ID) AS avg_2]
             :from     [VENUES]
             :group-by [VENUES.PRICE]
             :order-by [avg_2 ASC
                        VENUES.PRICE ASC]}
           (-> (lib.tu.macros/mbql-query venues
                 {:aggregation [[:aggregation-options [:avg $category-id] {:name "avg_2"}]]
                  :breakout    [$price]
                  :order-by    [[:asc [:aggregation 0]]]})
               mbql->native
               sql.qp-test-util/sql->sql-map)))))

(deftest ^:parallel handle-source-query-params-test
  (driver/with-driver :h2
    (mt/with-metadata-provider (mt/id)
      (testing "params from source queries should get passed in to the top-level. Semicolons should be removed"
        (is (= {:query  "SELECT \"source\".* FROM (SELECT * FROM some_table WHERE name = ?) AS \"source\" WHERE (\"source\".\"name\" <> ?) OR (\"source\".\"name\" IS NULL)"
                :params ["Cam" "Lucky Pigeon"]}
               (sql.qp/mbql->native
                :h2
                (lib.tu.macros/mbql-query venues
                  {:source-query    {:native "SELECT * FROM some_table WHERE name = ?;", :params ["Cam"]}
                   :source-metadata [{:name "name", :display_name "Name", :base_type :type/Integer}]
                   :filter          [:!= *name/Integer "Lucky Pigeon"]}))))))))

(deftest ^:parallel joins-against-native-queries-test
  (testing "Joins against native SQL queries should get converted appropriately! make sure correct HoneySQL is generated"
    (mt/with-metadata-provider meta/metadata-provider
      (driver/with-driver :h2
        (is (= [[(sql.qp/sql-source-query "SELECT * FROM VENUES;" [])
                 [(h2x/identifier :table-alias "card")]]
                [:=
                 (h2x/with-database-type-info (h2x/identifier :field "PUBLIC" "CHECKINS" "VENUE_ID") "integer")
                 (h2x/identifier :field "card" "id")]]
               (sql.qp/join->honeysql :h2
                                      (lib.tu.macros/$ids checkins
                                        {:source-query {:native "SELECT * FROM VENUES;", :params []}
                                         :alias        "card"
                                         :strategy     :left-join
                                         :condition    [:=
                                                        [:field %venue-id {::add/source-table $$checkins
                                                                           ::add/source-alias "VENUE_ID"}]
                                                        [:field "id" {:join-alias        "card"
                                                                      :base-type         :type/Integer
                                                                      ::add/source-table "card"
                                                                      ::add/source-alias "id"}]]}))))))))

(defn- compile-join [driver]
  (driver/with-driver driver
    (qp.store/with-metadata-provider meta/metadata-provider
      (let [join (sql.qp/join->honeysql
                  driver
                  {:source-query {:native "SELECT * FROM VENUES;", :params []}
                   :alias        "card"
                   :strategy     :left-join
                   :condition    [:=
                                  [:field (meta/id :checkins :id) {::add/source-table (meta/id :checkins)
                                                                   ::add/source-alias "VENUE_ID"}]
                                  [:field "id" {:base-type         :type/Text
                                                ::add/source-table "card"
                                                ::add/source-alias "id"}]]})]
        (sql.qp/format-honeysql driver {:join join})))))

;;; Ok to hardcode driver names here because it's for general HoneySQL compilation behavior and not something that needs
;;; to be run against all supported drivers
#_{:clj-kondo/ignore [:metabase/disallow-hardcoded-driver-names-in-tests]}
(deftest ^:parallel compile-honeysql-test
  (testing "make sure the generated HoneySQL will compile to the correct SQL"
    (are [driver] (= ["INNER JOIN (SELECT * FROM VENUES) AS \"card\" ON \"PUBLIC\".\"CHECKINS\".\"VENUE_ID\" = \"card\".\"id\""]
                     (compile-join driver))
      :sql :h2 :postgres)))

(deftest adjust-start-of-week-test
  (driver/with-driver :h2
    (with-redefs [driver/db-start-of-week   (constantly :monday)
                  setting/get-value-of-type (constantly :sunday)]
      (is (= (-> [:dateadd
                  (h2x/literal "day")
                  [:inline -1]
                  (-> [:cast
                       [:week (-> [:dateadd
                                   (h2x/literal "day")
                                   [:inline 1]
                                   (-> [:cast :created_at [:raw "datetime"]]
                                       (h2x/with-database-type-info "datetime"))]
                                  (h2x/with-database-type-info "datetime"))]
                       [:raw "datetime"]]
                      (h2x/with-database-type-info "datetime"))]
                 (h2x/with-database-type-info "datetime"))
             (sql.qp/adjust-start-of-week :h2 (fn [x] [:week x]) :created_at))))
    (testing "Do we skip the adjustment if offset = 0"
      (with-redefs [driver/db-start-of-week   (constantly :monday)
                    setting/get-value-of-type (constantly :monday)]
        (is (= [:week :created_at]
               (sql.qp/adjust-start-of-week :h2 (fn [x] [:week x]) :created_at)))))))

(defn- query-on-dataset-with-nils
  [query]
  (mt/rows
   (qp/process-query
    {:database (mt/id)
     :type     :query
     :query    (merge
                {:source-query {:native "select 'foo' as a union select null as a union select 'bar' as a"}
                 :expressions  {"initial" [:regex-match-first [:field "A" {:base-type :type/Text}] "(\\w)"]}
                 :order-by     [[:asc [:field "A" {:base-type :type/Text}]]]}
                query)})))

(deftest ^:parallel correct-for-null-behaviour
  (testing (str "NULLs should be treated intuitively in filters (SQL has somewhat unintuitive semantics where NULLs "
                "get propagated out of expressions).")
    (is (= [[nil] ["bar"]]
           (query-on-dataset-with-nils {:filter [:not [:starts-with [:field "A" {:base-type :type/Text}] "f"]]})))
    (is (= [[nil] ["bar"]]
           (query-on-dataset-with-nils {:filter [:not [:ends-with [:field "A" {:base-type :type/Text}] "o"]]})))
    (is (= [[nil] ["bar"]]
           (query-on-dataset-with-nils {:filter [:not [:contains [:field "A" {:base-type :type/Text}] "f"]]})))
    (is (= [[nil] ["bar"]]
           (query-on-dataset-with-nils {:filter [:!= [:field "A" {:base-type :type/Text}] "foo"]})))
    (is (= [[nil] ["bar"]]
           (query-on-dataset-with-nils {:filter [:!= [:expression "initial" {:base-type :type/Text}] "f"]}))))
  (testing "Null behaviour correction fix should work with joined fields (#13534)"
    (is (= [[1000]]
           (mt/rows
            (mt/run-mbql-query checkins
              {:filter      [:!= &u.users.name "foo"]
               :aggregation [:count]
               :joins       [{:source-table $$users
                              :alias        "u"
                              :condition    [:= $user_id &u.users.id]}]}))))))

(deftest ^:parallel joined-field-clauses-test
  (testing "Should correctly compile `:field` clauses with `:join-alias`"
    (testing "when the join is at the same level"
      (is (= {:select    '[c.NAME AS c__NAME]
              :from      '[VENUES]
              :left-join '[CATEGORIES AS c ON VENUES.CATEGORY_ID = c.ID]
              :limit     [limit/absolute-max-results]}
             (-> (lib.tu.macros/mbql-query venues
                   {:fields [&c.categories.name]
                    :joins  [{:fields       [&c.categories.name]
                              :source-table $$categories
                              :strategy     :left-join
                              :condition    [:= $category-id &c.categories.id]
                              :alias        "c"}]})
                 mbql->native
                 sql.qp-test-util/sql->sql-map))))

    (testing "when the join is NOT at the same level"
      (is (= {:select '[source.c__NAME AS c__NAME]
              :from   '[{:select    [c.NAME AS c__NAME]
                         :from      [VENUES]
                         :left-join [CATEGORIES AS c ON VENUES.CATEGORY_ID = c.ID]} AS source]
              :limit  [limit/absolute-max-results]}
             (-> (lib.tu.macros/mbql-query venues
                   {:fields       [&c.categories.name]
                    :source-query {:source-table $$venues
                                   :fields       [&c.categories.name]
                                   :joins        [{:fields       [&c.categories.name]
                                                   :source-table $$categories
                                                   :strategy     :left-join
                                                   :condition    [:= $category-id &c.categories.id]
                                                   :alias        "c"}]}})
                 mbql->native
                 sql.qp-test-util/sql->sql-map))))))

(deftest ^:parallel ambiguous-field-metadata-test
  (testing "With queries that refer to the same field more than once, can we generate sane SQL?"
    (is (= '{:select    [ORDERS.ID                       AS ID
                         ORDERS.PRODUCT_ID               AS PRODUCT_ID
                         PRODUCTS__via__PRODUCT_ID.TITLE AS PRODUCTS__via__PRODUCT_ID__TITLE
                         Products.ID                     AS Products__ID
                         Products.TITLE                  AS Products__TITLE]
             :from      [ORDERS]
             :left-join [PRODUCTS AS Products                  ON ORDERS.PRODUCT_ID = Products.ID
                         PRODUCTS AS PRODUCTS__via__PRODUCT_ID ON ORDERS.PRODUCT_ID = PRODUCTS__via__PRODUCT_ID.ID]
             :order-by  [ORDERS.ID ASC]
             :limit     [2]}
           (-> (lib.tu.macros/mbql-query orders
                 {:joins    [{:strategy     :left-join
                              :source-table $$products
                              :condition    [:= $product-id &Products.products.id]
                              :alias        "Products"}
                             {:strategy     :left-join
                              :source-table $$products
                              :alias        "PRODUCTS__via__PRODUCT_ID"
                              :fk-field-id  %product-id
                              :condition    [:= $product-id &PRODUCTS__via__PRODUCT_ID.products.id]}]
                  :order-by [[:asc $id]]
                  :limit    2
                  :fields   [$id
                             $product-id
                             &PRODUCTS__via__PRODUCT_ID.products.title
                             &Products.products.id
                             &Products.products.title]})
               mbql->native
               sql.qp-test-util/sql->sql-map)))))

(deftest ^:parallel simple-expressions-test
  (is (= '{:select [source.ID          AS ID
                    source.NAME        AS NAME
                    source.CATEGORY_ID AS CATEGORY_ID
                    source.LATITUDE    AS LATITUDE
                    source.LONGITUDE   AS LONGITUDE
                    source.PRICE       AS PRICE
                    source.double_id   AS double_id]
           :from   [{:select [VENUES.ID          AS ID
                              VENUES.NAME        AS NAME
                              VENUES.CATEGORY_ID AS CATEGORY_ID
                              VENUES.LATITUDE    AS LATITUDE
                              VENUES.LONGITUDE   AS LONGITUDE
                              VENUES.PRICE       AS PRICE
                              VENUES.ID * 2      AS double_id]
                     :from   [VENUES]}
                    AS source]
           :limit  [1]}
         (-> (lib.tu.macros/mbql-query venues
               {:source-query {:source-table $$venues
                               :expressions  {:double_id [:* $id 2]}
                               :fields       [$id $name $category-id $latitude $longitude $price [:expression "double_id"]]}
                :fields       [$id $name $category-id $latitude $longitude $price *double_id/Float]
                :limit        1})
             mbql->native
             sql.qp-test-util/sql->sql-map))))

(deftest ^:parallel multiple-joins-with-expressions-test
  (testing "We should be able to compile a complicated query with multiple joins and expressions correctly"
    (is (= '{:select   [source.PRODUCTS__via__PRODUCT_ID__CATEGORY AS PRODUCTS__via__PRODUCT_ID__CATEGORY
                        source.PEOPLE__via__USER_ID__SOURCE AS PEOPLE__via__USER_ID__SOURCE
                        DATE_TRUNC ("year" source.CREATED_AT) AS CREATED_AT
                        source.pivot-grouping AS pivot-grouping
                        COUNT (*) AS count]
             :from     [{:select    [ORDERS.USER_ID                     AS USER_ID
                                     ORDERS.PRODUCT_ID                  AS PRODUCT_ID
                                     ORDERS.CREATED_AT                  AS CREATED_AT
                                     ABS (0)                            AS pivot-grouping
                                     ;; TODO: The order here is not deterministic! It's coming
                                     ;; from [[metabase.query-processor.util.transformations.nest-breakouts]]
                                     ;; or [[metabase.query-processor.util.nest-query]], which walks the query looking
                                     ;; for refs in an arbitrary order, and returns `m/distinct-by` over that random
                                     ;; order. Changing the map keys on the inner query can perturb this order; if you
                                     ;; cause this test to fail based on shuffling the order of these joined fields,
                                     ;; just edit the expectation to match the new order. Tech debt issue: #39396
                                     PRODUCTS__via__PRODUCT_ID.CATEGORY AS PRODUCTS__via__PRODUCT_ID__CATEGORY
                                     PEOPLE__via__USER_ID.SOURCE        AS PEOPLE__via__USER_ID__SOURCE
                                     PRODUCTS__via__PRODUCT_ID.ID       AS PRODUCTS__via__PRODUCT_ID__ID
                                     PEOPLE__via__USER_ID.ID            AS PEOPLE__via__USER_ID__ID]
                         :from      [ORDERS]
                         :left-join [PRODUCTS AS PRODUCTS__via__PRODUCT_ID
                                     ON ORDERS.PRODUCT_ID = PRODUCTS__via__PRODUCT_ID.ID
                                     PEOPLE AS PEOPLE__via__USER_ID
                                     ON ORDERS.USER_ID = PEOPLE__via__USER_ID.ID]
                         :where     [((PEOPLE__via__USER_ID.SOURCE = ?) OR (PEOPLE__via__USER_ID.SOURCE = ?))
                                     AND
                                     ((PRODUCTS__via__PRODUCT_ID.CATEGORY = ?) OR (PRODUCTS__via__PRODUCT_ID.CATEGORY = ?))
                                     AND
                                     (ORDERS.CREATED_AT >= DATE_TRUNC ("year" DATEADD ("year" -2 NOW ())))
                                     AND
                                     (ORDERS.CREATED_AT < DATE_TRUNC ("year" NOW ()))]}
                        AS source]
             :group-by [source.PRODUCTS__via__PRODUCT_ID__CATEGORY
                        source.PEOPLE__via__USER_ID__SOURCE
                        DATE_TRUNC ("year" source.CREATED_AT)
                        source.pivot-grouping]
             :order-by [source.PRODUCTS__via__PRODUCT_ID__CATEGORY ASC
                        source.PEOPLE__via__USER_ID__SOURCE ASC
                        DATE_TRUNC ("year" source.CREATED_AT) ASC
                        source.pivot-grouping ASC]}
           (-> (lib.tu.macros/mbql-query orders
                 {:aggregation [[:aggregation-options [:count] {:name "count"}]]
                  :breakout    [&PRODUCTS__via__PRODUCT_ID.products.category
                                &PEOPLE__via__USER_ID.people.source
                                !year.created-at
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
                                [:between !year.created-at [:relative-datetime -2 :year] [:relative-datetime -1 :year]]]
                  :expressions {:pivot-grouping [:abs 0]}
                  :order-by    [[:asc &PRODUCTS__via__PRODUCT_ID.products.category]
                                [:asc &PEOPLE__via__USER_ID.people.source]
                                [:asc !year.created-at]
                                [:asc [:expression "pivot-grouping"]]]
                  :joins       [{:source-table $$products
                                 :strategy     :left-join
                                 :alias        "PRODUCTS__via__PRODUCT_ID"
                                 :fk-field-id  %product-id
                                 :condition    [:= $product-id &PRODUCTS__via__PRODUCT_ID.products.id]}
                                {:source-table $$people
                                 :strategy     :left-join
                                 :alias        "PEOPLE__via__USER_ID"
                                 :fk-field-id  %user-id
                                 :condition    [:= $user-id &PEOPLE__via__USER_ID.people.id]}]})
               mbql->native
               sql.qp-test-util/sql->sql-map)))))

(def ^:private reference-aggregation-expressions-in-joins-test-expected-sql
  '{:select    [VENUES.ID          AS ID
                VENUES.NAME        AS NAME
                VENUES.CATEGORY_ID AS CATEGORY_ID
                VENUES.LATITUDE    AS LATITUDE
                VENUES.LONGITUDE   AS LONGITUDE
                VENUES.PRICE       AS PRICE
                CAST (VENUES.PRICE AS double)
                /
                NULLIF (CAST (CategoriesStats.AvgPrice AS double), 0.0) AS RelativePrice
                CategoriesStats.CATEGORY_ID AS CategoriesStats__CATEGORY_ID
                CategoriesStats.MaxPrice    AS CategoriesStats__MaxPrice
                CategoriesStats.AvgPrice    AS CategoriesStats__AvgPrice
                CategoriesStats.MinPrice    AS CategoriesStats__MinPrice]
    :from      [VENUES]
    :left-join [{:select   [VENUES.CATEGORY_ID AS CATEGORY_ID
                            MAX (VENUES.PRICE) AS MaxPrice
                            AVG (VENUES.PRICE) AS AvgPrice
                            MIN (VENUES.PRICE) AS MinPrice]
                 :from     [VENUES]
                 :group-by [VENUES.CATEGORY_ID]
                 :order-by [VENUES.CATEGORY_ID ASC]} AS CategoriesStats
                ON VENUES.CATEGORY_ID = CategoriesStats.CATEGORY_ID]
    :limit     [3]})

(deftest ^:parallel reference-aggregation-expressions-in-joins-test
  (testing "See if we can correctly compile a query that references expressions that come from a join"
    (is (= reference-aggregation-expressions-in-joins-test-expected-sql
           (-> (lib.tu.macros/mbql-query venues
                 {:fields      [$id
                                $name
                                $category-id
                                $latitude
                                $longitude
                                $price
                                [:expression "RelativePrice"]
                                &CategoriesStats.category-id
                                &CategoriesStats.*MaxPrice/Integer
                                &CategoriesStats.*AvgPrice/Integer
                                &CategoriesStats.*MinPrice/Integer]
                  :expressions {"RelativePrice" [:/ $price &CategoriesStats.*AvgPrice/Integer]}
                  :joins       [{:strategy     :left-join
                                 :condition    [:= $category-id &CategoriesStats.venues.category-id]
                                 :source-query {:source-table $$venues
                                                :aggregation  [[:aggregation-options [:max $price] {:name "MaxPrice"}]
                                                               [:aggregation-options [:avg $price] {:name "AvgPrice"}]
                                                               [:aggregation-options [:min $price] {:name "MinPrice"}]]
                                                :breakout     [$category-id]}
                                 :alias        "CategoriesStats"
                                 :fields       :all}]
                  :limit       3})
               mbql->native
               sql.qp-test-util/sql->sql-map)))))

(deftest ^:parallel wrong-type-info-test
  (testing (str "Same as the test above, but the :field refs have base types different from what the QP would normally "
                "calculate; query should still work")
    (is (= reference-aggregation-expressions-in-joins-test-expected-sql
           (-> (lib.tu.macros/mbql-query venues
                 {:fields      [$id
                                $name
                                $category-id
                                $latitude
                                $longitude
                                $price
                                [:expression "RelativePrice"]
                                &CategoriesStats.category-id
                                &CategoriesStats.*MaxPrice/Number
                                &CategoriesStats.*AvgPrice/Number
                                &CategoriesStats.*MinPrice/Number]
                  :expressions {"RelativePrice" [:/ $price &CategoriesStats.*AvgPrice/Number]}
                  :joins       [{:strategy     :left-join
                                 :condition    [:= $category-id &CategoriesStats.venues.category-id]
                                 :source-query {:source-table $$venues
                                                :aggregation  [[:aggregation-options [:max $price] {:name "MaxPrice"}]
                                                               [:aggregation-options [:avg $price] {:name "AvgPrice"}]
                                                               [:aggregation-options [:min $price] {:name "MinPrice"}]]
                                                :breakout     [$category-id]}
                                 :alias        "CategoriesStats"
                                 :fields       :all}]
                  :limit       3})
               mbql->native
               sql.qp-test-util/sql->sql-map)))))

(deftest ^:parallel expressions-and-coercions-test
  (testing "Don't cast in both inner select and outer select when expression (#12430)"
    (qp.store/with-metadata-provider (lib.tu/merged-mock-metadata-provider
                                      (lib.metadata.jvm/application-database-metadata-provider (mt/id))
                                      {:fields [{:id                (mt/id :venues :price)
                                                 :coercion-strategy :Coercion/UNIXSeconds->DateTime
                                                 :effective-type    :type/DateTime}]})
      (let [query (mt/mbql-query venues
                    {:expressions {:test ["*" 1 1]}
                     :fields      [$price
                                   [:expression "test"]]
                     :limit       1})]
        (testing "Generated SQL"
          (is (= '{:select [TIMESTAMPADD ("second" VENUES.PRICE timestamp "1970-01-01T00:00:00Z") AS PRICE
                            1 * 1 AS test]
                   :from   [VENUES]
                   :limit  [1]}
                 (-> query mbql->native sql.qp-test-util/sql->sql-map)))
          (testing "Results"
            (let [results (qp/process-query query)]
              (is (=? [string? number?]
                      (-> results mt/rows first))))))))))

(deftest ^:parallel nested-mbql-source-query-test
  (is (= '{:select    [VENUES.ID          AS ID
                       VENUES.NAME        AS NAME
                       VENUES.CATEGORY_ID AS CATEGORY_ID
                       VENUES.LATITUDE    AS LATITUDE
                       VENUES.LONGITUDE   AS LONGITUDE
                       VENUES.PRICE       AS PRICE]
           :from      [VENUES]
           :left-join [{:select [CATEGORIES.ID   AS ID
                                 CATEGORIES.NAME AS NAME]
                        :from   [CATEGORIES]} AS cat
                       ON VENUES.CATEGORY_ID = cat.ID]
           :order-by  [VENUES.NAME ASC]
           :limit     [3]}
         (-> (lib.tu.macros/mbql-query venues
               {:source-table $$venues
                :joins        [{:alias        "cat"
                                :source-query {:source-table $$categories}
                                :condition    [:= $category-id &cat.*categories.id]}]
                :order-by     [[:asc $name]]
                :limit        3})
             mbql->native
             sql.qp-test-util/sql->sql-map))))

(deftest ^:parallel join-inside-source-query-test
  (testing "Make sure a JOIN inside a source query gets compiled as expected"
    (is (= '{:select [source.P1__CATEGORY AS P1__CATEGORY]
             :from   [{:select    [P1.CATEGORY AS P1__CATEGORY]
                       :from      [ORDERS]
                       :left-join [PRODUCTS AS P1 ON ORDERS.PRODUCT_ID = P1.ID]}
                      AS source]
             :limit  [1]}
           (-> (lib.tu.macros/mbql-query orders
                 {:fields       [&P1.products.category]
                  :source-query {:source-table $$orders
                                 :fields       [&P1.products.category]
                                 :joins        [{:strategy     :left-join
                                                 :source-table $$products
                                                 :condition    [:= $product-id &P1.products.id]
                                                 :alias        "P1"}]}
                  :limit        1})
               mbql->native
               sql.qp-test-util/sql->sql-map)))))

(deftest ^:parallel join-against-source-query-test
  (testing "Make sure a JOIN referencing fields from the source query use correct aliases/etc"
    (qp.store/with-metadata-provider meta/metadata-provider
      (is (= '{:select    [source.P1__CATEGORY AS P1__CATEGORY]
               :from      [{:select    [P1.CATEGORY AS P1__CATEGORY]
                            :from      [ORDERS]
                            :left-join [PRODUCTS AS P1 ON ORDERS.PRODUCT_ID = P1.ID]}
                           AS source]
               :left-join [{:select    [P2.CATEGORY AS P2__CATEGORY]
                            :from      [REVIEWS]
                            :left-join [PRODUCTS AS P2 ON REVIEWS.PRODUCT_ID = P2.ID]}
                           AS Q2
                           ON source.P1__CATEGORY = Q2.P2__CATEGORY]
               :limit     [1]}
             (-> (lib.tu.macros/mbql-query orders
                   {:fields       [&P1.products.category]
                    :source-query {:source-table $$orders
                                   :fields       [&P1.products.category]
                                   :joins        [{:strategy     :left-join
                                                   :source-table $$products
                                                   :condition    [:= $product-id &P1.products.id]
                                                   :alias        "P1"}]}
                    :joins        [{:strategy     :left-join
                                    :condition    [:= &P1.products.category &Q2.products.category]
                                    :alias        "Q2"
                                    :source-query {:source-table $$reviews
                                                   :fields       [&P2.products.category]
                                                   :joins        [{:strategy     :left-join
                                                                   :source-table $$products
                                                                   :condition    [:= $reviews.product-id &P2.products.id]
                                                                   :alias        "P2"}]}}]
                    :limit        1})
                 mbql->native
                 sql.qp-test-util/sql->sql-map))))))

(deftest ^:parallel implicit-join-test
  (is (= '{:select    [VENUES.NAME                       AS NAME
                       CATEGORIES__via__CATEGORY_ID.NAME AS CATEGORIES__via__CATEGORY_ID__NAME]
           :from      [VENUES]
           :left-join [CATEGORIES AS CATEGORIES__via__CATEGORY_ID
                       ON VENUES.CATEGORY_ID = CATEGORIES__via__CATEGORY_ID.ID]
           :order-by  [VENUES.ID ASC]
           :limit     [5]}
         (-> (lib.tu.macros/mbql-query venues
               {:joins    [{:source-table $$categories
                            :alias        "CATEGORIES__via__CATEGORY_ID"
                            :condition    [:= $category-id &CATEGORIES__via__CATEGORY_ID.categories.id]
                            :strategy     :left-join}]
                :fields   [$name
                           $category-id->&CATEGORIES__via__CATEGORY_ID.categories.name]
                :order-by [[:asc $id]]
                :limit    5})
             mbql->native
             sql.qp-test-util/sql->sql-map))))

(deftest ^:parallel another-source-query-test
  (is (= '{:select [source.DATE  AS DATE
                    source.sum   AS sum
                    source.sum_2 AS sum_2]
           :from   [{:select   [DATE_TRUNC ("month" CHECKINS.DATE) AS DATE
                                SUM (CHECKINS.USER_ID)                                           AS sum
                                SUM (CHECKINS.VENUE_ID)                                          AS sum_2]
                     :from     [CHECKINS]
                     :group-by [DATE_TRUNC ("month" CHECKINS.DATE)]
                     :order-by [DATE_TRUNC ("month" CHECKINS.DATE) ASC]}
                    AS source]
           :where  [source.sum > 300]
           :limit  [2]}
         (-> (lib.tu.macros/mbql-query checkins
               {:source-query {:source-table $$checkins
                               :aggregation  [[:sum $user-id]
                                              [:sum $venue-id]]
                               :breakout     [!month.date]}
                :filter       [:> *sum/Float 300]
                :limit        2})
             mbql->native
             sql.qp-test-util/sql->sql-map))))

(deftest ^:parallel expression-with-duplicate-column-name-test
  (testing "Can we use expression with same column name as table (#14267)"
    (is (= '{:select   [source.CATEGORY_2 AS CATEGORY
                        COUNT (*)         AS count]
             :from     [{:select [PRODUCTS.CATEGORY            AS CATEGORY
                                  CONCAT (PRODUCTS.CATEGORY ?) AS CATEGORY_2]
                         :from   [PRODUCTS]}
                        AS source]
             :group-by [source.CATEGORY_2]
             :order-by [source.CATEGORY_2 ASC]
             :limit    [1]}
           (-> (lib.tu.macros/mbql-query products
                 {:expressions {:CATEGORY [:concat $category "2"]}
                  :breakout    [[:expression :CATEGORY]]
                  :aggregation [[:count]]
                  :order-by    [[:asc [:expression :CATEGORY]]]
                  :limit       1})
               mbql->native
               sql.qp-test-util/sql->sql-map)))))

(deftest ^:parallel join-source-queries-with-joins-test
  (testing "Should be able to join against source queries that themselves contain joins (#12928)"
    (is (= '{:select    [source.P1__CATEGORY   AS P1__CATEGORY
                         source.People__SOURCE AS People__SOURCE
                         source.count          AS count
                         Q2.P2__CATEGORY       AS Q2__P2__CATEGORY
                         Q2.avg                AS Q2__avg]
             :from      [{:select    [P1.CATEGORY   AS P1__CATEGORY
                                      People.SOURCE AS People__SOURCE
                                      COUNT (*)     AS count]
                          :from      [ORDERS]
                          :left-join [PRODUCTS AS P1     ON ORDERS.PRODUCT_ID = P1.ID
                                      PEOPLE   AS People ON ORDERS.USER_ID = People.ID]
                          :group-by  [P1.CATEGORY
                                      People.SOURCE]
                          :order-by  [P1.CATEGORY ASC People.SOURCE ASC]}
                         AS source]
             :left-join [{:select    [P2.CATEGORY          AS P2__CATEGORY
                                      AVG (REVIEWS.RATING) AS avg]
                          :from      [REVIEWS]
                          :left-join [PRODUCTS AS P2 ON REVIEWS.PRODUCT_ID = P2.ID]
                          :group-by  [P2.CATEGORY]
                          :order-by  [P2.CATEGORY ASC]}
                         AS Q2
                         ON source.P1__CATEGORY = Q2.P2__CATEGORY]
             :order-by  [source.P1__CATEGORY   ASC
                         source.People__SOURCE ASC]
             :limit     [2]}
           (-> (lib.tu.macros/mbql-query orders
                 {:source-query {:source-table $$orders
                                 :joins        [{:fields       :all
                                                 :source-table $$products
                                                 :condition    [:= $orders.product-id &P1.products.id]
                                                 :alias        "P1"}
                                                {:fields       :all
                                                 :source-table $$people
                                                 :condition    [:= $orders.user-id &People.people.id]
                                                 :alias        "People"}]
                                 :aggregation  [[:count]]
                                 :breakout     [&P1.products.category
                                                [:field %people.source {:join-alias "People"}]]}
                  :joins        [{:fields       :all
                                  :condition    [:= &P1.products.category #_$products.category &Q2.products.category]
                                  :alias        "Q2"
                                  :source-query {:source-table $$reviews
                                                 :joins        [{:fields       :all
                                                                 :source-table $$products
                                                                 :condition    [:=
                                                                                $reviews.product-id
                                                                                &P2.products.id]
                                                                 :alias        "P2"}]
                                                 :aggregation  [[:avg $reviews.rating]]
                                                 :breakout     [&P2.products.category]}}]
                  :order-by     [[:asc &P1.products.category]
                                 [:asc [:field %people.source {:join-alias "People"}]]]
                  :limit        2})
               mbql->native
               sql.qp-test-util/sql->sql-map)))))

(deftest ^:parallel floating-point-division-test
  (testing "Make sure FLOATING POINT division is done when dividing by expressions/fields"
    (is (= '{:select   [CAST
                        (VENUES.PRICE AS double)
                        /
                        NULLIF (CAST (VENUES.PRICE + 2 AS double), 0.0) AS my_cool_new_field]
             :from     [VENUES]
             :order-by [VENUES.ID ASC]
             :limit    [3]}
           (-> (lib.tu.macros/mbql-query venues
                 {:expressions {:big_price         [:+ $price 2]
                                :my_cool_new_field [:/ $price [:expression "big_price"]]}
                  :fields      [[:expression "my_cool_new_field"]]
                  :limit       3
                  :order-by    [[:asc $id]]})
               mbql->native
               sql.qp-test-util/sql->sql-map)))))

(deftest ^:parallel floating-point-division-test-2
  (testing "Don't generate unneeded casts to FLOAT for the numerator if it is a number literal"
    (is (= '{:select [2.0 / 4.0 AS my_cool_new_field]
             :from   [VENUES]
             :limit  [1]}
           (-> (lib.tu.macros/mbql-query venues
                 {:expressions {:my_cool_new_field [:/ 2 4]}
                  :fields      [[:expression "my_cool_new_field"]]
                  :limit       1})
               mbql->native
               sql.qp-test-util/sql->sql-map)))))

(deftest ^:parallel duplicate-aggregations-test
  (testing "Make sure multiple aggregations of the same type get unique aliases"
    (qp.store/with-metadata-provider meta/metadata-provider
      ;; ([[metabase.query-processor.middleware.pre-alias-aggregations]] should actually take care of this, but this test
      ;; is here to be extra safe anyway.)
      (is (= '{:select [SUM (VENUES.ID)    AS sum
                        SUM (VENUES.PRICE) AS sum_2]
               :from   [VENUES]
               :limit  [1]}
             (sql.qp-test-util/query->sql-map
              (lib.tu.macros/mbql-query venues
                {:aggregation [[:sum $id]
                               [:sum $price]]
                 :limit       1})))))))

(deftest ^:parallel join-against-query-with-implicit-joins-test
  (testing "Should be able to do subsequent joins against a query with implicit joins (#17767)"
    (qp.store/with-metadata-provider meta/metadata-provider
      (is (= '{:select    [source.PRODUCTS__via__PRODUCT_ID__ID AS PRODUCTS__via__PRODUCT_ID__ID
                           source.count                         AS count
                           Reviews.ID                           AS Reviews__ID
                           Reviews.PRODUCT_ID                   AS Reviews__PRODUCT_ID
                           Reviews.REVIEWER                     AS Reviews__REVIEWER
                           Reviews.RATING                       AS Reviews__RATING
                           Reviews.BODY                         AS Reviews__BODY
                           Reviews.CREATED_AT                   AS Reviews__CREATED_AT]
               :from      [{:select    [PRODUCTS__via__PRODUCT_ID.ID AS PRODUCTS__via__PRODUCT_ID__ID
                                        COUNT (*)                    AS count]
                            :from      [ORDERS]
                            :left-join [PRODUCTS AS PRODUCTS__via__PRODUCT_ID
                                        ON ORDERS.PRODUCT_ID = PRODUCTS__via__PRODUCT_ID.ID]
                            :group-by  [PRODUCTS__via__PRODUCT_ID.ID]
                            :order-by  [PRODUCTS__via__PRODUCT_ID.ID ASC]}
                           AS source]
               :left-join [REVIEWS AS Reviews
                           ON source.PRODUCTS__via__PRODUCT_ID__ID = Reviews.PRODUCT_ID]
               :limit     [1]}
             (sql.qp-test-util/query->sql-map
              (lib.tu.macros/mbql-query orders
                {:source-query {:source-table $$orders
                                :aggregation  [[:count]]
                                :breakout     [$product-id->products.id]}
                 :joins        [{:fields       :all
                                 :source-table $$reviews
                                 :condition    [:= *ID/BigInteger &Reviews.reviews.product-id]
                                 :alias        "Reviews"}]
                 :limit        1})))))))

(deftest ^:parallel join-table-on-itself-with-custom-column-test
  (testing "Should be able to join a source query against itself using an expression (#17770)"
    (qp.store/with-metadata-provider meta/metadata-provider
      (is (= '{:select    [source.CATEGORY AS CATEGORY
                           source.count    AS count
                           source.CC       AS CC
                           Q1.CATEGORY     AS Q1__CATEGORY
                           Q1.count        AS Q1__count
                           Q1.CC           AS Q1__CC]
               :from      [{:select [source.CATEGORY AS CATEGORY
                                     source.count    AS count
                                     1 + 1           AS CC]
                            :from   [{:select   [PRODUCTS.CATEGORY AS CATEGORY
                                                 COUNT (*)         AS count]
                                      :from     [PRODUCTS]
                                      :group-by [PRODUCTS.CATEGORY]
                                      :order-by [PRODUCTS.CATEGORY ASC]}
                                     AS source]}
                           AS source]
               :left-join [{:select [source.CATEGORY AS CATEGORY
                                     source.count    AS count
                                     1 + 1           AS CC]
                            :from   [{:select   [PRODUCTS.CATEGORY AS CATEGORY
                                                 COUNT (*)         AS count]
                                      :from     [PRODUCTS]
                                      :group-by [PRODUCTS.CATEGORY]
                                      :order-by [PRODUCTS.CATEGORY ASC]}
                                     AS source]}
                           AS Q1 ON source.CC = Q1.CC]
               :limit     [1]}
             (sql.qp-test-util/query->sql-map
              (lib.tu.macros/mbql-query nil
                {:source-query {:source-query {:source-table $$products
                                               :aggregation  [[:count]]
                                               :breakout     [$products.category]}
                                :expressions  {:CC [:+ 1 1]}}
                 :joins        [{:source-query {:source-query {:source-table $$products
                                                               :aggregation  [[:count]]
                                                               :breakout     [$products.category]}
                                                :expressions  {:CC [:+ 1 1]}}
                                 :alias        "Q1"
                                 :condition    [:=
                                                [:field "CC" {:base-type :type/Integer}]
                                                [:field "CC" {:base-type :type/Integer, :join-alias "Q1"}]]
                                 :fields       :all}]
                 :limit        1})))))))

(deftest ^:parallel mega-query-test
  (testing "Should generate correct SQL for joins against source queries that contain joins (#12928)"
    (is (= '{:select    [source.P1__CATEGORY   AS P1__CATEGORY
                         source.People__SOURCE AS People__SOURCE
                         source.count          AS count
                         Q2.P2__CATEGORY       AS Q2__P2__CATEGORY
                         Q2.avg                AS Q2__avg]
             :from      [{:select    [P1.CATEGORY   AS P1__CATEGORY
                                      People.SOURCE AS People__SOURCE
                                      COUNT (*)     AS count]
                          :from      [ORDERS]
                          :left-join [PRODUCTS AS P1     ON ORDERS.PRODUCT_ID = P1.ID
                                      PEOPLE   AS People ON ORDERS.USER_ID = People.ID]
                          :group-by  [P1.CATEGORY
                                      People.SOURCE]
                          :order-by  [P1.CATEGORY   ASC
                                      People.SOURCE ASC]}
                         AS source]
             :left-join [{:select    [P2.CATEGORY          AS P2__CATEGORY
                                      AVG (REVIEWS.RATING) AS avg]
                          :from      [REVIEWS]
                          :left-join [PRODUCTS AS P2 ON REVIEWS.PRODUCT_ID = P2.ID]
                          :group-by  [P2.CATEGORY]
                          :order-by  [P2.CATEGORY ASC]}
                         AS Q2
                         ON source.P1__CATEGORY = Q2.P2__CATEGORY]
             :limit     [2]}
           (-> (lib.tu.macros/mbql-query nil
                 {:fields       [&P1.products.category
                                 &People.people.source
                                 [:field "count" {:base-type :type/BigInteger}]
                                 &Q2.products.category
                                 [:field "avg" {:base-type :type/Integer, :join-alias "Q2"}]]
                  :source-query {:source-table $$orders
                                 :aggregation  [[:aggregation-options [:count] {:name "count"}]]
                                 :breakout     [&P1.products.category
                                                &People.people.source]
                                 :order-by     [[:asc &P1.products.category]
                                                [:asc &People.people.source]]
                                 :joins        [{:strategy     :left-join
                                                 :source-table $$products
                                                 :condition    [:= $orders.product-id &P1.products.id]
                                                 :alias        "P1"}
                                                {:strategy     :left-join
                                                 :source-table $$people
                                                 :condition    [:= $orders.user-id &People.people.id]
                                                 :alias        "People"}]}
                  :joins        [{:source-query {:source-table $$reviews
                                                 :aggregation  [[:aggregation-options [:avg $reviews.rating] {:name "avg"}]]
                                                 :breakout     [&P2.products.category]
                                                 :joins        [{:strategy     :left-join
                                                                 :source-table $$products
                                                                 :condition    [:= $reviews.product-id &P2.products.id]
                                                                 :alias        "P2"}]}
                                  :alias        "Q2"
                                  :condition    [:= &P1.products.category #_$products.category &Q2.products.category]
                                  :strategy     :left-join}]
                  :limit        2})
               mbql->native
               sql.qp-test-util/sql->sql-map)))))

(deftest ^:parallel format-honeysql-test
  (are [honeysql expected] (= expected
                              (sql.qp/format-honeysql :sql honeysql))
    {:select [:*], :from [:table]} ["SELECT * FROM \"table\""]

    (h2x/identifier :field "A" "B") ["\"A\".\"B\""]

    ;; don't complain on 'suspicious' characters since we're quoting things anyway!
    (h2x/identifier :field "A;B") ["\"A;B\""]

    ;; but we should be escaping quotes.
    (h2x/identifier :field "A\"B") ["\"A\"\"B\""]

    ;; make sure kebab-case is preserved.
    (h2x/identifier :field "test-data") ["\"test-data\""]

    {:select [[(h2x/identifier :field "test-data") :a]]} ["SELECT \"test-data\" AS \"a\""]

    ;; Honey SQL 2 can't be configured to always inline numbers, so we have to remember to do it, otherwise it won't
    ;; do it for us =(
    [:= "A" 1] ["(? = ?)" "A" 1]

    [:or [:not= :state "OR"] [:= :state nil]] ["((\"state\" <> ?) OR (\"state\" IS NULL))" "OR"]))

(deftest day-of-week-inline-numbers-test
  (testing "Numbers should be returned inline, even when targeting Honey SQL 2."
    (mt/test-drivers (filter #(isa? driver/hierarchy (driver/the-driver %) :sql)
                             (tx.env/test-drivers))
      (mt/with-metadata-provider (mt/id)
        (doseq [day [:sunday
                     :monday
                     :tuesday
                     :wednesday
                     :thursday
                     :friday
                     :saturday]]
          (mt/with-temporary-setting-values [start-of-week day]
            (let [sql-args (-> (sql.qp/format-honeysql driver/*driver* (sql.qp/date driver/*driver* :day-of-week :x))
                               vec
                               (update 0 #(str/split-lines (driver/prettify-native-form driver/*driver* %))))]
              (testing "this query should not have any parameters"
                (is (mr/validate [:cat [:sequential :string]] sql-args))))))))))

(deftest ^:parallel binning-optimize-math-expressions-test
  (testing "Don't include nonsense like `+ 0.0` and `- 0.0` when generating expressions for binning"
    (is (= ["SELECT"
            "  FLOOR((ORDERS.QUANTITY / 10.0)) * 10.0 AS QUANTITY,"
            "  COUNT(*) AS count"
            "FROM"
            "  ORDERS"
            "GROUP BY"
            "  FLOOR((ORDERS.QUANTITY / 10.0)) * 10.0"
            "ORDER BY"
            "  FLOOR((ORDERS.QUANTITY / 10.0)) * 10.0 ASC"]
           (->> (mbql->native (lib.tu.macros/mbql-query orders
                                {:aggregation [[:count]]
                                 :breakout    [:binning-strategy $quantity :num-bins 10]}))
                (driver/prettify-native-form :h2)
                str/split-lines)))))

(deftest ^:parallel make-nestable-sql-test
  (testing "Native sql query should be modified to be usable in subselect"
    (are [raw nestable] (= nestable (sql.qp/make-nestable-sql raw))
      "SELECT ';' `x`; ; "
      "(SELECT ';' `x`)"

      "SELECT * FROM table\n-- remark"
      "(SELECT * FROM table\n-- remark\n)"

      ;; Comment, semicolon, comment, comment.
      "SELECT * from people -- people -- cool table\n ; -- cool query\n -- some notes on cool query"
      "(SELECT * from people -- people -- cool table\n)"

      ;; String containing semicolon, double dash and newline followed by NO _comment or semicolon or end of input_.
      "SELECT 'string with \n ; -- ends \n on new line';"
      "(SELECT 'string with \n ; -- ends \n on new line')"

      ;; String containing semicolon followed by double dash followed by THE _comment or semicolon or end of input_.
      ;; TODO: Enable when better sql parsing solution is found in the [[sql.qp/make-nestable-sql]]].
      ;; Tech debt issue: #39401
      #_#_"SELECT 'string with \n ; -- ending on the same line';"
        "(SELECT 'string with \n ; -- ending on the same line')"
      #_#_"SELECT 'string with \n ; -- ending on the same line';\n-- comment"
        "(SELECT 'string with \n ; -- ending on the same line')"

      ;; String containing just `--` without `;` works
      "SELECT 'string with \n -- ending on the same line';"
      "(SELECT 'string with \n -- ending on the same line'\n)"

      ;; String with just `;`
      "SELECT 'string with ; ending on the same line';"
      "(SELECT 'string with ; ending on the same line')"

      ;; Semicolon after comment after semicolon
      "SELECT ';';\n
      --c1\n
      ; --c2\n
      -- c3"
      "(SELECT ';')")))

(deftest ^:parallel string-inline-value-test
  (testing `String
    (let [honeysql {:select [[:%count.*]]
                    :from   [[:venues]]
                    :where  [:= :venues/name "Barney's Beanery"]}]
      (binding [driver/*compile-with-inline-parameters* true]
        (is (= ["SELECT COUNT(*) FROM \"venues\" WHERE \"venues\".\"name\" = 'Barney''s Beanery'"]
               (sql.qp/format-honeysql :sql honeysql)))))))

(deftest ^:parallel OffsetDateTime-inline-value-test
  (let [honeysql {:select [[:*]]
                  :from   [[:venues]]
                  :where  [:= :venues/created_at (t/offset-date-time "2017-01-01T00:00:00.000Z")]}]
    (binding [driver/*compile-with-inline-parameters* true]
      (is (= ["SELECT * FROM \"venues\" WHERE \"venues\".\"created_at\" = timestamp with time zone '2017-01-01 00:00:00.000 +00:00'"]
             (sql.qp/format-honeysql :sql honeysql))))))

(driver/register! ::inline-value-test, :parent :sql, :abstract? true)

(defmethod sql.qp/inline-value [::inline-value-test java.time.OffsetDateTime]
  [_driver t]
  (format "from_iso8601_timestamp('%s')" (u.date/format t)))

(deftest ^:parallel override-inline-value-test
  (let [honeysql {:select [[:*]]
                  :from   [[:venues]]
                  :where  [:= :venues/created_at (t/offset-date-time "2017-01-01T00:00:00.000Z")]}]
    (binding [driver/*compile-with-inline-parameters* true]
      (is (= ["SELECT * FROM \"venues\" WHERE \"venues\".\"created_at\" = from_iso8601_timestamp('2017-01-01T00:00:00Z')"]
             (sql.qp/format-honeysql ::inline-value-test honeysql))))))

(defmethod sql.qp/inline-value [::inline-value-test String]
  [_driver ^String s]
  (format "decode(unhex('%s'), 'utf-8')" (codecs/bytes->hex (.getBytes s "UTF-8"))))

(deftest ^:parallel override-inline-value-test-2
  (let [honeysql {:select [[:*]]
                  :from   [[:venues]]
                  :where  [:= :venues/name "ABC"]}]
    (binding [driver/*compile-with-inline-parameters* true]
      (is (= ["SELECT * FROM \"venues\" WHERE \"venues\".\"name\" = decode(unhex('414243'), 'utf-8')"]
             (sql.qp/format-honeysql ::inline-value-test honeysql))))))

(deftype ^:private MyString [s])

(defmethod sql.qp/inline-value [::inline-value-test MyString]
  [_driver _s]
  "[my-string]")

(deftest ^:parallel override-inline-value-arbitrary-type-test
  (let [honeysql {:select [[:*]]
                  :from   [[:venues]]
                  :where  [:= :venues/name (->MyString "ABC")]}]
    (binding [driver/*compile-with-inline-parameters* true]
      (is (= ["SELECT * FROM \"venues\" WHERE \"venues\".\"name\" = [my-string]"]
             (sql.qp/format-honeysql ::inline-value-test honeysql))))))

(deftest ^:parallel sort-by-cumulative-aggregation-test
  (testing "Sorting by expression containing cumulative aggregation should work (#57289)"
    (let [mp (mt/metadata-provider)
          query (as-> (lib/query mp (lib.metadata/table mp (mt/id :orders))) $
                  (lib/breakout $ (lib/with-temporal-bucket (lib.metadata/field mp (mt/id :orders :created_at))
                                    :month))
                  (lib/aggregate $ (lib/+
                                    (lib/cum-sum (lib.metadata/field mp (mt/id :orders :total)))
                                    (lib/cum-sum (lib.metadata/field mp (mt/id :orders :tax)))))
                  (lib/order-by $ (m/find-first (comp #{:source/aggregations} :lib/source) (lib/orderable-columns $)))
                  (lib/limit $ 1))]
      (is (= 55.98
             (->> (qp/process-query query) (mt/formatted-rows [str 2.0]) first second))))))

(deftest ^:parallel literal-float-test
  (doseq [{:keys [value expected type]} [{:value "1.2" :expected 1.2  :type "TEXT"}
                                         {:value 10    :expected 10.0 :type "BIGINT"}
                                         {:value 90.9  :expected 90.9 :type "DOUBLE"}]]
    (is (= [:inline expected]
           (h2x/unwrap-typed-honeysql-form
            (sql.qp/coerce-float :sql value))))
    (is (= [:inline expected]
           (h2x/unwrap-typed-honeysql-form
            (sql.qp/coerce-float :sql
                                 [:inline value]))))
    (is (= [:inline expected]
           (h2x/unwrap-typed-honeysql-form
            (sql.qp/coerce-float :sql
                                 (h2x/with-database-type-info [:inline value] type)))))
    (is (= [:inline expected]
           (h2x/unwrap-typed-honeysql-form
            (sql.qp/coerce-float :sql
                                 (h2x/with-database-type-info value type)))))))

(deftest ^:parallel literal-integer-test
  (doseq [{:keys [value expected type]} [{:value "1"  :expected 1  :type "TEXT"}
                                         {:value 10   :expected 10 :type "BIGINT"}
                                         {:value 10.9 :expected 11 :type "DOUBLE"}
                                         {:value 10.4 :expected 10 :type "DOUBLE"}]]
    (testing (str "Coercing " (pr-str value) " to integer.")
      (is (= [:inline expected]
             (h2x/unwrap-typed-honeysql-form
              (sql.qp/coerce-integer :sql value))))
      (is (= [:inline expected]
             (h2x/unwrap-typed-honeysql-form
              (sql.qp/coerce-integer :sql
                                     [:inline value]))))
      (is (= [:inline expected]
             (h2x/unwrap-typed-honeysql-form
              (sql.qp/coerce-integer :sql
                                     (h2x/with-database-type-info [:inline value] type)))))
      (is (= [:inline expected]
             (h2x/unwrap-typed-honeysql-form
              (sql.qp/coerce-integer :sql
                                     (h2x/with-database-type-info value type))))))))
