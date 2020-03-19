(ns metabase.query-processor-test.nested-queries-test
  "Tests for handling queries with nested expressions."
  (:require [clojure.test :refer :all]
            [expectations :refer [expect]]
            [honeysql.core :as hsql]
            [java-time :as t]
            [metabase
             [driver :as driver]
             [query-processor :as qp]
             [query-processor-test :as qp.test]
             [test :as mt]
             [util :as u]]
            [metabase.mbql.schema :as mbql.s]
            [metabase.models
             [card :as card :refer [Card]]
             [collection :as collection :refer [Collection]]
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
            [toucan.util.test :as tt]))

;; make sure we can do a basic query with MBQL source-query
(datasets/expect-with-drivers (qp.test/normal-drivers-with-feature :nested-queries)
  {:rows [[1 "Red Medicine"                  4 10.0646 -165.374 3]
          [2 "Stout Burgers & Beers"        11 34.0996 -118.329 2]
          [3 "The Apple Pan"                11 34.0406 -118.428 2]
          [4 "Wurstküche"                   29 33.9997 -118.465 2]
          [5 "Brite Spot Family Restaurant" 20 34.0778 -118.261 2]]
   :cols (mapv
          (partial qp.test/field-literal-col :venues)
          [:id :name :category_id :latitude :longitude :price])}
  (qp.test/rows-and-cols
    (qp.test/format-rows-by :venues
      (mt/run-mbql-query nil
        {:source-query {:source-table $$venues
                        :order-by     [[:asc $venues.id]]
                        :limit        10}
         :limit        5}))))

;; make sure we can do a basic query with a SQL source-query
(datasets/expect-with-drivers (qp.test/normal-drivers-with-feature :nested-queries)
  {:rows [[1 -165.374  4 3 "Red Medicine"                 10.0646]
          [2 -118.329 11 2 "Stout Burgers & Beers"        34.0996]
          [3 -118.428 11 2 "The Apple Pan"                34.0406]
          [4 -118.465 29 2 "Wurstküche"                   33.9997]
          [5 -118.261 20 2 "Brite Spot Family Restaurant" 34.0778]]
   :cols (mapv (partial qp.test/native-query-col :venues) [:id :longitude :category_id :price :name :latitude])}
  (qp.test/format-rows-by [int 4.0 int int str 4.0]
    (let [{source-query :query} (qp/query->native
                                  (data/mbql-query venues
                                    {:fields [$id $longitude $category_id $price $name $latitude]}))]
      (qp.test/rows-and-cols
        (mt/run-mbql-query venues
          {:source-query {:native source-query}
           :order-by     [[:asc *venues.id]]
           :limit        5})))))


(defn- breakout-results [& {:keys [has-source-metadata?], :or {has-source-metadata? true}}]
  {:rows [[1 22]
          [2 59]
          [3 13]
          [4  6]]
   :cols [(cond-> (qp.test/breakout-col (qp.test/field-literal-col :venues :price))
            (not has-source-metadata?)
            (dissoc :id :special_type :settings :fingerprint :table_id))
          (qp.test/aggregate-col :count)]})

;; make sure we can do a query with breakout and aggregation using an MBQL source query
(datasets/expect-with-drivers (qp.test/normal-drivers-with-feature :nested-queries)
  (breakout-results)
  (qp.test/rows-and-cols
    (qp.test/format-rows-by [int int]
      (mt/run-mbql-query venues
        {:source-query {:source-table $$venues}
         :aggregation  [:count]
         :breakout     [*price]}))))

;; Test including a breakout of a nested query column that follows an FK
(datasets/expect-with-drivers (qp.test/normal-drivers-with-feature :nested-queries :foreign-keys)
  {:rows [[1 174] [2 474] [3 78] [4 39]]
   :cols [(qp.test/breakout-col (qp.test/fk-col :checkins :venue_id :venues :price))
          (qp.test/aggregate-col :count)]}
  (qp.test/rows-and-cols
    (qp.test/format-rows-by [int int]
      (mt/run-mbql-query checkins
        {:source-query {:source-table $$checkins
                        :filter       [:> $date "2014-01-01"]}
         :aggregation  [:count]
         :order-by     [[:asc $venue_id->venues.price]]
         :breakout     [$venue_id->venues.price]}))))


;; Test two breakout columns from the nested query, both following an FK
(datasets/expect-with-drivers (qp.test/normal-drivers-with-feature :nested-queries :foreign-keys)
  {:rows [[2 33.7701 7]
          [2 33.8894 8]
          [2 33.9997 7]
          [3 10.0646 2]
          [4 33.983 2]],
   :cols [(qp.test/breakout-col (qp.test/fk-col :checkins :venue_id :venues :price))
          (qp.test/breakout-col (qp.test/fk-col :checkins :venue_id :venues :latitude))
          (qp.test/aggregate-col :count)]}
  (qp.test/rows-and-cols
    (qp.test/format-rows-by [int 4.0 int]
      (mt/run-mbql-query checkins
        {:source-query {:source-table $$checkins
                        :filter       [:> $date "2014-01-01"]}
         :filter       [:< $venue_id->venues.latitude 34]
         :aggregation  [:count]
         :order-by     [[:asc $venue_id->venues.price]]
         :breakout     [$venue_id->venues.price
                        $venue_id->venues.latitude]}))))

;; Test two breakout columns from the nested query, one following an FK the other from the source table
(datasets/expect-with-drivers (qp.test/normal-drivers-with-feature :nested-queries :foreign-keys)
  {:rows [[1 1 6]
          [1 2 14]
          [1 3 13]
          [1 4 8]
          [1 5 10]]
   :cols [(qp.test/breakout-col (qp.test/fk-col :checkins :venue_id :venues :price))
          (qp.test/breakout-col (qp.test/field-literal-col :checkins :user_id))
          (qp.test/aggregate-col :count)]}
  (qp.test/rows-and-cols
    (qp.test/format-rows-by [int int int]
      (mt/run-mbql-query checkins
        {:source-query {:source-table $$checkins
                        :filter       [:> $date "2014-01-01"]}
         :aggregation  [:count]
         :filter       [:= $venue_id->venues.price 1]
         :order-by     [[:asc $venue_id->venues.price]]
         :breakout     [$venue_id->venues.price *user_id]
         :limit        5}))))

;; make sure we can do a query with breakout and aggregation using a SQL source query
(datasets/expect-with-drivers (qp.test/normal-drivers-with-feature :nested-queries)
  (breakout-results :has-source-metadata? false)
  (qp.test/rows-and-cols
    (qp.test/format-rows-by [int int]
      (mt/run-mbql-query venues
        {:source-query {:native (:query (qp/query->native (data/mbql-query venues)))}
         :aggregation  [:count]
         :breakout     [*price]}))))


(defn- mbql-card-def
  "Basic MBQL Card definition. Pass kv-pair clauses for the inner query."
  {:style/indent 0}
  ([m]
   {:dataset_query {:database (data/id)
                    :type     :query
                    :query    m}})
  ([k v & {:as more}]
   (mbql-card-def (merge {k v} more))))

(defn- venues-mbql-card-def
  "A basic Card definition that returns raw data for the venues test table.
   Pass additional kv-pair clauses for the inner query as needed."
  {:style/indent 0}
  [& additional-clauses]
  (apply mbql-card-def :source-table (data/id :venues) additional-clauses))


(defn- query-with-source-card
  {:style/indent 1}
  ([card]
   {:database mbql.s/saved-questions-virtual-database-id
    :type     :query
    :query    {:source-table (str "card__" (u/get-id card))}})

  ([card m]
   (update (query-with-source-card card) :query merge m))

  ([card k v & {:as more}]
   (query-with-source-card card (merge {k v} more))))

;; Make sure we can run queries using source table `card__id` format. This is the format that is actually used by the
;; frontend; it gets translated to the normal `source-query` format by middleware. It's provided as a convenience so
;; only minimal changes need to be made to the frontend.
(expect
  (breakout-results)
  (tt/with-temp Card [card (venues-mbql-card-def)]
    (qp.test/rows-and-cols
      (qp.test/format-rows-by [int int]
        (qp/process-query
          (query-with-source-card card
            (data/$ids venues
              {:aggregation [:count]
               :breakout    [*price]})))))))

(deftest card-id-native-source-queries-test
  (let [run-native-query
        (fn [sql]
          (tt/with-temp Card [card {:dataset_query {:database (data/id), :type :native. :native {:query sql}}}]
            (qp.test/rows-and-cols
              (qp.test/format-rows-by [int int]
                (qp/process-query
                  (query-with-source-card card
                    (data/$ids venues
                      {:aggregation [:count]
                       :breakout    [*price]})))))))]
    (is (= (breakout-results :has-source-metadata? false)
           (run-native-query "SELECT * FROM VENUES"))
        "make sure `card__id`-style queries work with native source queries as well")
    (is (= (breakout-results :has-source-metadata? false)
           (run-native-query "SELECT * FROM VENUES -- small comment here"))
        "Ensure trailing comments are trimmed and don't cause a wrapping SQL query to fail")
    (is (= (breakout-results :has-source-metadata? false)
           (run-native-query "SELECT * FROM VENUES -- small comment here\n"))
        "Ensure trailing comments followed by a newline are trimmed and don't cause a wrapping SQL query to fail")))


;; make sure we can filter by a field literal
(expect
  {:rows [[1 "Red Medicine" 4 10.0646 -165.374 3]]
   :cols (mapv (partial qp.test/field-literal-col :venues)
               [:id :name :category_id :latitude :longitude :price])}
  (qp.test/rows-and-cols
    (mt/run-mbql-query venues
      {:source-query {:source-table $$venues}
       :filter       [:= *id 1]})))

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

(deftest field-literals-test
  (is (= (honeysql->sql
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
      (str "make sure that dots in field literal identifiers get handled properly so you can't reference fields "
           "from other tables using them"))
  (is (= (honeysql->sql
          {:select [[:source.ID :ID]
                    [:source.NAME :NAME]
                    [:source.CATEGORY_ID :CATEGORY_ID]
                    [:source.LATITUDE :LATITUDE]
                    [:source.LONGITUDE :LONGITUDE]
                    [:source.PRICE :PRICE]]
           :from   [[venues-source-honeysql :source]]
           :where  [:and
                    [:>= (hsql/raw "\"source\".\"BIRD.ID\"") (t/zoned-date-time "2017-01-01T00:00Z[UTC]")]
                    [:< (hsql/raw "\"source\".\"BIRD.ID\"")  (t/zoned-date-time "2017-01-08T00:00Z[UTC]")]]
           :limit  10})
         (qp/query->native
           (data/mbql-query venues
             {:source-query {:source-table $$venues}
              :filter       [:= !week.*BIRD.ID/DateTime "2017-01-01"]
              :limit        10})))
      "make sure that field-literals work as DateTimeFields"))

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

(deftest native-query-with-default-params-as-source-test
  (testing "make sure using a native query with default params as a source works"
    (is (= {:query  "SELECT \"source\".* FROM (SELECT * FROM PRODUCTS WHERE CATEGORY = ? LIMIT 10) \"source\" LIMIT 1048576",
            :params ["Widget"]}
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
                :query    {:source-table (str "card__" (u/get-id card))}}))))))

