(ns metabase.query-processor-test.nested-queries-test
  "Tests for handling queries with nested expressions."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [honey.sql :as sql]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.driver.sql.query-processor-test-util :as sql.qp-test-util]
   [metabase.mbql.schema :as mbql.s]
   [metabase.models :refer [Dimension Field Metric Segment Table]]
   [metabase.models.card :as card :refer [Card]]
   [metabase.models.collection :as collection :refer [Collection]]
   [metabase.models.interface :as mi]
   [metabase.models.permissions :as perms]
   [metabase.models.permissions-group :as perms-group]
   [metabase.models.query.permissions :as query-perms]
   [metabase.query-processor :as qp]
   [metabase.query-processor-test :as qp.test]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.test :as mt]
   [metabase.util :as u]
   [schema.core :as s]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest basic-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries)
    (testing "make sure we can do a basic query with MBQL source-query"
      (is (= {:rows [[1 "Red Medicine"                  4 10.0646 -165.374 3]
                     [2 "Stout Burgers & Beers"        11 34.0996 -118.329 2]
                     [3 "The Apple Pan"                11 34.0406 -118.428 2]
                     [4 "Wurstküche"                   29 33.9997 -118.465 2]
                     [5 "Brite Spot Family Restaurant" 20 34.0778 -118.261 2]]
              :cols (mapv
                     (partial qp.test/col :venues)
                     [:id :name :category_id :latitude :longitude :price])}
             (qp.test/rows-and-cols
               (mt/format-rows-by :venues
                 (mt/run-mbql-query nil
                   {:source-query {:source-table $$venues
                                   :order-by     [[:asc $venues.id]]
                                   :limit        10}
                    :limit        5}))))))))

