(ns metabase.driver.sql.query-processor-test
  (:require [clojure.test :refer :all]
            [honeysql.core :as hsql]
            [metabase
             [driver :as driver]
             [test :as mt]]
            [metabase.driver.sql.query-processor :as sql.qp]
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
                                [:value "BBQ" {:base_type :type/Text, :special_type :type/Name, :database_type "VARCHAR"}]]
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
        (is (= {:select    [[(bound-alias "v" (id :field "v" "NAME")) (bound-alias :source (id :field-alias "NAME"))]
                            [:%count.*                                (bound-alias :source (id :field-alias "count"))]]
                :from      [[{:select [[(id :field "PUBLIC" "CHECKINS" "ID")       (id :field-alias "ID")]
                                       [(id :field "PUBLIC" "CHECKINS" "DATE")     (id :field-alias "DATE")]
                                       [(id :field "PUBLIC" "CHECKINS" "USER_ID")  (id :field-alias "USER_ID")]
                                       [(id :field "PUBLIC" "CHECKINS" "VENUE_ID") (id :field-alias "VENUE_ID")]]
                              :from   [(id :table "PUBLIC" "CHECKINS")]
                              :where  [:>
                                       (id :field "PUBLIC" "CHECKINS" "DATE")
                                       #t "2015-01-01T00:00:00.000-00:00"]}
                             (id :table-alias "source")]]
                :left-join [[(id :table "PUBLIC" "VENUES") (bound-alias :source (id :table-alias "v"))]
                            [:=
                             (bound-alias :source (id :field "source" "VENUE_ID"))
                             (bound-alias "v" (id :field "v" "ID"))]],

                :group-by  [(bound-alias "v" (id :field "v" "NAME"))]
                :where     [:and
                            [:like (bound-alias "v" (id :field "v" "NAME")) "F%"]
                            [:> (bound-alias :source (id :field "source" "user_id")) 0]],
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
                                                  [:value "F" {:base_type :type/Text, :special_type :type/Name, :database_type "VARCHAR"}]]
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
        (is (= {:query  "SELECT \"source\".* FROM (SELECT * FROM some_table WHERE name = ?) \"source\" WHERE \"source\".\"name\" <> ?"
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
                 (hx/identifier :field "card" "id")]]
               (sql.qp/join->honeysql :h2
                 (mt/$ids checkins
                   {:source-query {:native "SELECT * FROM VENUES;", :params []}
                    :alias        "card"
                    :strategy     :left-join
                    :condition    [:= $venue_id &card.*id/Integer]}))))))))

(deftest compile-honeysql-test
  (testing "make sure the generated HoneySQL will compile to the correct SQL"
    (is (= ["INNER JOIN (SELECT * FROM VENUES) card ON PUBLIC.CHECKINS.VENUE_ID = card.id"]
           (hsql/format {:join (mt/with-everything-store
                                 (driver/with-driver :h2
                                   (sql.qp/join->honeysql :h2
                                     (mt/$ids checkins
                                       {:source-query {:native "SELECT * FROM VENUES;", :params []}
                                        :alias        "card"
                                        :strategy     :left-join
                                        :condition    [:= $venue_id &card.*id/Integer]}))))})))))