;; make sure a query using a source query comes back with the correct columns metadata
(expect
  (map
   (partial qp.test/field-literal-col :venues)
   [:id :name :category_id :latitude :longitude :price])
  (qp.test/cols
    (tt/with-temp Card [card (venues-mbql-card-def)]
      (qp/process-query (query-with-source-card card)))))

;; make sure a breakout/aggregate query using a source query comes back with the correct columns metadata
(expect
  [(qp.test/breakout-col (qp.test/field-literal-col :venues :price))
   (qp.test/aggregate-col :count)]
  (qp.test/cols
    (tt/with-temp Card [card (venues-mbql-card-def)]
      (qp/process-query
        (query-with-source-card card
          (data/$ids venues
            {:aggregation [[:count]]
             :breakout    [*price]}))))))

;; make sure nested queries return the right columns metadata for SQL source queries and datetime breakouts
(expect
 [(-> (qp.test/breakout-col (qp.test/field-literal-col :checkins :date))
      (assoc :field_ref [:datetime-field [:field-literal "DATE" :type/Date] :day]
             :unit      :day)
      ;; because this field literal comes from a native query that does not include `:source-metadata` it won't have
      ;; the usual extra keys
      (dissoc :special_type :table_id :id :settings :fingerprint))
  (qp.test/aggregate-col :count)]
 (qp.test/cols
   (tt/with-temp Card [card {:dataset_query {:database (data/id)
                                             :type     :native
                                             :native   {:query "SELECT * FROM CHECKINS"}}}]
     (qp/process-query
       (query-with-source-card card
         (data/$ids checkins
           {:aggregation [[:count]]
            :breakout    [!day.*date]}))))))