(defn- sql-driver? []
  (isa? driver/hierarchy driver/*driver* :sql))

(defn- compile-to-native [mbql-query]
  (cond-> (qp/compile mbql-query)
    (sql-driver?) :query))

(deftest basic-sql-source-query-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries)
    (testing "make sure we can do a basic query with a SQL source-query"
      (is (= {:rows [[1 -165.374  4 3 "Red Medicine"                 10.0646]
                     [2 -118.329 11 2 "Stout Burgers & Beers"        34.0996]
                     [3 -118.428 11 2 "The Apple Pan"                34.0406]
                     [4 -118.465 29 2 "Wurstküche"                   33.9997]
                     [5 -118.261 20 2 "Brite Spot Family Restaurant" 34.0778]]
              :cols (mapv (partial qp.test/native-query-col :venues)
                          [:id :longitude :category_id :price :name :latitude])}
             (mt/format-rows-by [int 4.0 int int str 4.0]
               (let [native-query (compile-to-native
                                   (mt/mbql-query venues
                                     {:fields [$id $longitude $category_id $price $name $latitude]}))]
                 (qp.test/rows-and-cols
                  (mt/run-mbql-query venues
                    {:source-query {:native native-query}
                     :order-by     [[:asc *venues.id]]
                     :limit        5})))))))))

(defn breakout-results [& {:keys [has-source-metadata? native-source?]
                            :or   {has-source-metadata? true
                                   native-source?       false}}]
  {:rows [[1 22]
          [2 59]
          [3 13]
          [4  6]]
   :cols [(cond-> (qp.test/breakout-col (qp.test/col :venues :price))
            native-source?
            (-> (assoc :field_ref [:field "PRICE" {:base-type :type/Integer}]
                       :effective_type :type/Integer)
                (dissoc :description :parent_id :nfc_path :visibility_type))

            (not has-source-metadata?)
            (dissoc :id :semantic_type :settings :fingerprint :table_id :coercion_strategy))
          (qp.test/aggregate-col :count)]})

(deftest mbql-source-query-breakout-aggregation-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries)
    (testing "make sure we can do a query with breakout and aggregation using an MBQL source query"
      (is (= (breakout-results)
             (qp.test/rows-and-cols
               (mt/format-rows-by [int int]
                 (mt/run-mbql-query venues
                   {:source-query {:source-table $$venues}
                    :aggregation  [:count]
                    :breakout     [$price]}))))))))

(deftest mbql-source-query-aggregation-order-by-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries)
    (testing "Source query with aggregation and order by produces expected results (#30874)."
      (is (= [[50 10] [7 10] [40 9]]
             (mt/formatted-rows [int int]
               (mt/run-mbql-query venues
                 {:source-query {:source-table $$venues
                                 :aggregation  [:count]
                                 :breakout     [$category_id]
                                 :order-by     [[:desc [:aggregation 0]]]}
                  :order-by [[:desc *count/Integer]
                             [:desc $category_id]]
                  :limit 3})))))))

(deftest breakout-fk-column-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries :foreign-keys)
    (testing "Test including a breakout of a nested query column that follows an FK"
      (is (= {:rows [[1 174] [2 474] [3 78] [4 39]]
              :cols [(qp.test/breakout-col (qp.test/fk-col :checkins :venue_id :venues :price))
                     (qp.test/aggregate-col :count)]}
             (qp.test/rows-and-cols
               (mt/format-rows-by [int int]
                 (mt/run-mbql-query checkins
                   {:source-query {:source-table $$checkins
                                   :filter       [:> $date "2014-01-01"]}
                    :aggregation  [:count]
                    :order-by     [[:asc $venue_id->venues.price]]
                    :breakout     [$venue_id->venues.price]}))))))))

(deftest two-breakout-fk-columns-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries :foreign-keys)
    (testing "Test two breakout columns from the nested query, both following an FK"
      (is (= {:rows [[2 33.7701 7]
                     [2 33.8894 8]
                     [2 33.9997 7]
                     [3 10.0646 2]
                     [4 33.983 2]]
              :cols [(qp.test/breakout-col (qp.test/fk-col :checkins :venue_id :venues :price))
                     (qp.test/breakout-col (qp.test/fk-col :checkins :venue_id :venues :latitude))
                     (qp.test/aggregate-col :count)]}
             (qp.test/rows-and-cols
               (mt/format-rows-by [int 4.0 int]
                 (mt/run-mbql-query checkins
                   {:source-query {:source-table $$checkins
                                   :filter       [:> $date "2014-01-01"]}
                    :filter       [:< $venue_id->venues.latitude 34]
                    :aggregation  [:count]
                    :order-by     [[:asc $venue_id->venues.price]]
                    :breakout     [$venue_id->venues.price
                                   $venue_id->venues.latitude]}))))))))

(deftest two-breakouts-one-fk-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries :foreign-keys)
    (testing "Test two breakout columns from the nested query, one following an FK the other from the source table"
      (is (= {:rows [[1 1 6]
                     [1 2 14]
                     [1 3 13]
                     [1 4 8]
                     [1 5 10]]
              :cols [(qp.test/breakout-col (qp.test/fk-col :checkins :venue_id :venues :price))
                     (qp.test/breakout-col (qp.test/col :checkins :user_id))
                     (qp.test/aggregate-col :count)]}
             (qp.test/rows-and-cols
               (mt/format-rows-by [int int int]
                 (mt/run-mbql-query checkins
                   {:source-query {:source-table $$checkins
                                   :filter       [:> $date "2014-01-01"]}
                    :aggregation  [:count]
                    :filter       [:= $venue_id->venues.price 1]
                    :order-by     [[:asc $venue_id->venues.price]]
                    :breakout     [$venue_id->venues.price $user_id]
                    :limit        5}))))))))

(deftest nested-with-aggregations-at-both-levels-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries)
    (mt/dataset sample-dataset
      (doseq [dataset? [true false]]
        (testing (format "Aggregations in both nested and outer query for %s have correct metadata (#19403) and (#23248)"
                         (if dataset? "questions" "models"))
          (mt/with-temp* [Card [{card-id :id :as card}
                                {:dataset dataset?
                                 :dataset_query
                                 (mt/$ids :products
                                          {:type     :query
                                           :database (mt/id)
                                           :query    {:source-table $$products
                                                      :aggregation
                                                      [[:aggregation-options
                                                        [:sum $price]
                                                        {:name "sum"}]
                                                       [:aggregation-options
                                                        [:max $rating]
                                                        {:name "max"}]]
                                                      :breakout     $category
                                                      :order-by     [[:asc $category]]}})}]]
            (is (partial= {:data {:cols [{:name "sum" :display_name "Sum of Sum of Price"}
                                         {:name "count" :display_name "Count"}]
                                  :rows [[11149 4]]}}
                          (mt/format-rows-by [int int]
                            (qp/process-query (merge {:type     :query
                                                      :database (mt/id)
                                                      :query    {:source-table (str "card__" card-id)
                                                                 :aggregation  [[:aggregation-options
                                                                                 [:sum
                                                                                  [:field
                                                                                   "sum"
                                                                                   {:base-type :type/Float}]]
                                                                                 {:name "sum"}]
                                                                                [:aggregation-options
                                                                                 [:count]
                                                                                 {:name "count"}]]}}
                                                     (when dataset?
                                                       {:info {:metadata/dataset-metadata (:result_metadata card)}}))))))))))))

(deftest ^:parallel sql-source-query-breakout-aggregation-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries)
    (testing "make sure we can do a query with breakout and aggregation using a SQL source query"
      (is (= (:rows (breakout-results))
             (mt/rows
              (mt/format-rows-by [int int]
                (mt/run-mbql-query venues
                  {:source-query {:native (compile-to-native (mt/mbql-query venues))}
                   :aggregation  [:count]
                   :breakout     [*price]}))))))))

(defn- mbql-card-def
  "Basic MBQL Card definition. Pass kv-pair clauses for the inner query."
  {:style/indent 0}
  ([m]
   {:dataset_query {:database (mt/id)
                    :type     :query
                    :query    m}})
  ([k v & {:as more}]
   (mbql-card-def (merge {k v} more))))

(defn- venues-mbql-card-def
  "A basic Card definition that returns raw data for the venues test table.
   Pass additional kv-pair clauses for the inner query as needed."
  {:style/indent 0}
  [& additional-clauses]
  (apply mbql-card-def :source-table (mt/id :venues) additional-clauses))

(defn- query-with-source-card
  {:style/indent 1}
  ([card]
   {:database mbql.s/saved-questions-virtual-database-id
    :type     :query
    :query    {:source-table (str "card__" (u/the-id card))}})

  ([card m]
   (update (query-with-source-card card) :query merge m))

  ([card k v & {:as more}]
   (query-with-source-card card (merge {k v} more))))

(deftest multilevel-nested-questions-with-joins
  (testing "Multilevel nested questions with joins work (#22859)"
    (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries :left-join)
      (mt/dataset sample-dataset
        (mt/with-temp* [Card [inner-card
                              {:dataset_query
                               (mt/mbql-query reviews
                                 {:fields [$id]
                                  :joins [{:source-table $$products
                                           :alias "P"
                                           :fields [&P.products.id &P.products.ean]
                                           :condition [:= $product_id &P.products.id]}]})}]
                        Card [outer-card
                              {:dataset_query
                               (mt/mbql-query orders
                                 {:fields [$id]
                                  :joins [{:source-table (str "card__" (:id inner-card))
                                           :alias "RP"
                                           :fields [&RP.reviews.id &RP.products.id &RP.products.ean]
                                           :condition [:= $product_id &RP.products.id]}]})}]]
          (is (= :completed
                 (-> (query-with-source-card outer-card :limit 1)
                     qp/process-query
                     :status))))))))

(deftest source-card-id-test
  (testing "Make sure we can run queries using source table `card__id` format."
    ;; This is the format that is actually used by the frontend; it gets translated to the normal `source-query`
    ;; format by middleware. It's provided as a convenience so only minimal changes need to be made to the frontend.
    (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries :basic-aggregations)
      (t2.with-temp/with-temp [Card card (venues-mbql-card-def)]
        (is (= (breakout-results)
               (qp.test/rows-and-cols
                (mt/format-rows-by [int int]
                  (qp/process-query
                   (query-with-source-card card
                                           (mt/$ids venues
                                             {:aggregation [:count]
                                              :breakout    [$price]})))))))))))

(deftest grouped-expression-in-card-test
  (testing "Nested grouped expressions work (#23862)."
    ;; TODO make this work for other drivers supporting :nested-queries :expressions :basic-aggregations
    (mt/test-drivers #{:h2 :postgres :mongo}
      (t2.with-temp/with-temp [Card card {:dataset_query
                                          (mt/mbql-query venues
                                            {:aggregation [[:count]]
                                             :breakout [[:expression "Price level"]]
                                             :expressions {"Price level" [:case [[[:> $price 2] "expensive"]] {:default "budget"}]}
                                             :limit 2})}]
        (is (= [["budget"    81]
                ["expensive" 19]]
               (mt/rows
                (qp/process-query
                 (query-with-source-card card)))))))))

(deftest card-id-native-source-queries-test
  (let [run-native-query
        (fn [sql]
          (t2.with-temp/with-temp [Card card {:dataset_query {:database (mt/id), :type :native, :native {:query sql}}}]
            (qp.test/rows-and-cols
             (mt/format-rows-by [int int]
               (qp/process-query
                (query-with-source-card card
                                        (mt/$ids venues
                                          {:aggregation [:count]
                                           :breakout    [*price]})))))))]
    (is (= (breakout-results :has-source-metadata? false :native-source? true)
           (run-native-query "SELECT * FROM VENUES"))
        "make sure `card__id`-style queries work with native source queries as well")
    (is (= (breakout-results :has-source-metadata? false :native-source? true)
           (run-native-query "SELECT * FROM VENUES -- small comment here"))
        "Ensure trailing comments are trimmed and don't cause a wrapping SQL query to fail")
    (is (= (breakout-results :has-source-metadata? false :native-source? true)
           (run-native-query "SELECT * FROM VENUES -- small comment here\n"))
        "Ensure trailing comments followed by a newline are trimmed and don't cause a wrapping SQL query to fail")))

(deftest filter-by-field-literal-test
  (testing "make sure we can filter by a field literal"
    ;; TODO make this work for other drivers supporting :nested-queries
    (mt/test-drivers #{:h2 :postgres :mongo}
      (is (= {:rows [[1 "Red Medicine" 4 10.0646 -165.374 3]]
              :cols (mapv (partial qp.test/col :venues)
                          [:id :name :category_id :latitude :longitude :price])}
             (qp.test/rows-and-cols
              (mt/run-mbql-query venues
                                 {:source-query {:source-table $$venues}
                                  :filter       [:= *id 1]})))))))

(defn- honeysql->sql
  "Convert `honeysql-form` to the format returned by `compile`. Writing HoneySQL is a lot easier that writing
  giant SQL strings for the 'expected' part of the tests below."
  [honeysql-form]
  (let [[sql & params] (sql/format honeysql-form {:dialect :ansi, :quoted true, :quoted-snake false})]
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
           :where  [:= [:raw "\"source\".\"BIRD.ID\""] [:inline 1]]
           :limit  [:inline 10]})
         (qp/compile
          {:database (mt/id)
           :type     :query
           :query    {:source-query {:source-table (mt/id :venues)}
                      :filter       [:= [:field "BIRD.ID" {:base-type :type/Integer}] 1]
                      :limit        10}}))
      (str "make sure that dots in field literal identifiers get handled properly so you can't reference fields "
           "from other tables using them"))
  (mt/with-temporary-setting-values [start-of-week :sunday]
    (is (= (honeysql->sql
            {:select [[:source.ID :ID]
                      [:source.NAME :NAME]
                      [:source.CATEGORY_ID :CATEGORY_ID]
                      [:source.LATITUDE :LATITUDE]
                      [:source.LONGITUDE :LONGITUDE]
                      [:source.PRICE :PRICE]]
             :from   [[venues-source-honeysql :source]]
             :where  [:and
                      [:>= [:raw "\"source\".\"BIRD.ID\""] (t/zoned-date-time "2017-01-01T00:00Z[UTC]")]
                      [:< [:raw "\"source\".\"BIRD.ID\""]  (t/zoned-date-time "2017-01-08T00:00Z[UTC]")]]
             :limit  [:inline 10]})
           (qp/compile
            (mt/mbql-query venues
              {:source-query {:source-table $$venues}
               :filter       [:= !week.*BIRD.ID/DateTime "2017-01-01"]
               :limit        10})))
        "make sure that field-literals work as DateTimeFields")))

(deftest aggregatation-references-test
  (testing "make sure that aggregation references match up to aggregations from the same level they're from"
    ;; e.g. the ORDER BY in the source-query should refer the 'stddev' aggregation, NOT the 'avg' aggregation
    (is (= {:query ["SELECT"
                    "  AVG(\"source\".\"stddev\") AS \"avg\""
                    "FROM"
                    "  ("
                    "    SELECT"
                    "      \"PUBLIC\".\"VENUES\".\"PRICE\" AS \"PRICE\","
                    "      STDDEV_POP(\"PUBLIC\".\"VENUES\".\"ID\") AS \"stddev\""
                    "    FROM"
                    "      \"PUBLIC\".\"VENUES\""
                    "    GROUP BY"
                    "      \"PUBLIC\".\"VENUES\".\"PRICE\""
                    "    ORDER BY"
                    "      \"stddev\" DESC,"
                    "      \"PUBLIC\".\"VENUES\".\"PRICE\" ASC"
                    "  ) AS \"source\""]
            :params nil}
           (-> (qp/compile
                (mt/mbql-query venues
                  {:source-query {:source-table $$venues
                                  :aggregation  [[:stddev $id]]
                                  :breakout     [$price]
                                  :order-by     [[[:aggregation 0] :descending]]}
                   :aggregation  [[:avg *stddev/Integer]]}))
               (update :query #(str/split-lines (driver/prettify-native-form :h2 %))))))))

(deftest handle-incorrect-field-forms-gracefully-test
  (testing "make sure that we handle [:field [:field <name> ...]] forms gracefully, despite that not making any sense"
    (is (sql= '{:select   [source.CATEGORY_ID AS CATEGORY_ID]
                :from     [{:select [VENUES.ID          AS ID
                                     VENUES.NAME        AS NAME
                                     VENUES.CATEGORY_ID AS CATEGORY_ID
                                     VENUES.LATITUDE    AS LATITUDE
                                     VENUES.LONGITUDE   AS LONGITUDE
                                     VENUES.PRICE       AS PRICE]
                            :from [VENUES]}
                           AS source]
                :group-by [source.CATEGORY_ID]
                :order-by [source.CATEGORY_ID ASC]
                :limit    [10]}
              (mt/mbql-query venues
                {:source-query {:source-table $$venues}
                 :breakout     [[:field [:field "category_id" {:base-type :type/Integer}] nil]]
                 :limit        10})))))

(deftest filter-by-string-fields-test
  (testing "Make sure we can filter by string fields from a source query"
    (is (= (honeysql->sql
            {:select [[:source.ID :ID]
                      [:source.NAME :NAME]
                      [:source.CATEGORY_ID :CATEGORY_ID]
                      [:source.LATITUDE :LATITUDE]
                      [:source.LONGITUDE :LONGITUDE]
                      [:source.PRICE :PRICE]]
             :from   [[venues-source-honeysql :source]]
             :where  [:or [:not= :source.text "Coo"]
                      [:= :source.text nil]]
             :limit  [:inline 10]})
           (qp/compile
            (mt/mbql-query nil
              {:source-query {:source-table $$venues}
               :limit        10
               :filter       [:!= [:field "text" {:base-type :type/Text}] "Coo"]}))))))

(deftest filter-by-number-fields-test
  (testing "Make sure we can filter by number fields form a source query"
    (is (= (honeysql->sql
            {:select [[:source.ID :ID]
                      [:source.NAME :NAME]
                      [:source.CATEGORY_ID :CATEGORY_ID]
                      [:source.LATITUDE :LATITUDE]
                      [:source.LONGITUDE :LONGITUDE]
                      [:source.PRICE :PRICE]]
             :from   [[venues-source-honeysql :source]]
             :where  [:> :source.sender_id [:inline 3]]
             :limit  [:inline 10]})
           (qp/compile
            (mt/mbql-query nil
              {:source-query {:source-table $$venues}
               :limit        10
               :filter       [:> *sender_id/Integer 3]}))))))

(deftest native-query-with-default-params-as-source-test
  (testing "make sure using a native query with default params as a source works"
    (is (= {:query  "SELECT \"source\".* FROM (SELECT * FROM PRODUCTS WHERE CATEGORY = ? LIMIT 10) AS \"source\" LIMIT 1048575"
            :params ["Widget"]}
           (t2.with-temp/with-temp [Card card {:dataset_query {:database (mt/id)
                                                               :type     :native
                                                               :native   {:query         "SELECT * FROM PRODUCTS WHERE CATEGORY = {{category}} LIMIT 10"
                                                                          :template-tags {:category {:name         "category"
                                                                                                     :display_name "Category"
                                                                                                     :type         "text"
                                                                                                     :required     true
                                                                                                     :default      "Widget"}}}}}]
             (qp/compile
              {:database (mt/id)
               :type     :query
               :query    {:source-table (str "card__" (u/the-id card))}}))))))

(deftest correct-column-metadata-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries)
    (testing "make sure a query using a source query comes back with the correct columns metadata"
      (is (= (map (partial qp.test/col :venues)
                  [:id :name :category_id :latitude :longitude :price])
             ;; todo: i don't know why the results don't have the information
             (mt/cols
              (t2.with-temp/with-temp [Card card (venues-mbql-card-def)]
                (qp/process-query (query-with-source-card card)))))))

    (testing "make sure a breakout/aggregate query using a source query comes back with the correct columns metadata"
      (is (= [(qp.test/breakout-col (qp.test/col :venues :price))
              (qp.test/aggregate-col :count)]
             (mt/cols
              (t2.with-temp/with-temp [Card card (venues-mbql-card-def)]
                (qp/process-query
                 (query-with-source-card card
                                         (mt/$ids venues
                                           {:aggregation [[:count]]
                                            :breakout    [$price]})))))))))

  (testing "make sure nested queries return the right columns metadata for SQL source queries and datetime breakouts"
    (is (= [(-> (qp.test/breakout-col (qp.test/field-literal-col :checkins :date))
                (assoc :field_ref    [:field "DATE" {:base-type :type/Date, :temporal-unit :day}]
                       :unit         :day)
                ;; because this field literal comes from a native query that does not include `:source-metadata` it won't have
                ;; the usual extra keys
                (dissoc :semantic_type :coercion_strategy :table_id
                        :id :settings :fingerprint :nfc_path))
            (qp.test/aggregate-col :count)]
           (mt/cols
            (t2.with-temp/with-temp [Card card {:dataset_query {:database (mt/id)
                                                                :type     :native
                                                                :native   {:query "SELECT * FROM CHECKINS"}}}]
              (qp/process-query
               (query-with-source-card card
                                       (mt/$ids checkins
                                         {:aggregation [[:count]]
                                          :breakout    [!day.*date]})))))))))

(deftest breakout-year-test
  ;; TODO make this work for other drivers supporting :nested-queries
  (mt/test-drivers #{:h2 :postgres :mongo}
    (testing (str "make sure when doing a nested query we give you metadata that would suggest you should be able to "
                  "break out a *YEAR*")
      (let [source-query (mt/$ids checkins
                           {:source-table $$checkins
                            :aggregation  [[:count]]
                            :breakout     [!year.date]})]
        (t2.with-temp/with-temp [Card card (mbql-card-def source-query)]
          (let [[date-col count-col] (for [col (-> (qp/process-query {:database (mt/id), :type :query, :query source-query})
                                                   :data :cols)]
                                       (-> (into {} col)
                                           (assoc :source :fields)))]
            ;; since the bucketing is happening in the source query rather than at this level, the field ref should
            ;; return temporal unit `:default` rather than the upstream bucketing unit. You wouldn't want to re-apply
            ;; the `:year` bucketing if you used this query in another subsequent query, so the field ref doesn't
            ;; include the unit; however `:unit` is still `:year` so the frontend can use the correct formatting to
            ;; display values of the column.
            (is (= [(assoc date-col  :field_ref [:field (mt/id :checkins :date) {:temporal-unit :default}], :unit :year)
                    (assoc count-col :field_ref [:field "count" {:base-type :type/Integer}])]
                   (mt/cols
                    (qp/process-query (query-with-source-card card)))))))))))

(defn- completed-status [{:keys [status], :as results}]
  (if (= status :completed)
    status
    results))

(deftest time-interval-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries)
    (testing "make sure using a time interval filter works"
      (t2.with-temp/with-temp [Card card (mbql-card-def (mt/$ids {:source-table $$checkins}))]
        (let [query (query-with-source-card card
                                            (mt/$ids checkins
                                              {:filter [:time-interval *date -30 :day]}))]
          (mt/with-native-query-testing-context query
            (is (=? {:status :completed}
                    (qp/process-query query)))))))))

(deftest datetime-field-literals-in-filters-and-breakouts-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries)
    (testing "make sure that bucketing a `:field` w/ name works correctly in filters & breakouts"
      (t2.with-temp/with-temp [Card card (mbql-card-def (mt/$ids {:source-table $$checkins}))]
        (is (= :completed
               (-> (query-with-source-card card
                                           (mt/$ids :checkins
                                             {:aggregation [[:count]]
                                              :filter      [:= !quarter.*date "2014-01-01T08:00:00.000Z"]
                                              :breakout    [!month.*date]}))
                   qp/process-query
                   completed-status)))))))

(deftest drag-to-filter-timeseries-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries)
    (testing "make sure timeseries queries generated by \"drag-to-filter\" work correctly"
      (t2.with-temp/with-temp [Card card (mbql-card-def (mt/$ids {:source-table $$checkins}))]
        (is (= :completed
               (-> (query-with-source-card card
                                           (mt/$ids checkins
                                             {:aggregation [[:count]]
                                              :breakout    [!week.*date]
                                              :filter      [:between !week.*date "2014-02-01T00:00:00-08:00" "2014-05-01T00:00:00-07:00"]}))
                   (qp/process-query)
                   (completed-status))))))))

(deftest macroexpansion-test
  (testing "Make sure that macro expansion works inside of a neested query, when using a compound filter clause (#5974)"
    (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries)
      (mt/with-temp* [Segment [segment (mt/$ids {:table_id   $$venues
                                                 :definition {:filter [:= $venues.price 1]}})]
                      Card    [card (mbql-card-def
                                      :source-table (mt/id :venues)
                                      :filter       [:and [:segment (u/the-id segment)]])]]
        (is (= [[22]]
               (mt/formatted-rows [int]
                 (qp/process-query
                  (query-with-source-card card
                    {:aggregation [:count]})))))))))

(deftest card-perms-test
  (testing "perms for a Card with a SQL source query\n"
    (testing "reading should require that you have read permissions for the Card's Collection"
      (mt/with-temp* [Collection [collection]
                      Card       [card {:collection_id (u/the-id collection)
                                        :dataset_query (mt/native-query {:query "SELECT * FROM VENUES"})}]]
        (is (= #{(perms/collection-read-path collection)}
               (query-perms/perms-set (query-with-source-card card :aggregation [:count]))))))

    (testing "should be able to save even if you don't have SQL write perms (#6845)"
      (t2.with-temp/with-temp [Card card {:dataset_query (mt/native-query {:query "SELECT * FROM VENUES"})}]
        (is (= #{(perms/collection-read-path collection/root-collection)}
               (query-perms/perms-set (query-with-source-card card :aggregation [:count])))))))

  (testing "perms for Card -> Card -> MBQL Source query\n"
    (testing "You should be able to read a Card with a source Card if you can read that Card and their Collections (#12354)\n"
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp-copy-of-db
          (perms/revoke-data-perms! (perms-group/all-users) (mt/id))
          (mt/with-temp* [Collection [collection]
                          Card       [card-1 {:collection_id (u/the-id collection)
                                              :dataset_query (mt/mbql-query venues {:order-by [[:asc $id]], :limit 2})}]
                          Card       [card-2 {:collection_id (u/the-id collection)
                                              :dataset_query (mt/mbql-query nil
                                                               {:source-table (format "card__%d" (u/the-id card-1))})}]]
            (testing "read perms for both Cards should be the same as reading the parent collection")
            (is (= (mi/perms-objects-set collection :read)
                   (mi/perms-objects-set card-1 :read)
                   (mi/perms-objects-set card-2 :read)))

            (testing "\nSanity check: shouldn't be able to read before we grant permissions\n"
              (doseq [[object-name object] {"Collection" collection
                                            "Card 1"     card-1
                                            "Card 2"     card-2}]
                (mt/with-test-user :rasta
                  (testing object-name
                    (is (= false
                           (mi/can-read? object)))))))

            (testing "\nshould be able to read nested-nested Card if we have Collection permissions\n"
              (perms/grant-collection-read-permissions! (perms-group/all-users) collection)
              (mt/with-test-user :rasta
                (doseq [[object-name object] {"Collection" collection
                                              "Card 1"     card-1
                                              "Card 2"     card-2}]
                  (testing object-name
                    (is (= true
                           (mi/can-read? object)))))

                (testing "\nshould be able to run the query"
                  (is (= [[1 "Red Medicine"           4 10.0646 -165.374 3]
                          [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2]]
                         (mt/rows
                          (binding [qp.perms/*card-id* (u/the-id card-2)]
                            (qp/process-query (:dataset_query card-2)))))))))))))))

;; try this in an end-to-end fashion using the API and make sure we can save a Card if we have appropriate read
;; permissions for the source query
(defn- save-card-via-API-with-native-source-query!
  "Attempt to save a Card that uses a native source query and belongs to a Collection with `collection-id` via the API
  using Rasta. Use this to test how the API endpoint behaves based on certain permissions grants for the `All Users`
  group."
  [expected-status-code db-or-id source-collection-or-id-or-nil dest-collection-or-id-or-nil]
  (t2.with-temp/with-temp [Card card {:collection_id (some-> source-collection-or-id-or-nil u/the-id)
                                      :dataset_query {:database (u/the-id db-or-id)
                                                      :type     :native
                                                      :native   {:query "SELECT * FROM VENUES"}}}]
    (mt/user-http-request :rasta :post expected-status-code "card"
                          {:name                   (mt/random-name)
                           :collection_id          (some-> dest-collection-or-id-or-nil u/the-id)
                           :display                "scalar"
                           :visualization_settings {}
                           :dataset_query          (query-with-source-card card
                                                                           :aggregation [:count])})))

(deftest save-card-with-source-query-via-api-test
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp-copy-of-db
      (testing (str "To save a Card that uses another Card as its source, you only need read permissions for the Collection "
                    "the Source Card is in, and write permissions for the Collection you're trying to save the new Card in")
        (mt/with-temp* [Collection [source-card-collection]
                        Collection [dest-card-collection]]
          (perms/grant-collection-read-permissions!      (perms-group/all-users) source-card-collection)
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) dest-card-collection)
          (is (some? (save-card-via-API-with-native-source-query! 200 (mt/db) source-card-collection dest-card-collection)))))

      (testing (str "however, if we do *not* have read permissions for the source Card's collection we shouldn't be "
                    "allowed to save the query. This API call should fail")
        (testing "Card in the Root Collection"
          (t2.with-temp/with-temp [Collection dest-card-collection]
            (perms/grant-collection-readwrite-permissions! (perms-group/all-users) dest-card-collection)
            (is (schema= {:message  (s/eq "You cannot save this Question because you do not have permissions to run its query.")
                          s/Keyword s/Any}
                         (save-card-via-API-with-native-source-query! 403 (mt/db) nil dest-card-collection)))))

        (testing "Card in a different Collection for which we do not have perms"
          (mt/with-temp* [Collection [source-card-collection]
                          Collection [dest-card-collection]]
            (perms/grant-collection-readwrite-permissions! (perms-group/all-users) dest-card-collection)
            (is (schema= {:message  (s/eq "You cannot save this Question because you do not have permissions to run its query.")
                          s/Keyword s/Any}
                         (save-card-via-API-with-native-source-query! 403 (mt/db) source-card-collection dest-card-collection)))))

        (testing "similarly, if we don't have *write* perms for the dest collection it should also fail"
          (testing "Try to save in the Root Collection"
            (t2.with-temp/with-temp [Collection source-card-collection]
              (perms/grant-collection-read-permissions! (perms-group/all-users) source-card-collection)
              (is (schema= {:message (s/eq "You do not have curate permissions for this Collection.")
                            s/Keyword s/Any}
                           (save-card-via-API-with-native-source-query! 403 (mt/db) source-card-collection nil)))))

          (testing "Try to save in a different Collection for which we do not have perms"
            (mt/with-temp* [Collection [source-card-collection]
                            Collection [dest-card-collection]]
              (perms/grant-collection-read-permissions! (perms-group/all-users) source-card-collection)
              (is (schema= {:message (s/eq "You do not have curate permissions for this Collection.")
                            s/Keyword s/Any}
                           (save-card-via-API-with-native-source-query! 403 (mt/db) source-card-collection dest-card-collection))))))))))

(deftest infer-source-fields-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries)
    (testing (str "make sure that if we refer to a Field that is actually inside the source query, the QP is smart "
                  "enough to figure out what you were referring to and behave appropriately")
      (is (= [[10]]
             (mt/formatted-rows [int]
               (mt/run-mbql-query venues
                 {:source-query {:source-table $$venues
                                 :fields       [$id $name $category_id $latitude $longitude $price]}
                  :aggregation  [[:count]]
                  :filter       [:= $category_id 50]})))))))

(deftest nested-query-with-joins-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries :foreign-keys)
    (testing "make sure that if a nested query includes joins queries based on it still work correctly (#8972)"
      (is (= [[31 "Bludso's BBQ"         5 33.8894 -118.207 2]
              [32 "Boneyard Bistro"      5 34.1477 -118.428 3]
              [33 "My Brother's Bar-B-Q" 5 34.167  -118.595 2]
              [35 "Smoke City Market"    5 34.1661 -118.448 1]
              [37 "bigmista's barbecue"  5 34.118  -118.26  2]
              [38 "Zeke's Smokehouse"    5 34.2053 -118.226 2]
              [39 "Baby Blues BBQ"       5 34.0003 -118.465 2]]
             (mt/formatted-rows :venues
               (qp/process-query
                (mt/mbql-query venues
                  {:source-query
                   {:source-table $$venues
                    :filter       [:= $venues.category_id->categories.name "BBQ"]
                    :order-by     [[:asc $id]]}}))))))))

(deftest parse-datetime-strings-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries)
    (testing "Make sure we parse datetime strings when compared against type/DateTime field literals (#9007)"
      (is (= [[395]
              [980]]
             (mt/formatted-rows [int]
               (mt/run-mbql-query checkins
                 {:source-query {:source-table $$checkins}
                  :fields       [$id]
                  :filter       [:= *date "2014-03-30"]
                  :order-by     [[:asc $id]]})))))))

(deftest aapply-filters-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries :foreign-keys)
    (testing "make sure filters in source queries are applied correctly!"
      (is (= [["Fred 62"     1]
              ["Frolic Room" 1]]
             (mt/formatted-rows [str int]
               (mt/run-mbql-query checkins
                 {:source-query {:source-table $$checkins
                                 :filter       [:> $date "2015-01-01"]}
                  :aggregation  [:count]
                  :order-by     [[:asc $venue_id->venues.name]]
                  :breakout     [$venue_id->venues.name]
                  :filter       [:starts-with $venue_id->venues.name "F"]})))))))

(deftest two-of-the-same-aggregations-test
  ;; TODO make this work for other drivers supporting :nested-queries
  (mt/test-drivers (disj (mt/normal-drivers-with-feature :nested-queries)
                         :vertica :sqlite :presto-jdbc :starburst)
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

(deftest expressions-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries :foreign-keys :expressions)
    (testing "can you use nested queries that have expressions in them?"
      (let [query (mt/mbql-query venues
                    {:fields      [[:expression "price-times-ten"]]
                     :expressions {"price-times-ten" [:* $price 10]}
                     :order-by    [[:asc $id]]
                     :limit       2})]
        (is (= [[30] [20]]
               (mt/formatted-rows [int int]
                 (mt/run-mbql-query venues
                   {:source-query (:query query)}))))

        (testing "if source query is from a Card"
          (t2.with-temp/with-temp [Card {card-id :id} {:dataset_query query}]
            (is (= [[30] [20]]
                   (mt/formatted-rows [int int]
                     (mt/run-mbql-query nil
                       {:source-table (str "card__" card-id)}))))))))))

(deftest bucketing-already-bucketed-year-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries)
    (testing "If a field is bucketed as a year in a source query, bucketing it as a year shouldn't break things (#10446)"
      ;; (Normally, it would break things, but the new `simplify` middleware eliminates the duplicate cast. It is not
      ;; currently possible to cast a DateTime field to a year in MBQL, and then cast it a second time in an another
      ;; query using the first as a source. This is a side-effect of MBQL year bucketing coming back as values like
      ;; `2016` rather than timestamps
      (is (= [[(if (= :sqlite driver/*driver*) "2013-01-01" "2013-01-01T00:00:00Z")]]
             (mt/rows
               (mt/run-mbql-query checkins
                 {:source-query {:source-table $$checkins
                                 :fields       [!year.date]
                                 :order-by     [[:asc !year.date]]
                                 :limit        1}
                  :fields       [!year.*date]})))))))

(deftest correctly-alias-duplicate-names-in-breakout-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries :expressions :foreign-keys)
    (testing "Do we correctly alias name clashes in breakout (#10511)"
      (let [results (mt/run-mbql-query venues
                      {:source-query {:source-table $$venues
                                      :aggregation  [[:count]]
                                      :breakout     [$name &c.categories.name]
                                      :joins        [{:source-table $$categories
                                                      :alias        "c"
                                                      :condition    [:= $category_id &c.categories.id]}]}
                       :filter       [:> [:field "count" {:base-type :type/Number}] 0]
                       :limit        3})]
        (is (= [[ "20th Century Cafe" "Café" 1]
                [ "25°" "Burger" 1]
                [ "33 Taps" "Bar" 1]]
               (mt/formatted-rows [str str int]
                 results)))
        (is (= (mt/$ids venues
                 [{:name         (mt/format-name "name")
                   :display_name "Name"
                   :id           %name
                   :field_ref    $name
                   :base_type    :type/Text}
                  {:name         (mt/format-name "name_2")
                   :display_name "c → Name"
                   :id           %categories.name
                   :field_ref    &c.categories.name
                   :base_type    :type/Text}
                  {:name         "count"
                   :display_name "Count"
                   :field_ref    [:field "count" {:base-type :type/Integer}]
                   :base_type    (:base_type (qp.test/aggregate-col :count))}])
               (for [col (mt/cols results)]
                 (select-keys col [:name :display_name :id :field_ref :base_type]))))))))

(deftest remapped-fks-test
  (testing "Should be able to use a question with remapped FK columns as a Saved Question (#10474)"
    (mt/dataset sample-dataset
      ;; Add column remapping from Orders Product ID -> Products.Title
      (t2.with-temp/with-temp [Dimension _ (mt/$ids orders
                                             {:field_id                %product_id
                                              :name                    "Product ID"
                                              :type                    :external
                                              :human_readable_field_id %products.title})]
        (let [card-results-metadata (let [result (mt/run-mbql-query orders {:limit 10})]
                                      (testing "Sanity check: should be able to query Orders"
                                        (is (schema= {:status   (s/eq :completed)
                                                      s/Keyword s/Any}
                                                     result)))
                                      (get-in result [:data :results_metadata :columns]))
              expected-cols         (qp/query->expected-cols (mt/mbql-query orders))]
          ;; Save a question with a query against orders. Should work regardless of whether Card has result_metadata
          (doseq [[description result-metadata] {"NONE"                   nil
                                                 "from running the query" card-results-metadata
                                                 "with QP expected cols"  expected-cols}]
            (testing (format "with Card with result metadata %s cols => %s"
                             description (pr-str (mapv :display_name result-metadata)))
              (t2.with-temp/with-temp [Card {card-id :id} {:dataset_query   (mt/mbql-query orders)
                                                           :result_metadata result-metadata}]
                ;; now try using this Card as a saved question,  should work
                (is (= {:rows    [[1 1  14  37.65 2.07  39.72 nil "2019-02-11T21:40:27.892Z" 2 "Awesome Concrete Shoes"]
                                  [2 1 123 110.93  6.1 117.03 nil "2018-05-15T08:04:04.58Z"  3 "Mediocre Wooden Bench"]]
                        :columns ["ID" "USER_ID" "PRODUCT_ID" "SUBTOTAL" "TAX" "TOTAL" "DISCOUNT" "CREATED_AT" "QUANTITY" "TITLE"]}
                       (mt/rows+column-names
                        (mt/run-mbql-query orders
                          {:source-table (str "card__" card-id), :limit 2, :order-by [[:asc $id]]}))))))))))))

(deftest nested-query-with-joins-test-2
  (testing "Should be able to use a query that contains joins as a source query (#14724)"
    (mt/dataset sample-dataset
      (letfn [(do-test [f]
                (let [results (mt/run-mbql-query orders
                                {:source-query {:source-table $$orders
                                                :joins        [{:fields       :all
                                                                :source-table $$products
                                                                :condition    [:= $product_id &Products.products.id]
                                                                :alias        "Products"}]}
                                 :limit        10})]
                  (is (schema= {:status    (s/eq :completed)
                                :row_count (s/eq 10)
                                s/Keyword  s/Any}
                               results))
                  (f results)))]
        (do-test
         (fn [results]
           (is (= [1 1 14 37.65 2.07 39.72 nil "2019-02-11T21:40:27.892Z" 2
                   14 "8833419218504" "Awesome Concrete Shoes" "Widget" "McClure-Lockman" 25.1
                   4.0 "2017-12-31T14:41:56.87Z"]
                  (first (mt/rows results))))))
        (mt/with-column-remappings [orders.product_id products.title]
          (do-test
           (fn [results]
             (is (= [1 1 14 37.65 2.07 39.72 nil "2019-02-11T21:40:27.892Z" 2 "Awesome Concrete Shoes" ; <- Extra remapped col
                     14 "8833419218504" "Awesome Concrete Shoes" "Widget" "McClure-Lockman" 25.1
                     4.0 "2017-12-31T14:41:56.87Z"]
                    (first (mt/rows results)))))))))))

(deftest inception-metadata-test
  (testing "Should be able to do an 'inception-style' nesting of source > source > source with a join (#14724)"
    (mt/dataset sample-dataset
      ;; these tests look at the metadata for just one column so it's easier to spot the differences.
      (letfn [(ean-metadata [result]
                (as-> result result
                  (get-in result [:data :results_metadata :columns])
                  (m/index-by :name result)
                  (get result "EAN")
                  (select-keys result [:name :display_name :base_type :id :field_ref])))]
        (testing "Make sure metadata is correct for the 'EAN' column with"
          (let [base-query (mt/mbql-query orders
                             {:source-table $$orders
                              :fields       [$id &Products.products.ean]
                              :joins        [{:fields       [&Products.products.ean]
                                              :source-table $$products
                                              :condition    [:= $product_id &Products.products.id]
                                              :alias        "Products"}]
                              :limit        10})]
            (doseq [level (range 4)]
              (testing (format "%d level(s) of nesting" level)
                (let [query (mt/nest-query base-query level)]
                  (testing (format "\nQuery = %s" (u/pprint-to-str query))
                    (is (= (mt/$ids products
                             {:name         "EAN"
                              :display_name "Products → Ean"
                              :base_type    :type/Text
                              :id           %ean
                              :field_ref    &Products.ean})
                           (ean-metadata (qp/process-query query))))))))))))))

(defn- field-id->name [field-id]
  (let [{field-name :name, table-id :table_id} (t2/select-one [Field :name :table_id] :id field-id)
        table-name                             (t2/select-one-fn :name Table :id table-id)]
    (format "%s.%s" table-name field-name)))

(deftest inception-test
  (testing "Should be able to do an 'inception-style' nesting of source > source > source with a join (#14724)"
    (mt/dataset sample-dataset
      (doseq [level (range 0 4)]
        (testing (format "with %d level(s) of nesting" level)
          (letfn [(run-query []
                    (let [query (-> (mt/mbql-query orders
                                      {:source-table $$orders
                                       :joins        [{:fields       :all
                                                       :source-table $$products
                                                       :condition    [:= $product_id &Products.products.id]
                                                       :alias        "Products"}]
                                       :order-by     [[:asc $id]]
                                       :limit        2})
                                    (mt/nest-query level))]
                      (qp/process-query query)))]
            (testing "with no FK remappings"
              (let [result (run-query)]
                (is (schema= {:status    (s/eq :completed)
                              :row_count (s/eq 2)
                              s/Keyword  s/Any}
                             result))
                (is (= [1 1 14 37.65 2.07 39.72 nil "2019-02-11T21:40:27.892Z" 2
                        14 "8833419218504" "Awesome Concrete Shoes" "Widget" "McClure-Lockman" 25.1 4.0
                        "2017-12-31T14:41:56.87Z"]
                       (mt/first-row result)))))
            (mt/with-column-remappings [orders.product_id products.title]
              (let [result (run-query)]
                (is (schema= {:status    (s/eq :completed)
                              :row_count (s/eq 2)
                              s/Keyword  s/Any}
                             result))
                (is (=  ["ORDERS.ID"
                         "ORDERS.USER_ID"
                         "ORDERS.PRODUCT_ID"
                         "ORDERS.SUBTOTAL"
                         "ORDERS.TAX"
                         "ORDERS.TOTAL"
                         "ORDERS.DISCOUNT"
                         "ORDERS.CREATED_AT"
                         "ORDERS.QUANTITY"
                         "PRODUCTS.TITLE"
                         "PRODUCTS.ID"
                         "PRODUCTS.EAN"
                         "PRODUCTS.TITLE"
                         "PRODUCTS.CATEGORY"
                         "PRODUCTS.VENDOR"
                         "PRODUCTS.PRICE"
                         "PRODUCTS.RATING"
                         "PRODUCTS.CREATED_AT"]
                        (mapv (comp field-id->name :id) (get-in result [:data :cols]))))
                (is (= [1 1 14 37.65 2.07 39.72 nil "2019-02-11T21:40:27.892Z" 2 "Awesome Concrete Shoes" ; <- extra remapped col
                        14 "8833419218504" "Awesome Concrete Shoes" "Widget" "McClure-Lockman"
                        25.1 4.0 "2017-12-31T14:41:56.87Z"]
                       (mt/first-row result)))))))))))

(deftest handle-unwrapped-joined-fields-correctly-test
  (mt/dataset sample-dataset
    (testing "References to joined fields should be handled correctly (#14766)"
      ;; using `$products.id` should give you the same results as properly referring to it with `&Products.products.id`
      (let [expected-result (mt/run-mbql-query orders
                              {:source-query {:source-table $$orders
                                              :joins        [{:fields       :all
                                                              :source-table $$products
                                                              :condition    [:= $product_id &Products.products.id]
                                                              :alias        "Products"}]}
                               :aggregation  [[:count]]
                               :breakout     [$products.id]
                               :limit        5})
            actual-result   (mt/run-mbql-query orders
                              {:source-query {:source-table $$orders
                                              :joins        [{:fields       :all
                                                              :source-table $$products
                                                              :condition    [:= $product_id &Products.products.id]
                                                              :alias        "Products"}]}
                               :aggregation  [[:count]]
                               :breakout     [&Products.products.id]
                               :limit        5})]
        (is (schema= {:status   (s/eq :completed)
                      s/Keyword s/Any}
                     expected-result))
        (is (schema= {:status   (s/eq :completed)
                      s/Keyword s/Any}
                     actual-result))
        (is (= (mt/rows expected-result)
               (mt/rows actual-result)))))))

(deftest duplicate-column-names-in-nested-queries-test
  (testing "duplicate column names in nested queries (#10511)"
    (mt/dataset sample-dataset
      (let [query (mt/mbql-query orders
                    {:filter       [:> *count/Integer 5]
                     :source-query {:source-table $$orders
                                    :aggregation  [[:count]]
                                    :breakout     [!month.created_at !month.product_id->products.created_at]}
                     :limit        5})]
        (mt/with-native-query-testing-context query
          (is (= [["2016-06-01T00:00:00Z" "2016-05-01T00:00:00Z" 13]
                  ["2016-07-01T00:00:00Z" "2016-05-01T00:00:00Z" 16]
                  ["2016-07-01T00:00:00Z" "2016-06-01T00:00:00Z" 10]
                  ["2016-07-01T00:00:00Z" "2016-07-01T00:00:00Z" 7]
                  ["2016-08-01T00:00:00Z" "2016-05-01T00:00:00Z" 12]]
                 (mt/rows (qp/process-query query)))))))))

(deftest nested-queries-with-joins-with-old-metadata-test
  (testing "Nested queries with joins using old pre-38 result metadata still work (#14788)"
    (mt/dataset sample-dataset
      ;; create the query we'll use as a source query
      (let [query    (mt/mbql-query orders
                       {:joins    [{:source-table $$products
                                    :alias        "ℙ"
                                    :fields       :all
                                    :condition    [:= $product_id &ℙ.products.id]}]
                        :order-by [[:asc $id]]
                        :limit    2})
            metadata (qp/query->expected-cols query)]
        (testing "x.38.0+: metadata should include `:field_ref`"
          (is (= (mt/$ids orders
                   [$id
                    $user_id
                    $product_id
                    $subtotal
                    $tax
                    $total
                    $discount
                    !default.created_at
                    $quantity
                    &ℙ.products.id
                    &ℙ.products.ean
                    &ℙ.products.title
                    &ℙ.products.category
                    &ℙ.products.vendor
                    &ℙ.products.price
                    &ℙ.products.rating
                    !default.&ℙ.products.created_at])
                 (map :field_ref metadata))))
        (testing "\nShould be able to use the query as a source query"
          (letfn [(test-query [query]
                    (is (schema= {:status    (s/eq :completed)
                                  :row_count (s/eq 2)
                                  s/Keyword  s/Any}
                                 (qp/process-query query))))
                  (test-source-query [metadata]
                    (test-query
                     (cond-> (mt/mbql-query nil
                               {:source-query (:query query)})
                       metadata (assoc-in [:query :source-metadata] metadata))))
                  (test-card-source-query [metadata]
                    (t2.with-temp/with-temp [Card {card-id :id} {:dataset_query   query
                                                                 :result_metadata metadata}]
                      (test-query
                       (mt/mbql-query nil
                         {:source-table (format "card__%d" card-id)}))))]
            (doseq [[msg test-query] {"directly"   test-source-query
                                      "via a Card" test-card-source-query}]
              (testing msg
                (testing "with NO source metadata"
                  (test-query nil))
                (testing "with 0.38.0+ source metadata that includes `:field_ref`"
                  (test-query metadata))
                (testing "with < 0.38.0 source metadata that DOES NOT include  `:field_ref` or `:id`"
                  (test-query (for [col metadata]
                                (dissoc col :field_ref :id))))))))))))

(deftest support-legacy-filter-clauses-test
  (testing "We should handle legacy usage of field-literal inside filter clauses"
    (mt/dataset sample-dataset
      (testing "against joins (#14809)"
        (is (schema= {:status   (s/eq :completed)
                      s/Keyword s/Any}
                     (mt/run-mbql-query orders
                       {:source-query {:source-table $$orders
                                       :joins        [{:fields       :all
                                                       :source-table $$products
                                                       :condition    [:= $product_id &Products.products.id]
                                                       :alias        "Products"}]}
                        :filter       [:= *CATEGORY/Text "Widget"]}))))
      (testing "(#14811)"
        (is (schema= {:status   (s/eq :completed)
                      s/Keyword s/Any}
                     (mt/run-mbql-query orders
                       {:source-query {:source-table $$orders
                                       :aggregation  [[:sum $product_id->products.price]]
                                       :breakout     [$product_id->products.category]}
                        ;; not sure why FE is using `field-literal` here... but it should work anyway.
                        :filter       [:= *CATEGORY/Text "Widget"]})))))))

(deftest support-legacy-dashboard-parameters-test
  (testing "We should handle legacy usage of field-literal inside (Dashboard) parameters (#14810)"
    (mt/dataset sample-dataset
      (is (schema= {:status   (s/eq :completed)
                    s/Keyword s/Any}
                   (qp/process-query
                    (mt/query orders
                      {:type       :query
                       :query      {:source-query {:source-table $$orders
                                                   :joins        [{:fields       :all
                                                                   :source-table $$products
                                                                   :condition    [:= $product_id &Products.products.id]
                                                                   :alias        "Products"}]}
                                    :limit        2}
                       :parameters [{:type   :category
                                     :target [:dimension [:field "CATEGORY" {:base-type :type/Text}]]
                                     :value  "Widget"}]})))))))

(deftest nested-queries-with-expressions-and-joins-test
  (mt/test-drivers (mt/normal-drivers-with-feature :foreign-keys :nested-queries :left-join)
    (mt/dataset sample-dataset
      (testing "Do nested queries in combination with joins and expressions still work correctly? (#14969)"
        (is (= (cond-> [["Twitter" "Widget" 0 498.59]
                        ["Twitter" nil      0 401.51]]
                 (mt/sorts-nil-first? driver/*driver* :type/Text) reverse)
               (mt/formatted-rows [str str int 2.0]
                 (mt/run-mbql-query orders
                   {:source-query {:source-table $$orders
                                   :filter       [:= $user_id 1]
                                   :fields       [$id
                                                  $user_id
                                                  $product_id
                                                  $subtotal
                                                  $tax
                                                  $total
                                                  $discount
                                                  !default.created_at
                                                  $quantity]}
                    :aggregation  [[:sum $total]]
                    :breakout     [&P.people.source
                                   &PRODUCTS__via__PRODUCT_ID.products.category
                                   [:expression "pivot-grouping"]]
                    :limit        5
                    :expressions  {:pivot-grouping [:abs 0]}
                    :order-by     [[:asc &P.people.source]
                                   [:asc &PRODUCTS__via__PRODUCT_ID.products.category]
                                   [:asc [:expression "pivot-grouping"]]]
                    :joins        [{:strategy     :left-join
                                    :source-table $$people
                                    :condition    [:= $user_id &P.people.id]
                                    :alias        "P"}
                                   {:source-query {:source-table $$products
                                                   :filter       [:= $products.category "Widget"]
                                                   :fields       [$products.id
                                                                  $products.ean
                                                                  $products.title
                                                                  $products.category
                                                                  $products.vendor
                                                                  $products.price
                                                                  $products.rating
                                                                  !default.products.created_at]}
                                    :strategy     :left-join
                                    :alias        "PRODUCTS__via__PRODUCT_ID"
                                    :condition    [:= $product_id &PRODUCTS__via__PRODUCT_ID.products.id]
                                    :fk-field-id  %product_id}]}))))))))

(deftest multi-level-aggregations-with-post-aggregation-filtering-test
  (mt/test-drivers (mt/normal-drivers-with-feature :foreign-keys :nested-queries)
    (testing "Multi-level aggregations with filter is the last section (#14872)"
      (mt/dataset sample-dataset
        (let [query (mt/mbql-query orders
                      {:source-query {:source-query {:source-table $$orders
                                                     :filter       [:= $user_id 1]
                                                     :aggregation  [[:sum $total]]
                                                     :breakout     [!day.created_at
                                                                    $product_id->products.title
                                                                    $product_id->products.category]}
                                      :filter       [:> *sum/Float 100]
                                      :aggregation  [[:sum *sum/Float]]
                                      :breakout     [*products.title]}
                       :filter       [:> *sum/Float 100]})]
          (mt/with-native-query-testing-context query
            (is (= [["Awesome Bronze Plate" 115.23]
                    ["Mediocre Rubber Shoes" 101.04]
                    ["Mediocre Wooden Bench" 117.03]
                    ["Sleek Steel Table" 134.91]
                    ["Small Marble Hat" 102.8]]
                   (mt/formatted-rows [str 2.0]
                     (qp/process-query query))))))))))

(deftest date-range-test
  (mt/test-drivers (mt/normal-drivers-with-feature :foreign-keys :nested-queries)
    (testing "Date ranges should work the same in nested queries as is regular queries (#15352)"
      (mt/dataset sample-dataset
        (let [q1        (mt/mbql-query orders
                          {:aggregation [[:count]]
                           :filter      [:between $created_at "2020-02-01" "2020-02-29"]})
              q1-native {:query  (str "SELECT COUNT(*) AS \"count\" "
                                      "FROM \"PUBLIC\".\"ORDERS\" "
                                      "WHERE (\"PUBLIC\".\"ORDERS\".\"CREATED_AT\" >= ?)"
                                      " AND (\"PUBLIC\".\"ORDERS\".\"CREATED_AT\" < ?)")
                         :params [#t "2020-02-01T00:00Z[UTC]" #t "2020-03-01T00:00Z[UTC]"]}]
          (testing "original query"
            (when (= driver/*driver* :h2)
              (is (= q1-native
                     (qp/compile q1))))
            (is (= [[543]]
                   (mt/formatted-rows [int] (qp/process-query q1)))))
          (testing "nested query"
            (let [q2 (mt/mbql-query nil
                       {:source-query (:query q1)})]
              (when (= driver/*driver* :h2)
                (is (= (update q1-native :query (fn [s]
                                                  (format (str "SELECT \"source\".\"count\" AS \"count\" "
                                                               "FROM (%s) AS \"source\" "
                                                               "LIMIT 1048575")
                                                          s)))
                       (qp/compile q2))))
              (is (= [[543]]
                     (mt/formatted-rows [int] (qp/process-query q2)))))))))))

(deftest nested-query-with-metric-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries)
    (testing "A nested query with a Metric should work as expected (#12507)"
      (t2.with-temp/with-temp [Metric metric (mt/$ids checkins
                                               {:table_id   $$checkins
                                                :definition {:source-table $$checkins
                                                             :aggregation  [[:count]]
                                                             :filter       [:not-null $id]}})]
        (is (= [[100]]
               (mt/formatted-rows [int]
                 (mt/run-mbql-query checkins
                   {:source-query {:source-table $$checkins
                                   :aggregation  [[:metric (u/the-id metric)]]
                                   :breakout     [$venue_id]}
                    :aggregation  [[:count]]}))))))))

(deftest nested-query-with-expressions-test
  (testing "Nested queries with expressions should work in top-level native queries (#12236)"
    (mt/test-drivers (mt/normal-drivers-with-feature
                      :nested-queries
                      :basic-aggregations
                      :expression-aggregations
                      :foreign-keys)
      (mt/dataset sample-dataset
        (t2.with-temp/with-temp [Card card {:dataset_query (mt/mbql-query orders
                                                             {:filter      [:between $total 30 60]
                                                              :aggregation [[:aggregation-options
                                                                             [:count-where [:starts-with $product_id->products.category "G"]]
                                                                             {:name "G Monies", :display-name "G Monies"}]]
                                                              :breakout    [!month.created_at]
                                                              :limit       2})}]
          (let [card-tag (str "#" (u/the-id card))
                query    (mt/native-query
                           {:query         (format "SELECT * FROM {{%s}} x" card-tag)
                            :template-tags {card-tag
                                            {:id           "5aa37572-058f-14f6-179d-a158ad6c029d"
                                             :name         card-tag
                                             :display-name card-tag
                                             :type         :card
                                             :card-id      (u/the-id card)}}})]
            (is (= [["2016-04-01T00:00:00Z" 1]
                    ["2016-05-01T00:00:00Z" 5]]
                   (mt/formatted-rows [str int]
                     (qp/process-query query))))))))))

(deftest join-against-query-with-implicit-joins-test
  (testing "Should be able to do subsequent joins against a query with implicit joins (#17767)"
    (mt/test-drivers (mt/normal-drivers-with-feature
                      :nested-queries
                      :basic-aggregations
                      :foreign-keys
                      :left-join)
      (mt/dataset sample-dataset
        (let [query (mt/mbql-query orders
                      {:source-query {:source-table $$orders
                                      :aggregation  [[:count]]
                                      :breakout     [$product_id->products.id]}
                       :joins        [{:fields       :all
                                       :source-table $$reviews
                                       ;; It's wack that the FE is using a FIELD LITERAL here but it should still work
                                       ;; anyway.
                                       :condition    [:= *products.id &Reviews.reviews.product_id]
                                       :alias        "Reviews"}]
                       :order-by     [[:asc $product_id->products.id]
                                      [:asc &Reviews.products.id]]
                       :limit        1})]
          (sql.qp-test-util/with-native-query-testing-context query
            (testing "results"
              (is (= [[1
                       93
                       1
                       1
                       "christ"
                       5
                       "Ad perspiciatis quis et consectetur. Laboriosam fuga voluptas ut et modi ipsum. Odio et eum numquam eos nisi. Assumenda aut magnam libero maiores nobis vel beatae officia."
                       "2018-05-15T20:25:48.517Z"]]
                     (mt/formatted-rows [int int int int str int str str]
                       (qp/process-query query)))))))))))

(deftest breakout-on-temporally-bucketed-implicitly-joined-column-inside-source-query-test
  (mt/test-drivers (disj (mt/normal-drivers-with-feature :nested-queries :basic-aggregations :left-join)
                         ;; mongodb doesn't support foreign keys required by this test
                         :mongo)
    (testing (str "Should be able to breakout on a temporally-bucketed, implicitly-joined column from the source query "
                  "incorrectly using `:field` literals to refer to the Field (#16389)")
      ;; See #19757 for more details on why this query is broken
      (mt/dataset sample-dataset
        (mt/with-bigquery-fks #{:bigquery-cloud-sdk}
          (let [query (mt/mbql-query orders
                        {:source-query {:source-table $$orders
                                        :breakout     [!month.product_id->products.created_at]
                                        :aggregation  [[:count]]}
                         :filter       [:time-interval *created_at/DateTimeWithLocalTZ -30 :year]
                         :aggregation  [[:sum *count/Integer]]
                         :breakout     [*created_at/DateTimeWithLocalTZ]
                         :limit        1})]
            (mt/with-native-query-testing-context query
              (is (= [["2016-04-01T00:00:00Z" 175]]
                     (mt/formatted-rows [str int]
                       (qp/process-query query)))))))))))

(deftest really-really-long-identifiers-test
  (testing "Should correctly handle really really long table and column names (#20627)"
    (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries :basic-aggregations :left-join)
      (mt/dataset sample-dataset
        (let [table-alias "Products with a very long name - Product ID with a very long name"
              query       (mt/mbql-query orders
                            {:source-query {:source-table $$orders
                                            :joins        [{:source-table $$products
                                                            :alias        table-alias
                                                            :condition    [:=
                                                                           $product_id
                                                                           [:field %products.id {:join-alias table-alias}]]
                                                            :fields       :all}]
                                            :breakout     [[:field %products.category {:join-alias table-alias}]]
                                            :aggregation  [[:count]]}
                             :filter       [:> *count/Integer 0]})]
          (mt/with-native-query-testing-context query
            (is (= [["Doohickey" 3976]
                    ["Gadget"    4939]
                    ["Gizmo"     4784]
                    ["Widget"    5061]]
                   (mt/formatted-rows [str int]
                     (qp/process-query query))))))))))

(deftest unfolded-json-with-custom-expression-test
  (testing "Should keep roots of unfolded JSON fields in the nested query (#29184)"
    (mt/test-driver :postgres
      (mt/dataset json
        (let [db    (t2/select-one 'Database :name "json" :engine driver/*driver*)
              table (t2/select-one 'Table :db_id (:id db) :name "json")
              field (t2/select-one 'Field :table_id (:id table)
                                   :name "json_bit → title")]
          (is (seq (mt/run-mbql-query json
                                      {:expressions  {"substring" [:substring [:field (:id field) nil] 1 10]}
                                       :fields       [[:expression "substring"]
                                                      [:field (:id field) nil]]}))))))))
