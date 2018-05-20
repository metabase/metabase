(ns metabase.query-processor-test.nested-queries-test
  "Tests for handling queries with nested expressions."
  (:require [clojure.string :as str]
            [expectations :refer [expect]]
            [honeysql.core :as hsql]
            [metabase
             [query-processor :as qp]
             [query-processor-test :refer :all]
             [util :as u]]
            [metabase.driver.generic-sql :as generic-sql]
            [metabase.models
             [card :as card :refer [Card]]
             [database :as database :refer [Database]]
             [field :refer [Field]]
             [permissions :as perms]
             [permissions-group :as perms-group]
             [segment :refer [Segment]]
             [table :refer [Table]]]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data
             [datasets :as datasets]
             [dataset-definitions :as defs]
             [users :refer [create-users-if-needed! user->client]]]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(defn- rows+cols
  "Return the `:rows` and relevant parts of `:cols` from the RESULTS.
   (This is used to keep the output of various tests below focused and manageable.)"
  {:style/indent 0}
  [results]
  {:rows (rows results)
   :cols (for [col (get-in results [:data :cols])]
           {:name      (str/lower-case (:name col))
            :base_type (:base_type col)})})


;; make sure we can do a basic query with MBQL source-query
(datasets/expect-with-engines (non-timeseries-engines-with-feature :nested-queries)
  {:rows [[1 "Red Medicine"                  4 10.0646 -165.374 3]
          [2 "Stout Burgers & Beers"        11 34.0996 -118.329 2]
          [3 "The Apple Pan"                11 34.0406 -118.428 2]
          [4 "Wurstküche"                   29 33.9997 -118.465 2]
          [5 "Brite Spot Family Restaurant" 20 34.0778 -118.261 2]]
   :cols [{:name "id",          :base_type (data/id-field-type)}
          {:name "name",        :base_type :type/Text}
          {:name "category_id", :base_type (data/expected-base-type->actual :type/Integer)}
          {:name "latitude",    :base_type :type/Float}
          {:name "longitude",   :base_type :type/Float}
          {:name "price",       :base_type (data/expected-base-type->actual :type/Integer)}]}
  (format-rows-by [int str int (partial u/round-to-decimals 4) (partial u/round-to-decimals 4) int]
    (rows+cols
      (qp/process-query
        {:database (data/id)
         :type     :query
         :query    {:source-query {:source-table (data/id :venues)
                                   :order-by     [:asc (data/id :venues :id)]
                                   :limit        10}
                    :limit        5}}))))

;; TODO - `identifier`, `quoted-identifier` might belong in some sort of shared util namespace
(defn- identifier
  "Return a properly formatted *UNQUOTED* identifier for a Table or Field.
  (This handles DBs like H2 who require uppercase identifiers, or databases like Redshift do clever hacks
   like prefixing table names with a unique schema for each test run because we're not
   allowed to create new databases.)"
  (^String [table-kw]
   (let [{schema :schema, table-name :name} (db/select-one [Table :name :schema] :id (data/id table-kw))]
     (name (hsql/qualify schema table-name))))
  (^String [table-kw field-kw]
   (db/select-one-field :name Field :id (data/id table-kw field-kw))))

(defn- quote-identifier [identifier]
  (first (hsql/format (keyword identifier)
           :quoting (generic-sql/quote-style datasets/*driver*))))

(def ^:private ^{:arglists '([table-kw] [table-kw field-kw])} ^String quoted-identifier
  "Return a *QUOTED* identifier for a Table or Field. (This behaves just like `identifier`, but quotes the result)."
  (comp quote-identifier identifier))

;; make sure we can do a basic query with a SQL source-query
(datasets/expect-with-engines (non-timeseries-engines-with-feature :nested-queries)
  {:rows [[1 -165.374  4 3 "Red Medicine"                 10.0646]
          [2 -118.329 11 2 "Stout Burgers & Beers"        34.0996]
          [3 -118.428 11 2 "The Apple Pan"                34.0406]
          [4 -118.465 29 2 "Wurstküche"                   33.9997]
          [5 -118.261 20 2 "Brite Spot Family Restaurant" 34.0778]]
   :cols [{:name "id",          :base_type :type/Integer}
          {:name "longitude",   :base_type :type/Float}
          {:name "category_id", :base_type (data/expected-base-type->actual :type/Integer)}
          {:name "price",       :base_type (data/expected-base-type->actual :type/Integer)}
          {:name "name",        :base_type :type/Text}
          {:name "latitude",    :base_type :type/Float}]}
  (format-rows-by [int (partial u/round-to-decimals 4) int int str (partial u/round-to-decimals 4)]
    (rows+cols
      (qp/process-query
        {:database (data/id)
         :type     :query
         :query    {:source-query {:native (format "SELECT %s, %s, %s, %s, %s, %s FROM %s"
                                                   (quoted-identifier :venues :id)
                                                   (quoted-identifier :venues :longitude)
                                                   (quoted-identifier :venues :category_id)
                                                   (quoted-identifier :venues :price)
                                                   (quoted-identifier :venues :name)
                                                   (quoted-identifier :venues :latitude)
                                                   (quoted-identifier :venues))}
                    :order-by     [:asc [:field-literal (keyword (data/format-name :id)) :type/Integer]]
                    :limit        5}}))))


(def ^:private ^:const breakout-results
  {:rows [[1 22]
          [2 59]
          [3 13]
          [4  6]]
   :cols [{:name "price", :base_type :type/Integer}
          {:name "count", :base_type :type/Integer}]})

;; make sure we can do a query with breakout and aggregation using an MBQL source query
(datasets/expect-with-engines (non-timeseries-engines-with-feature :nested-queries)
  breakout-results
  (rows+cols
    (format-rows-by [int int]
      (qp/process-query
        {:database (data/id)
         :type     :query
         :query    {:source-query {:source-table (data/id :venues)}
                    :aggregation  [:count]
                    :breakout     [[:field-literal (keyword (data/format-name :price)) :type/Integer]]}}))))

;; make sure we can do a query with breakout and aggregation using a SQL source query
(datasets/expect-with-engines (non-timeseries-engines-with-feature :nested-queries)
  breakout-results
  (rows+cols
    (format-rows-by [int int]
      (qp/process-query
        {:database (data/id)
         :type     :query
         :query    {:source-query {:native (format "SELECT * FROM %s" (quoted-identifier :venues))}
                    :aggregation  [:count]
                    :breakout     [[:field-literal (keyword (data/format-name :price)) :type/Integer]]}}))))


(defn- mbql-card-def
  "Basic MBQL Card definition. Pass kv-pair clauses for the inner query."
  {:style/indent 0}
  [& {:as clauses}]
  {:dataset_query {:database (data/id)
                   :type     :query
                   :query    clauses}})

(defn- venues-mbql-card-def
  "A basic Card definition that returns raw data for the venues test table.
   Pass additional kv-pair clauses for the inner query as needed."
  {:style/indent 0}
  [& additional-clauses]
  (apply mbql-card-def :source-table (data/id :venues) additional-clauses))


(defn- query-with-source-card {:style/indent 1} [card & {:as additional-clauses}]
  {:database database/virtual-id
   :type     :query
   :query    (merge {:source-table (str "card__" (u/get-id card))}
                    additional-clauses)})

;; Make sure we can run queries using source table `card__id` format. This is the format that is actually used by the frontend;
;; it gets translated to the normal `source-query` format by middleware. It's provided as a convenience so only minimal changes
;; need to be made to the frontend.
(expect
  breakout-results
  (tt/with-temp Card [card (venues-mbql-card-def)]
    (rows+cols
      (format-rows-by [int int]
        (qp/process-query
          (query-with-source-card card
            :aggregation [:count]
            :breakout    [[:field-literal (keyword (data/format-name :price)) :type/Integer]]))))))

;; make sure `card__id`-style queries work with native source queries as well
(expect
  breakout-results
  (tt/with-temp Card [card {:dataset_query {:database (data/id)
                                            :type     :native
                                            :native   {:query "SELECT * FROM VENUES"}}}]
    (rows+cols
      (format-rows-by [int int]
        (qp/process-query
          (query-with-source-card card
            :aggregation [:count]
            :breakout    [[:field-literal (keyword (data/format-name :price)) :type/Integer]]))))))

;; Ensure trailing comments are trimmed and don't cause a wrapping SQL query to fail
(expect
  breakout-results
  (tt/with-temp Card [card {:dataset_query {:database (data/id)
                                            :type     :native
                                            :native   {:query "SELECT * FROM VENUES -- small comment here"}}}]
    (rows+cols
      (format-rows-by [int int]
        (qp/process-query
          (query-with-source-card card
            :aggregation [:count]
            :breakout    [[:field-literal (keyword (data/format-name :price)) :type/Integer]]))))))

;; Ensure trailing comments followed by a newline are trimmed and don't cause a wrapping SQL query to fail
(expect
  breakout-results
  (tt/with-temp Card [card {:dataset_query {:database (data/id)
                                            :type     :native
                                            :native   {:query "SELECT * FROM VENUES -- small comment here\n"}}}]
    (rows+cols
      (format-rows-by [int int]
        (qp/process-query
          (query-with-source-card card
            :aggregation [:count]
            :breakout    [[:field-literal (keyword (data/format-name :price)) :type/Integer]]))))))


;; make sure we can filter by a field literal
(expect
  {:rows [[1 "Red Medicine" 4 10.0646 -165.374 3]]
   :cols [{:name "id",          :base_type :type/BigInteger}
          {:name "name",        :base_type :type/Text}
          {:name "category_id", :base_type :type/Integer}
          {:name "latitude",    :base_type :type/Float}
          {:name "longitude",   :base_type :type/Float}
          {:name "price",       :base_type :type/Integer}]}
  (rows+cols
    (qp/process-query
      {:database (data/id)
       :type     :query
       :query    {:source-query {:source-table (data/id :venues)}
                  :filter       [:= [:field-literal (data/format-name :id) :type/Integer] 1]}})))

(def ^:private ^:const ^String venues-source-sql
  (str "(SELECT \"PUBLIC\".\"VENUES\".\"ID\" AS \"ID\", \"PUBLIC\".\"VENUES\".\"NAME\" AS \"NAME\", "
       "\"PUBLIC\".\"VENUES\".\"CATEGORY_ID\" AS \"CATEGORY_ID\", \"PUBLIC\".\"VENUES\".\"LATITUDE\" AS \"LATITUDE\", "
       "\"PUBLIC\".\"VENUES\".\"LONGITUDE\" AS \"LONGITUDE\", \"PUBLIC\".\"VENUES\".\"PRICE\" AS \"PRICE\" FROM \"PUBLIC\".\"VENUES\") \"source\""))

;; make sure that dots in field literal identifiers get escaped so you can't reference fields from other tables using them
(expect
  {:query  (format "SELECT * FROM %s WHERE \"BIRD.ID\" = 1 LIMIT 10" venues-source-sql)
   :params nil}
  (qp/query->native
    {:database (data/id)
     :type     :query
     :query    {:source-query {:source-table (data/id :venues)}
                :filter       [:= [:field-literal :BIRD.ID :type/Integer] 1]
                :limit        10}}))

;; make sure that field-literals work as DateTimeFields
(expect
  {:query  (str "SELECT * "
                (format "FROM %s " venues-source-sql)
                "WHERE parsedatetime(formatdatetime(\"BIRD.ID\", 'YYYYww'), 'YYYYww') = parsedatetime(formatdatetime(?, 'YYYYww'), 'YYYYww') "
                "LIMIT 10")
   :params [#inst "2017-01-01T00:00:00.000000000-00:00"]}
  (qp/query->native
    {:database (data/id)
     :type     :query
     :query    {:source-query {:source-table (data/id :venues)}
                :filter       [:= [:datetime-field [:field-literal :BIRD.ID :type/DateTime] :week] "2017-01-01"]
                :limit        10}}))

;; make sure that aggregation references match up to aggregations from the same level they're from
;; e.g. the ORDER BY in the source-query should refer the 'stddev' aggregation, NOT the 'avg' aggregation
(expect
  {:query (str "SELECT avg(\"stddev\") AS \"avg\" FROM ("
                   "SELECT STDDEV(\"PUBLIC\".\"VENUES\".\"ID\") AS \"stddev\", \"PUBLIC\".\"VENUES\".\"PRICE\" AS \"PRICE\" "
                   "FROM \"PUBLIC\".\"VENUES\" "
                   "GROUP BY \"PUBLIC\".\"VENUES\".\"PRICE\" "
                   "ORDER BY \"stddev\" DESC, \"PUBLIC\".\"VENUES\".\"PRICE\" ASC"
               ") \"source\"")
   :params nil}
  (qp/query->native
    {:database (data/id)
     :type     :query
     :query    {:source-query {:source-table (data/id :venues)
                               :aggregation  [[:stddev [:field-id (data/id :venues :id)]]]
                               :breakout     [[:field-id (data/id :venues :price)]]
                               :order-by     [[[:aggregate-field 0] :descending]]}
                :aggregation  [[:avg [:field-literal "stddev" :type/Integer]]]}}))

;; make sure that we handle [field-id [field-literal ...]] forms gracefully, despite that not making any sense
(expect
  {:query  (format "SELECT \"category_id\" AS \"category_id\" FROM %s GROUP BY \"category_id\" ORDER BY \"category_id\" ASC LIMIT 10" venues-source-sql)
   :params nil}
  (qp/query->native
    {:database (data/id)
     :type     :query
     :query    {:source-query {:source-table (data/id :venues)}
                :breakout     [:field-id [:field-literal "category_id" :type/Integer]]
                :limit        10}}))

;; Make sure we can filter by string fields
(expect
  {:query  (format "SELECT * FROM %s WHERE \"text\" <> ? LIMIT 10" venues-source-sql)
   :params ["Coo"]}
  (qp/query->native {:database (data/id)
                     :type     :query
                     :query    {:source-query {:source-table (data/id :venues)}
                                :limit        10
                                :filter       [:!= [:field-literal "text" :type/Text] "Coo"]}}))

;; Make sure we can filter by number fields
(expect
  {:query  (format "SELECT * FROM %s WHERE \"sender_id\" > 3 LIMIT 10" venues-source-sql)
   :params nil}
  (qp/query->native {:database (data/id)
                     :type     :query
                     :query    {:source-query {:source-table (data/id :venues)}
                                :limit        10
                                :filter       [:> [:field-literal "sender_id" :type/Integer] 3]}}))

;; make sure using a native query with default params as a source works
(expect
  {:query  "SELECT * FROM (SELECT * FROM PRODUCTS WHERE CATEGORY = 'Widget' LIMIT 10) \"source\" LIMIT 1048576",
   :params nil}
  (tt/with-temp Card [card {:dataset_query {:database (data/id)
                                            :type     :native
                                            :native   {:query         "SELECT * FROM PRODUCTS WHERE CATEGORY = {{category}} LIMIT 10"
                                                       :template_tags {:category {:name         "category"
                                                                                  :display_name "Category"
                                                                                  :type         "text"
                                                                                  :required     true
                                                                                  :default      "Widget"}}}}}]
    (qp/query->native
      {:database (data/id)
       :type     :query
       :query    {:source-table (str "card__" (u/get-id card))}})))

(defn results-metadata {:style/indent 0} [results]
  (for [col (get-in results [:data :cols])]
    (u/select-non-nil-keys col [:base_type :display_name :id :name :source :special_type :table_id :unit :datetime-unit])))

;; make sure a query using a source query comes back with the correct columns metadata
(expect
  [{:base_type    :type/BigInteger
    :display_name "ID"
    :id           [:field-literal "ID" :type/BigInteger]
    :name         "ID"
    :source       :fields
    :special_type :type/PK
    :table_id     (data/id :venues)}
   {:base_type    :type/Text
    :display_name "Name"
    :id           [:field-literal "NAME" :type/Text]
    :name         "NAME"
    :source       :fields
    :special_type :type/Name
    :table_id     (data/id :venues)}
   {:base_type    :type/Integer
    :display_name "Category ID"
    :id           [:field-literal "CATEGORY_ID" :type/Integer]
    :name         "CATEGORY_ID"
    :source       :fields
    :special_type :type/FK
    :table_id     (data/id :venues)}
   {:base_type    :type/Float
    :display_name "Latitude"
    :id           [:field-literal "LATITUDE" :type/Float]
    :name         "LATITUDE"
    :source       :fields
    :special_type :type/Latitude
    :table_id     (data/id :venues)}
   {:base_type    :type/Float
    :display_name "Longitude"
    :id           [:field-literal "LONGITUDE" :type/Float]
    :name         "LONGITUDE"
    :source       :fields
    :special_type :type/Longitude
    :table_id     (data/id :venues)}
   {:base_type    :type/Integer
    :display_name "Price"
    :id           [:field-literal "PRICE" :type/Integer]
    :name         "PRICE"
    :source       :fields
    :special_type :type/Category
    :table_id     (data/id :venues)}]
  (-> (tt/with-temp Card [card (venues-mbql-card-def)]
        (qp/process-query (query-with-source-card card)))
      results-metadata))

;; make sure a breakout/aggregate query using a source query comes back with the correct columns metadata
(expect
  [{:base_type    :type/Text
    :id           [:field-literal "PRICE" :type/Text]
    :name         "PRICE"
    :display_name "Price"
    :source       :breakout}
   {:base_type    :type/Integer
    :display_name "count"
    :name         "count"
    :source       :aggregation
    :special_type :type/Number}]
  (-> (tt/with-temp Card [card (venues-mbql-card-def)]
        (qp/process-query (query-with-source-card card
                            :aggregation  [[:count]]
                            :breakout     [[:field-literal "PRICE" :type/Text]])))
      results-metadata))

;; make sure nested queries return the right columns metadata for SQL source queries and datetime breakouts
(expect
  [{:base_type    :type/DateTime
    :display_name "Date"
    :id           [:field-literal "DATE" :type/DateTime]
    :name         "DATE"
    :source       :breakout
    :unit         :day}
   {:base_type    :type/Integer
    :display_name "count"
    :name         "count"
    :source       :aggregation
    :special_type :type/Number}]
  (-> (tt/with-temp Card [card {:dataset_query {:database (data/id)
                                                :type     :native
                                                :native   {:query "SELECT * FROM CHECKINS"}}}]
        (qp/process-query (query-with-source-card card
                            :aggregation  [[:count]]
                            :breakout     [[:datetime-field [:field-literal "DATE" :type/DateTime] :day]])))
      results-metadata))

;; make sure when doing a nested query we give you metadata that would suggest you should be able to break out a *YEAR*
(expect
  [{:base_type    :type/Text
    :display_name "Date"
    :id           [:field-literal "DATE" :type/Text]
    :name         "DATE"
    :source       :breakout
    :table_id     (data/id :checkins)}
   {:base_type    :type/Integer
    :display_name "Count"
    :id           [:field-literal :count :type/Integer]
    :name         "count"
    :source       :fields}]
  (-> (tt/with-temp Card [card (mbql-card-def
                                 :source-table (data/id :checkins)
                                 :aggregation  [[:count]]
                                 :breakout     [[:datetime-field [:field-id (data/id :checkins :date)] :year]])]
        (qp/process-query (query-with-source-card card)))
      results-metadata))

;; make sure using a time interval filter works
(datasets/expect-with-engines (non-timeseries-engines-with-feature :nested-queries)
  :completed
  (tt/with-temp Card [card (mbql-card-def
                             :source-table (data/id :checkins))]
    (-> (query-with-source-card card
          :filter [:time-interval [:field-literal (identifier :checkins :date) :type/DateTime] -30 :day])
        qp/process-query
        :status)))

;; make sure that wrapping a field literal in a datetime-field clause works correctly in filters & breakouts
(datasets/expect-with-engines (non-timeseries-engines-with-feature :nested-queries)
  :completed
  (tt/with-temp Card [card (mbql-card-def
                             :source-table (data/id :checkins))]
    (-> (query-with-source-card card
          :aggregation [[:count]]
          :filter      [:= [:datetime-field [:field-literal (identifier :checkins :date) :type/Date] :quarter] "2014-01-01T08:00:00.000Z"]
          :breakout    [[:datetime-field [:field-literal (identifier :checkins :date) :type/Date] :month]])
        qp/process-query
        :status)))

;; make sure timeseries queries generated by "drag-to-filter" work correctly
(expect
  :completed
  (tt/with-temp Card [card (mbql-card-def
                             :source-table (data/id :checkins))]
    (-> (query-with-source-card card
          :aggregation [[:count]]
          :breakout    [[:datetime-field [:field-literal "DATE" :type/Date] :week]]
          :filter      [:between
                        [:datetime-field [:field-literal "DATE" :type/Date] :month]
                        "2014-02-01T00:00:00-08:00"
                        "2014-05-01T00:00:00-07:00"])
        qp/process-query
        :status)))

;; Make sure that macro expansion works inside of a neested query, when using a compound filter clause (#5974)
(expect
  [[22]]
  (tt/with-temp* [Segment [segment {:table_id   (data/id :venues)
                                    :definition {:filter [:= (data/id :venues :price) 1]}}]
                  Card    [card (mbql-card-def
                                  :source-table (data/id :venues)
                                  :filter       [:and [:segment (u/get-id segment)]])]]
    (-> (query-with-source-card card
          :aggregation [:count])
        qp/process-query
        rows)))


;; Make suer you're allowed to save a query that uses a SQL-based source query even if you don't have SQL *write*
;; permissions (#6845)

;; Check that write perms for a Card with a source query require that you are able to *read* (i.e., view) the source
;; query rather than be able to write (i.e., save) it. For example you should be able to save a query that uses a
;; native query as its source query if you have permissions to view that query, even if you aren't allowed to create
;; new ad-hoc SQL queries yourself.
(expect
 #{(perms/native-read-path (data/id))}
 (tt/with-temp Card [card {:dataset_query {:database (data/id)
                                           :type     :native
                                           :native   {:query "SELECT * FROM VENUES"}}}]
   (card/query-perms-set (query-with-source-card card :aggregation [:count]) :write)))

;; try this in an end-to-end fashion using the API and make sure we can save a Card if we have appropriate read
;; permissions for the source query
(defn- do-with-temp-copy-of-test-db
  "Run `f` with a temporary Database that copies the details from the standard test database. `f` is invoked as `(f
  db)`."
  [f]
  (data/with-db (data/get-or-create-database! defs/test-data)
    (create-users-if-needed!)
    (tt/with-temp Database [db {:details (:details (data/db)), :engine "h2"}]
      (f db))))

(defn- save-card-via-API-with-native-source-query!
  "Attempt to save a Card that uses a native source query for Database with `db-id` via the API using Rasta. Use this to
  test how the API endpoint behaves based on certain permissions grants for the `All Users` group."
  [expected-status-code db-id]
  (tt/with-temp Card [card {:dataset_query {:database db-id
                                            :type     :native
                                            :native   {:query "SELECT * FROM VENUES"}}}]
    ((user->client :rasta) :post expected-status-code "card"
     {:name                   (tu/random-name)
      :display                "scalar"
      :visualization_settings {}
      :dataset_query          (query-with-source-card card
                                :aggregation [:count])})))

;; ok... grant native *read* permissions which means we should be able to view our source query generated with the
;; function above. API should allow use to save here because write permissions for a query require read permissions
;; for any source queries
(expect
  :ok
  (do-with-temp-copy-of-test-db
   (fn [db]
     (perms/revoke-permissions! (perms-group/all-users) (u/get-id db))
     (perms/grant-permissions! (perms-group/all-users) (perms/native-read-path (u/get-id db)))
     (save-card-via-API-with-native-source-query! 200 (u/get-id db))
     :ok)))

;; however, if we do *not* have read permissions for the source query, we shouldn't be allowed to save the query. This
;; API call should fail
(expect
  "You don't have permissions to do that."
  (do-with-temp-copy-of-test-db
   (fn [db]
     (perms/revoke-permissions! (perms-group/all-users) (u/get-id db))
     (save-card-via-API-with-native-source-query! 403 (u/get-id db)))))