(deftest breakout-year-test
  (testing (str "make sure when doing a nested query we give you metadata that would suggest you should be able to "
                "break out a *YEAR*")
    (let [source-query (data/$ids checkins
                         {:source-table $$checkins
                          :aggregation  [[:count]]
                          :breakout     [!year.date]})]
      (tt/with-temp Card [card (mbql-card-def source-query)]
        (let [[date-col count-col] (for [col (-> (qp/process-query {:database (mt/id), :type :query, :query source-query})
                                                 :data :cols)]
                                     (-> (into {} col)
                                         (dissoc :description :parent_id :visibility_type)
                                         (assoc :source :fields)))]
          (is (= [(assoc date-col  :field_ref [:field-literal "DATE" :type/Date])
                  (assoc count-col :field_ref [:field-literal "count" (:base_type count-col)])]
                 (mt/cols
                   (qp/process-query (query-with-source-card card))))))))))

(defn- completed-status [{:keys [status], :as results}]
  (if (= status :completed)
    status
    results))

(deftest time-interval-test
  (datasets/test-drivers (qp.test/normal-drivers-with-feature :nested-queries)
    (testing "make sure using a time interval filter works"
      (is (= :completed
             (tt/with-temp Card [card (mbql-card-def (data/$ids {:source-table $$checkins}))]
               (-> (query-with-source-card card
                     (data/$ids checkins
                       {:filter [:time-interval *date -30 :day]}))
                   qp/process-query
                   completed-status)))))))

