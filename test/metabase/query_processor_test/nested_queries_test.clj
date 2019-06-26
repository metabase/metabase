(ns metabase.query-processor-test.nested-queries-test
  "Tests for handling queries with nested expressions."
  (:require [clojure.string :as str]
            [expectations :refer [expect]]
            [honeysql.core :as hsql]
            [metabase
             [driver :as driver]
             [query-processor :as qp]
             [query-processor-test :as qp.test]
             [util :as u]]
            [metabase.mbql.schema :as mbql.s]
            [metabase.models
             [card :as card :refer [Card]]
             [collection :as collection :refer [Collection]]
             [field :refer [Field]]
             [permissions :as perms]
             [permissions-group :as group]
             [segment :refer [Segment]]]
            [metabase.models.query.permissions :as query-perms]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data
             [datasets :as datasets]
             [users :refer [user->client]]]
            [metabase.util.honeysql-extensions :as hx]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(defn- rows+cols
  "Return the `:rows` and relevant parts of `:cols` from the `results`.
   (This is used to keep the output of various tests below focused and manageable.)"
  {:style/indent 0}
  [results]
  {:rows (qp.test/rows results)
   :cols (for [col (get-in results [:data :cols])]
           {:name      (str/lower-case (:name col))
            :base_type (:base_type col)})})


;; make sure we can do a basic query with MBQL source-query
(datasets/expect-with-drivers (qp.test/non-timeseries-drivers-with-feature :nested-queries)
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
  (qp.test/format-rows-by [int str int (partial u/round-to-decimals 4) (partial u/round-to-decimals 4) int]
    (rows+cols
     (qp/process-query
       {:database (data/id)
        :type     :query
        :query    {:source-query {:source-table (data/id :venues)
                                  :order-by     [[:asc (data/id :venues :id)]]
                                  :limit        10}
                   :limit        5}}))))

;; make sure we can do a basic query with a SQL source-query
(datasets/expect-with-drivers (qp.test/non-timeseries-drivers-with-feature :nested-queries)
  {:rows [[1 -165.374  4 3 "Red Medicine"                 10.0646]
          [2 -118.329 11 2 "Stout Burgers & Beers"        34.0996]
          [3 -118.428 11 2 "The Apple Pan"                34.0406]
          [4 -118.465 29 2 "Wurstküche"                   33.9997]
          [5 -118.261 20 2 "Brite Spot Family Restaurant" 34.0778]]
   ;; Oracle doesn't have Integer types, they always come back as DECIMAL
   :cols [{:name "id",          :base_type (case driver/*driver* :oracle :type/Decimal :type/Integer)}
          {:name "longitude",   :base_type :type/Float}
          {:name "category_id", :base_type (case driver/*driver* :oracle :type/Decimal :type/Integer)}
          {:name "price",       :base_type (case driver/*driver* :oracle :type/Decimal :type/Integer)}
          {:name "name",        :base_type :type/Text}
          {:name "latitude",    :base_type :type/Float}]}
  (qp.test/format-rows-by [int (partial u/round-to-decimals 4) int int str (partial u/round-to-decimals 4)]
    (rows+cols
     (qp/process-query
       {:database (data/id)
        :type     :query
        :query    {:source-query {:native (:query
                                           (qp/query->native
                                             (data/mbql-query venues
                                               {:fields [[:field-id $id]
                                                         [:field-id $longitude]
                                                         [:field-id $category_id]
                                                         [:field-id $price]
                                                         [:field-id $name]
                                                         [:field-id $latitude]]})))}
                   :order-by     [[:asc [:field-literal (data/format-name :id) :type/Integer]]]
                   :limit        5}}))))


(def ^:private breakout-results
  {:rows [[1 22]
          [2 59]
          [3 13]
          [4  6]]
   :cols [{:name "price", :base_type :type/Integer}
          {:name "count", :base_type :type/Integer}]})

;; make sure we can do a query with breakout and aggregation using an MBQL source query
(datasets/expect-with-drivers (qp.test/non-timeseries-drivers-with-feature :nested-queries)
  breakout-results
  (rows+cols
   (qp.test/format-rows-by [int int]
     (qp/process-query
       {:database (data/id)
        :type     :query
        :query    {:source-query {:source-table (data/id :venues)}
                   :aggregation  [:count]
                   :breakout     [[:field-literal (keyword (data/format-name :price)) :type/Integer]]}}))))

;; Test including a breakout of a nested query column that follows an FK
(datasets/expect-with-drivers (qp.test/non-timeseries-drivers-with-feature :nested-queries :foreign-keys)
  {:rows [[1 174] [2 474] [3 78] [4 39]]
   :cols [{:name "price", :base_type (data/expected-base-type->actual :type/Integer)}
          {:name "count", :base_type :type/Integer}]}
  (rows+cols
   (qp.test/format-rows-by [int int]
     (qp/process-query
       {:database (data/id)
        :type     :query
        :query    {:source-query {:source-table (data/id :checkins)
                                  :filter       [:> (data/id :checkins :date) "2014-01-01"]}
                   :aggregation  [:count]
                   :order-by     [[:asc [:fk-> (data/id :checkins :venue_id) (data/id :venues :price)]]]
                   :breakout     [[:fk-> (data/id :checkins :venue_id) (data/id :venues :price)]]}}))))


;; Test two breakout columns from the nested query, both following an FK
(datasets/expect-with-drivers (qp.test/non-timeseries-drivers-with-feature :nested-queries :foreign-keys)
  {:rows [[2 33.7701 7]
          [2 33.8894 8]
          [2 33.9997 7]
          [3 10.0646 2]
          [4 33.983 2]],
   :cols [{:name "price", :base_type (data/expected-base-type->actual :type/Integer)}
          {:name "latitude", :base_type :type/Float}
          {:name "count", :base_type :type/Integer}]}
  (rows+cols
   (qp.test/format-rows-by [int (partial u/round-to-decimals 4) int]
     (qp/process-query
       {:database (data/id)
        :type     :query
        :query    {:source-query {:source-table (data/id :checkins)
                                  :filter       [:> (data/id :checkins :date) "2014-01-01"]}
                   :filter       [:< [:fk-> (data/id :checkins :venue_id) (data/id :venues :latitude)] 34]
                   :aggregation  [:count]
                   :order-by     [[:asc [:fk-> (data/id :checkins :venue_id) (data/id :venues :price)]]]
                   :breakout     [[:fk-> (data/id :checkins :venue_id) (data/id :venues :price)]
                                  [:fk-> (data/id :checkins :venue_id) (data/id :venues :latitude)]]}}))))

;; Test two breakout columns from the nested query, one following an FK the other from the source table
(datasets/expect-with-drivers (qp.test/non-timeseries-drivers-with-feature :nested-queries :foreign-keys)
  {:rows [[1 1 6]
          [1 2 14]
          [1 3 13]
          [1 4 8]
          [1 5 10]],
   :cols [{:name "price",   :base_type (data/expected-base-type->actual :type/Integer)}
          {:name "user_id", :base_type :type/Integer}
          {:name "count",   :base_type :type/Integer}]}
  (rows+cols
    (qp.test/format-rows-by [int int int]
      (qp/process-query
        {:database (data/id)
         :type     :query
         :query    {:source-query {:source-table (data/id :checkins)
                                   :filter       [:> (data/id :checkins :date) "2014-01-01"]}
                    :aggregation  [:count]
                    :filter       [:= [:fk-> (data/id :checkins :venue_id) (data/id :venues :price)] 1]
                    :order-by     [[:asc [:fk-> (data/id :checkins :venue_id) (data/id :venues :price)]]]
                    :breakout     [[:fk-> (data/id :checkins :venue_id) (data/id :venues :price)]
                                   [:field-literal (keyword (data/format-name :user_id)) :type/Integer]]
                    :limit        5}}))))

;; make sure we can do a query with breakout and aggregation using a SQL source query
(datasets/expect-with-drivers (qp.test/non-timeseries-drivers-with-feature :nested-queries)
  breakout-results
  (rows+cols
   (qp.test/format-rows-by [int int]
     (qp/process-query
       {:database (data/id)
        :type     :query
        :query    {:source-query {:native (:query (qp/query->native (data/mbql-query venues)))}
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
  {:database mbql.s/saved-questions-virtual-database-id
   :type     :query
   :query    (merge {:source-table (str "card__" (u/get-id card))}
                    additional-clauses)})

;; Make sure we can run queries using source table `card__id` format. This is the format that is actually used by the
;; frontend; it gets translated to the normal `source-query` format by middleware. It's provided as a convenience so
;; only minimal changes need to be made to the frontend.
(expect
  breakout-results
  (tt/with-temp Card [card (venues-mbql-card-def)]
    (rows+cols
     (qp.test/format-rows-by [int int]
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
     (qp.test/format-rows-by [int int]
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
     (qp.test/format-rows-by [int int]
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
     (qp.test/format-rows-by [int int]
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

(defn- honeysql->sql
  "Convert `honeysql-form` to the format returned by `query->native`. Writing HoneySQL is a lot easier that writing
  giant SQL strings for the 'expected' part of the tests below."
  [honeysql-form]
  (let [[sql & params] (hsql/format honeysql-form :quoting :ansi)]
    {:query  sql
     :params (seq params)}))

(def ^:private venues-source-honeysql
  {:select [[:PUBLIC.VENUES.ID :ID]
            [:PUBLIC.VENUES.NAME :NAME]
            [:PUBLIC.VENUES.CATEGORY_ID :CATEGORY_ID]
            [:PUBLIC.VENUES.LATITUDE :LATITUDE]
            [:PUBLIC.VENUES.LONGITUDE :LONGITUDE]
            [:PUBLIC.VENUES.PRICE :PRICE]]
   :from   [:PUBLIC.VENUES]})

;; make sure that dots in field literal identifiers get handled properly so you can't reference fields from other
;; tables using them
(expect
  (honeysql->sql
   {:select [[:source.ID :ID]
             [:source.NAME :NAME]
             [:source.CATEGORY_ID :CATEGORY_ID]
             [:source.LATITUDE :LATITUDE]
             [:source.LONGITUDE :LONGITUDE]
             [:source.PRICE :PRICE]]
    :from   [[venues-source-honeysql :source]]
    :where  [:= (hsql/raw "\"source\".\"BIRD.ID\"") 1]
    :limit  10})
  (qp/query->native
    {:database (data/id)
     :type     :query
     :query    {:source-query {:source-table (data/id :venues)}
                :filter       [:= [:field-literal :BIRD.ID :type/Integer] 1]
                :limit        10}}))

;; make sure that field-literals work as DateTimeFields
(expect
  (honeysql->sql
   {:select [[:source.ID :ID]
             [:source.NAME :NAME]
             [:source.CATEGORY_ID :CATEGORY_ID]
             [:source.LATITUDE :LATITUDE]
             [:source.LONGITUDE :LONGITUDE]
             [:source.PRICE :PRICE]]
    :from   [[venues-source-honeysql :source]]
    :where  (let [week (let [format-str (hx/literal "YYYYww")]
                         #(hsql/call :parsedatetime (hsql/call :formatdatetime % format-str) format-str))]
              [:=
               (week (hsql/raw "\"source\".\"BIRD.ID\""))
               (week #inst "2017-01-01T00:00:00.000000000-00:00")])
    :limit  10})
  (qp/query->native
    (data/mbql-query venues
      {:source-query {:source-table $$venues}
       :filter       [:= !week.*BIRD.ID/DateTime "2017-01-01"]
       :limit        10})))

;; make sure that aggregation references match up to aggregations from the same level they're from
;; e.g. the ORDER BY in the source-query should refer the 'stddev' aggregation, NOT the 'avg' aggregation
(expect
  {:query (str "SELECT avg(\"source\".\"stddev\") AS \"avg\" FROM ("
               "SELECT \"PUBLIC\".\"VENUES\".\"PRICE\" AS \"PRICE\", stddev(\"PUBLIC\".\"VENUES\".\"ID\") AS \"stddev\" "
               "FROM \"PUBLIC\".\"VENUES\" "
               "GROUP BY \"PUBLIC\".\"VENUES\".\"PRICE\" "
               "ORDER BY \"stddev\" DESC, \"PUBLIC\".\"VENUES\".\"PRICE\" ASC"
               ") \"source\"")
   :params nil}
  (qp/query->native
    (data/mbql-query venues
     {:source-query {:source-table $$venues
                     :aggregation  [[:stddev $id]]
                     :breakout     [$price]
                     :order-by     [[[:aggregation 0] :descending]]}
      :aggregation  [[:avg *stddev/Integer]]})))

;; make sure that we handle [field-id [field-literal ...]] forms gracefully, despite that not making any sense
(expect
  (honeysql->sql
   {:select   [[:source.category_id :category_id]]
    :from     [[venues-source-honeysql :source]]
    :group-by [:source.category_id]
    :order-by [[:source.category-id :asc]]
    :limit    10})
  (qp/query->native
    (data/mbql-query venues
      {:source-query {:source-table $$venues}
       :breakout     [[:field-id [:field-literal "category_id" :type/Integer]]]
       :limit        10})))

;; Make sure we can filter by string fields
(expect
  (honeysql->sql
   {:select [[:source.ID :ID]
             [:source.NAME :NAME]
             [:source.CATEGORY_ID :CATEGORY_ID]
             [:source.LATITUDE :LATITUDE]
             [:source.LONGITUDE :LONGITUDE]
             [:source.PRICE :PRICE]]
    :from   [[venues-source-honeysql :source]]
    :where  [:not= :source.text "Coo"]
    :limit  10})
  (qp/query->native
    (data/mbql-query nil
      {:source-query {:source-table $$venues}
       :limit        10
       :filter       [:!= [:field-literal "text" :type/Text] "Coo"]})))

;; Make sure we can filter by number fields
(expect
  (honeysql->sql
   {:select [[:source.ID :ID]
             [:source.NAME :NAME]
             [:source.CATEGORY_ID :CATEGORY_ID]
             [:source.LATITUDE :LATITUDE]
             [:source.LONGITUDE :LONGITUDE]
             [:source.PRICE :PRICE]]
    :from   [[venues-source-honeysql :source]]
    :where  [:> :source.sender_id 3]
    :limit  10})
  (qp/query->native
    (data/mbql-query nil
      {:source-query {:source-table $$venues}
       :limit        10
       :filter       [:> *sender_id/Integer 3]})))

;; make sure using a native query with default params as a source works
(expect
  {:query  "SELECT \"source\".* FROM (SELECT * FROM PRODUCTS WHERE CATEGORY = 'Widget' LIMIT 10) \"source\" LIMIT 1048576",
   :params nil}
  (tt/with-temp Card [card {:dataset_query {:database (data/id)
                                            :type     :native
                                            :native   {:query         "SELECT * FROM PRODUCTS WHERE CATEGORY = {{category}} LIMIT 10"
                                                       :template-tags {:category {:name         "category"
                                                                                  :display_name "Category"
                                                                                  :type         "text"
                                                                                  :required     true
                                                                                  :default      "Widget"}}}}}]
    (qp/query->native
      {:database (data/id)
       :type     :query
       :query    {:source-table (str "card__" (u/get-id card))}})))

(defn results-metadata {:style/indent 0} [results]
  (when (= :failed (:status results))
    (throw (ex-info "No results metadata." results)))
  (for [col (get-in results [:data :cols])]
    (u/select-non-nil-keys col [:base_type :display_name :id :name :special_type :table_id :unit :datetime-unit])))

;; make sure a query using a source query comes back with the correct columns metadata
(expect
  [{:base_type    :type/BigInteger
    :display_name "ID"
    :id           (data/id :venues :id)
    :name         "ID"
    :special_type :type/PK
    :table_id     (data/id :venues)}
   {:base_type    :type/Text
    :display_name "Name"
    :id           (data/id :venues :name)
    :name         "NAME"
    :special_type :type/Name
    :table_id     (data/id :venues)}
   {:base_type    :type/Integer
    :display_name "Category ID"
    :id           (data/id :venues :category_id)
    :name         "CATEGORY_ID"
    :special_type :type/FK
    :table_id     (data/id :venues)}
   {:base_type    :type/Float
    :display_name "Latitude"
    :id           (data/id :venues :latitude)
    :name         "LATITUDE"
    :special_type :type/Latitude
    :table_id     (data/id :venues)}
   {:base_type    :type/Float
    :display_name "Longitude"
    :id           (data/id :venues :longitude)
    :name         "LONGITUDE"
    :special_type :type/Longitude
    :table_id     (data/id :venues)}
   {:base_type    :type/Integer
    :display_name "Price"
    :id           (data/id :venues :price)
    :name         "PRICE"
    :special_type :type/Category
    :table_id     (data/id :venues)}]
  (-> (tt/with-temp Card [card (venues-mbql-card-def)]
        (qp/process-query (query-with-source-card card)))
      results-metadata))

;; make sure a breakout/aggregate query using a source query comes back with the correct columns metadata
(expect
  [{:base_type    :type/Text
    :name         "PRICE"
    :display_name "Price"}
   {:base_type    :type/Integer
    :display_name "count"
    :name         "count"
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
    :name         "DATE"
    :unit         :day}
   {:base_type    :type/Integer
    :display_name "count"
    :name         "count"
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
  [{:base_type    :type/Date
    :display_name "Date"
    :id           (data/id :checkins :date)
    :name         "DATE"
    :table_id     (data/id :checkins)
    :unit         :year}
   {:base_type    :type/Integer
    :display_name "Count"
    :name         "count"
    :special_type :type/Number}]
  (-> (tt/with-temp Card [card (mbql-card-def
                                 :source-table (data/id :checkins)
                                 :aggregation  [[:count]]
                                 :breakout     [[:datetime-field [:field-id (data/id :checkins :date)] :year]])]
        (qp/process-query (query-with-source-card card)))
      results-metadata))

(defn- field-name [table-kw field-kw]
  (db/select-one-field :name Field :id (data/id table-kw field-kw)))

(defn- completed-status [{:keys [status], :as results}]
  (if (= status :completed)
    status
    results))

;; make sure using a time interval filter works
(datasets/expect-with-drivers (qp.test/non-timeseries-drivers-with-feature :nested-queries)
  :completed
  (tt/with-temp Card [card (mbql-card-def
                             :source-table (data/id :checkins))]
    (-> (query-with-source-card card
          :filter [:time-interval [:field-literal (field-name :checkins :date) :type/DateTime] -30 :day])
        qp/process-query
        completed-status)))

;; make sure that wrapping a field literal in a datetime-field clause works correctly in filters & breakouts
(datasets/expect-with-drivers (qp.test/non-timeseries-drivers-with-feature :nested-queries)
  :completed
  (tt/with-temp Card [card (mbql-card-def
                             :source-table (data/id :checkins))]
    (-> (query-with-source-card card
          :aggregation [[:count]]
          :filter      [:= [:datetime-field [:field-literal (field-name :checkins :date) :type/Date] :quarter] "2014-01-01T08:00:00.000Z"]
          :breakout    [[:datetime-field [:field-literal (field-name :checkins :date) :type/Date] :month]])
        qp/process-query
        completed-status)))

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
        completed-status)))

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
        qp.test/rows)))


;; Make suer you're allowed to save a query that uses a SQL-based source query even if you don't have SQL *write*1337
;; permissions (#6845)

;; Check that perms for a Card with a source query require that you have read permissions for its Collection!
(expect
  #{(perms/collection-read-path collection/root-collection)}
  (tt/with-temp Card [card {:dataset_query {:database (data/id)
                                            :type     :native
                                            :native   {:query "SELECT * FROM VENUES"}}}]
    (query-perms/perms-set (query-with-source-card card :aggregation [:count]))))

(tt/expect-with-temp [Collection [collection]]
  #{(perms/collection-read-path collection)}
  (tt/with-temp Card [card {:collection_id (u/get-id collection)
                            :dataset_query {:database (data/id)
                                            :type     :native
                                            :native   {:query "SELECT * FROM VENUES"}}}]
    (query-perms/perms-set (query-with-source-card card :aggregation [:count]))))

;; try this in an end-to-end fashion using the API and make sure we can save a Card if we have appropriate read
;; permissions for the source query
(defn- save-card-via-API-with-native-source-query!
  "Attempt to save a Card that uses a native source query and belongs to a Collection with `collection-id` via the API
  using Rasta. Use this to test how the API endpoint behaves based on certain permissions grants for the `All Users`
  group."
  [expected-status-code db-or-id source-collection-or-id-or-nil dest-collection-or-id-or-nil]
  (tt/with-temp Card [card {:collection_id (some-> source-collection-or-id-or-nil u/get-id)
                            :dataset_query {:database (u/get-id db-or-id)
                                            :type     :native
                                            :native   {:query "SELECT * FROM VENUES"}}}]
    ((user->client :rasta) :post expected-status-code "card"
     {:name                   (tu/random-name)
      :collection_id          (some-> dest-collection-or-id-or-nil u/get-id)
      :display                "scalar"
      :visualization_settings {}
      :dataset_query          (query-with-source-card card
                                :aggregation [:count])})))

;; to save a Card that uses another Card as its source, you only need read permissions for the Collection the Source
;; Card is in, and write permissions for the Collection you're trying to save the new Card in
(expect
  :ok
  (tu/with-non-admin-groups-no-root-collection-perms
    (data/with-temp-copy-of-db
      (tt/with-temp* [Collection [source-card-collection]
                      Collection [dest-card-collection]]
        (perms/grant-collection-read-permissions!      (group/all-users) source-card-collection)
        (perms/grant-collection-readwrite-permissions! (group/all-users) dest-card-collection)
        (save-card-via-API-with-native-source-query! 200 (data/db) source-card-collection dest-card-collection)
        :ok))))

;; however, if we do *not* have read permissions for the source Card's collection we shouldn't be allowed to save the
;; query. This API call should fail

;; Card in the Root Collection
(expect
  "You don't have permissions to do that."
  (tu/with-non-admin-groups-no-root-collection-perms
    (data/with-temp-copy-of-db
      (tt/with-temp Collection [dest-card-collection]
        (perms/grant-collection-readwrite-permissions! (group/all-users) dest-card-collection)
        (save-card-via-API-with-native-source-query! 403 (data/db) nil dest-card-collection)))))

;; Card in a different Collection for which we do not have perms
(expect
  "You don't have permissions to do that."
  (tu/with-non-admin-groups-no-root-collection-perms
    (data/with-temp-copy-of-db
      (tt/with-temp* [Collection [source-card-collection]
                      Collection [dest-card-collection]]
        (perms/grant-collection-readwrite-permissions! (group/all-users) dest-card-collection)
        (save-card-via-API-with-native-source-query! 403 (data/db) source-card-collection dest-card-collection)))))

;; similarly, if we don't have *write* perms for the dest collection it should also fail

;; Try to save in the Root Collection
(expect
  "You don't have permissions to do that."
  (tu/with-non-admin-groups-no-root-collection-perms
    (data/with-temp-copy-of-db
      (tt/with-temp Collection [source-card-collection]
        (perms/grant-collection-read-permissions! (group/all-users) source-card-collection)
        (save-card-via-API-with-native-source-query! 403 (data/db) source-card-collection nil)))))

;; Try to save in a different Collection for which we do not have perms
(expect
  "You don't have permissions to do that."
  (tu/with-non-admin-groups-no-root-collection-perms
    (data/with-temp-copy-of-db
      (tt/with-temp* [Collection [source-card-collection]
                      Collection [dest-card-collection]]
        (perms/grant-collection-read-permissions! (group/all-users) source-card-collection)
        (save-card-via-API-with-native-source-query! 403 (data/db) source-card-collection dest-card-collection)))))

;; make sure that if we refer to a Field that is actually inside the source query, the QP is smart enough to figure
;; out what you were referring to and behave appropriately
(datasets/expect-with-drivers (qp.test/non-timeseries-drivers-with-feature :nested-queries)
  [[10]]
  (qp.test/format-rows-by [int]
    (qp.test/rows
      (data/run-mbql-query venues
        {:source-query {:source-table $$venues
                        :fields       [$id $name $category_id $latitude $longitude $price]}
         :aggregation  [[:count]]
         :filter       [:= $category_id 50]}))))

;; make sure that if a nested query includes joins queries based on it still work correctly (#8972)
(datasets/expect-with-drivers (qp.test/non-timeseries-drivers-with-feature :nested-queries :foreign-keys)
  [[31 "Bludso's BBQ"         5 33.8894 -118.207 2]
   [32 "Boneyard Bistro"      5 34.1477 -118.428 3]
   [33 "My Brother's Bar-B-Q" 5 34.167  -118.595 2]
   [35 "Smoke City Market"    5 34.1661 -118.448 1]
   [37 "bigmista's barbecue"  5 34.118  -118.26  2]
   [38 "Zeke's Smokehouse"    5 34.2053 -118.226 2]
   [39 "Baby Blues BBQ"       5 34.0003 -118.465 2]]
  (qp.test/format-rows-by [int str int (partial u/round-to-decimals 4) (partial u/round-to-decimals 4) int]
    (qp.test/rows
      (qp/process-query
        (data/mbql-query venues
          {:source-query
           {:source-table $$venues
            :filter       [:= $venues.category_id->categories.name "BBQ"]
            :order-by     [[:asc $id]]}})))))

;; Make sure we parse datetime strings when compared against type/DateTime field literals (#9007)
(datasets/expect-with-drivers (qp.test/non-timeseries-drivers-with-feature :nested-queries :foreign-keys)
  [[395]
   [980]]
  (qp.test/format-rows-by [int]
    (qp.test/rows
      (data/run-mbql-query checkins
        {:source-query {:source-table $$checkins
                        :order-by     [[:asc $id]]}
         :fields       [$id]
         :filter       [:=
                        [:field-literal (field-name :checkins :date) "type/DateTime"]
                        "2014-03-30"]}))))

;; make sure filters in source queries are applied correctly!
(datasets/expect-with-drivers (qp.test/non-timeseries-drivers-with-feature :nested-queries :foreign-keys)
  [["Fred 62"     1]
   ["Frolic Room" 1]]
  (qp.test/format-rows-by [str int]
    (qp.test/rows
      (data/run-mbql-query checkins
        {:source-query {:source-table $$checkins
                        :filter       [:> $date "2015-01-01"]}
         :aggregation  [:count]
         :order-by     [[:asc $venue_id->venues.name]]
         :breakout     [$venue_id->venues.name]
         :filter       [:starts-with $venue_id->venues.name "F"]}))))