;; make sure that wrapping a field literal in a datetime-field clause works correctly in filters & breakouts
(datasets/expect-with-drivers (qp.test/normal-drivers-with-feature :nested-queries)
  :completed
  (tt/with-temp Card [card (mbql-card-def (data/$ids {:source-table $$checkins}))]
    (-> (query-with-source-card card
          (data/$ids :checkins
            {:aggregation [[:count]]
             :filter      [:= !quarter.*date "2014-01-01T08:00:00.000Z"]
             :breakout    [!month.*date]}))
        qp/process-query
        completed-status)))

;; make sure timeseries queries generated by "drag-to-filter" work correctly
(expect
  :completed
  (tt/with-temp Card [card (mbql-card-def (data/$ids {:source-table $$checkins}))]
    (completed-status
     (qp/process-query
       (query-with-source-card card
         (data/$ids checkins
           {:aggregation [[:count]]
            :breakout    [!week.*date]
            :filter      [:between !week.*date "2014-02-01T00:00:00-08:00" "2014-05-01T00:00:00-07:00"]}))))))

;; Make sure that macro expansion works inside of a neested query, when using a compound filter clause (#5974)
(expect
  [[22]]
  (tt/with-temp* [Segment [segment (data/$ids {:table_id   $$venues
                                               :definition {:filter [:= $venues.price 1]}})]
                  Card    [card (mbql-card-def
                                  :source-table (data/id :venues)
                                  :filter       [:and [:segment (u/get-id segment)]])]]
    (qp.test/rows
      (qp/process-query
        (query-with-source-card card
          {:aggregation [:count]})))))


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
        (save-card-via-API-with-native-source-query! 202 (data/db) source-card-collection dest-card-collection)
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
(datasets/expect-with-drivers (qp.test/normal-drivers-with-feature :nested-queries)
  [[10]]
  (qp.test/formatted-rows [int]
    (mt/run-mbql-query venues
      {:source-query {:source-table $$venues
                      :fields       [$id $name $category_id $latitude $longitude $price]}
       :aggregation  [[:count]]
       :filter       [:= $category_id 50]})))

;; make sure that if a nested query includes joins queries based on it still work correctly (#8972)
(datasets/expect-with-drivers (qp.test/normal-drivers-with-feature :nested-queries :foreign-keys)
  [[31 "Bludso's BBQ"         5 33.8894 -118.207 2]
   [32 "Boneyard Bistro"      5 34.1477 -118.428 3]
   [33 "My Brother's Bar-B-Q" 5 34.167  -118.595 2]
   [35 "Smoke City Market"    5 34.1661 -118.448 1]
   [37 "bigmista's barbecue"  5 34.118  -118.26  2]
   [38 "Zeke's Smokehouse"    5 34.2053 -118.226 2]
   [39 "Baby Blues BBQ"       5 34.0003 -118.465 2]]
  (qp.test/formatted-rows :venues
    (qp/process-query
      (data/mbql-query venues
        {:source-query
         {:source-table $$venues
          :filter       [:= $venues.category_id->categories.name "BBQ"]
          :order-by     [[:asc $id]]}}))))

;; Make sure we parse datetime strings when compared against type/DateTime field literals (#9007)
(datasets/expect-with-drivers (qp.test/normal-drivers-with-feature :nested-queries :foreign-keys)
  [[395]
   [980]]
  (qp.test/formatted-rows [int]
    (mt/run-mbql-query checkins
      {:source-query {:source-table $$checkins
                      :order-by     [[:asc $id]]}
       :fields       [$id]
       :filter       [:= *date "2014-03-30"]})))

;; make sure filters in source queries are applied correctly!
(datasets/expect-with-drivers (qp.test/normal-drivers-with-feature :nested-queries :foreign-keys)
  [["Fred 62"     1]
   ["Frolic Room" 1]]
  (qp.test/formatted-rows [str int]
    (mt/run-mbql-query checkins
      {:source-query {:source-table $$checkins
                      :filter       [:> $date "2015-01-01"]}
       :aggregation  [:count]
       :order-by     [[:asc $venue_id->venues.name]]
       :breakout     [$venue_id->venues.name]
       :filter       [:starts-with $venue_id->venues.name "F"]})))

(deftest two-of-the-same-aggregations-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries :foreign-keys)
    (testing "Do nested queries work with two of the same aggregation? (#9767)"
      (is (= [["2014-02-01T00:00:00Z" 302 1804]
              ["2014-03-01T00:00:00Z" 350 2362]]
             (mt/formatted-rows [identity int int]
               (mt/run-mbql-query checkins
                 {:source-query
                  {:source-table $$checkins
                   :aggregation  [[:sum $user_id] [:sum $venue_id]]
                   :breakout     [!month.date]}
                  :filter [:> *sum/Float 300]
                  :limit  2})))))))

;; can you use nested queries that have expressions in them?
(datasets/expect-with-drivers (qp.test/normal-drivers-with-feature :nested-queries :foreign-keys :expressions)
  [[30] [20]]
  (qp.test/formatted-rows [int int]
    (mt/run-mbql-query venues
      {:source-query
       {:source-table $$venues
        :fields       [[:expression "price-times-ten"]]
        :expressions  {"price-times-ten" [:* $price 10]}
        :order-by     [[:asc $id]]
        :limit        2}})))

(datasets/expect-with-drivers (qp.test/normal-drivers-with-feature :nested-queries :foreign-keys :expressions)
  [[30] [20]]
  (tt/with-temp Card [{card-id :id} {:dataset_query (data/mbql-query venues
                                                      {:fields       [[:expression "price-times-ten"]]
                                                       :expressions  {"price-times-ten" [:* $price 10]}
                                                       :order-by     [[:asc $id]]
                                                       :limit        2})}]

    (qp.test/formatted-rows [int int]
      (mt/run-mbql-query nil
        {:source-table (str "card__" card-id)}))))

;; If a field is bucketed as a year in a source query, bucketing it as a year shouldn't break things (#10446)
;; (Normally, it would break things, but the new `simplify` middleware eliminates the duplicate cast. It is not
;; currently possible to cast a DateTime field to a year in MBQL, and then cast it a second time in an another query
;; using the first as a source. This is a side-effect of MBQL year bucketing coming back as values like `2016` rather
;; than timestamps
(deftest bucketing-already-bucketed-year-test
  (datasets/test-drivers (qp.test/normal-drivers-with-feature :nested-queries)
    (is (= [[(if (= :sqlite driver/*driver*) "2013-01-01" "2013-01-01T00:00:00Z")]]
           (qp.test/rows
             (mt/run-mbql-query checkins
               {:source-query {:source-table $$checkins
                               :fields       [!year.date]
                               :order-by     [[:asc !year.date]]
                               :limit        1}
                :fields       [!year.*date]}))))))
