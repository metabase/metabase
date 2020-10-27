(ns metabase.query-processor.middleware.add-implicit-clauses-test
  (:require [clojure.test :refer :all]
            [expectations :refer [expect]]
            [metabase.models.field :refer [Field]]
            [metabase.query-processor.middleware.add-implicit-clauses :as add-implicit-clauses]
            [metabase.query-processor.test-util :as qp.test-util]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.util :as u]
            [schema.core :as s]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(deftest ordering-test
  (testing "check we fetch Fields in the right order"
    (is (= [ ;; sorted first because it has lowest positon
            {:position -1, :name "PRICE", :special_type :type/Category}
            ;; PK
            {:position 0, :name "ID", :special_type :type/PK}
            ;; Name
            {:position 1, :name "NAME", :special_type :type/Name}
            ;; The rest are sorted by name
            {:position 2, :name "CATEGORY_ID", :special_type :type/FK}
            {:position 3, :name "LATITUDE", :special_type :type/Latitude}
            {:position 4, :name "LONGITUDE", :special_type :type/Longitude}]
           (tu/with-temp-vals-in-db Field (data/id :venues :price) {:position -1}
             (let [ids       (map second (#'add-implicit-clauses/sorted-implicit-fields-for-table (data/id :venues)))
                   id->field (u/key-by :id (db/select [Field :id :position :name :special_type] :id [:in ids]))]
               (for [id ids]
                 (into {} (dissoc (id->field id) :id)))))))))

;; we should add order-bys for breakout clauses
(expect
  {:source-table 1
   :breakout     [[:field-id 1]]
   :order-by     [[:asc [:field-id 1]]]}
  (#'add-implicit-clauses/add-implicit-breakout-order-by
   {:source-table 1
    :breakout     [[:field-id 1]]}))

(expect
  {:source-table 1
   :breakout     [[:field-id 2]]
   :order-by     [[:asc [:field-id 1]]
                  [:asc [:field-id 2]]]}
  (#'add-implicit-clauses/add-implicit-breakout-order-by
   {:source-table 1
    :breakout     [[:field-id 2]]
    :order-by     [[:asc [:field-id 1]]]}))

;; ...but not if the Field is already in an order-by
(expect
  {:source-table 1
   :breakout     [[:field-id 1]]
   :order-by     [[:asc [:field-id 1]]]}
  (#'add-implicit-clauses/add-implicit-breakout-order-by
   {:source-table 1
    :breakout     [[:field-id 1]]
    :order-by     [[:asc [:field-id 1]]]}))

(expect
  {:source-table 1
   :breakout     [[:field-id 1]]
   :order-by     [[:desc [:field-id 1]]]}
  (#'add-implicit-clauses/add-implicit-breakout-order-by
   {:source-table 1
    :breakout     [[:field-id 1]]
    :order-by     [[:desc [:field-id 1]]]}))

(expect
  {:source-table 1
   :breakout     [[:datetime-field [:field-id 1] :day]]
   :order-by     [[:asc [:field-id 1]]]}
  (#'add-implicit-clauses/add-implicit-breakout-order-by
   {:source-table 1
    :breakout     [[:datetime-field [:field-id 1] :day]]
    :order-by     [[:asc [:field-id 1]]]}))


;; We should add sorted implicit Fields for a query with no aggregations
(expect
  (:query
   (data/mbql-query venues
     {:fields [ ;; :type/PK Fields should get sorted first
               $id
               ;; followed by :type/Name Fields
               $name
               ;; followed by other Fields sorted by name
               $category_id $latitude $longitude $price]}))
  (#'add-implicit-clauses/add-implicit-fields (:query (data/mbql-query venues))))

;; when adding sorted implicit Fields, Field positions should be taken into account
(tt/expect-with-temp [Field [field-1 {:table_id (data/id :venues), :position 100, :name "bbbbb"}]
                      Field [field-2 {:table_id (data/id :venues), :position 101, :name "aaaaa"}]]
  (:query
   (data/mbql-query venues
     {:fields [ ;; all fields with lower positions should get sorted first according to rules above
               $id $name $category_id $latitude $longitude $price
               ;; followed by position = 100, then position = 101
               [:field-id (u/get-id field-1)]
               [:field-id (u/get-id field-2)]]}))
  (#'add-implicit-clauses/add-implicit-fields (:query (data/mbql-query venues))))

(deftest default-bucketing-test
  (testing "datetime Fields should get default bucketing of :day"
    (tt/with-temp* [Field [field {:table_id (data/id :venues), :position 2, :name "aaaaa", :base_type :type/DateTime}]]
      (is (= (:query
              (data/mbql-query venues
                {:fields [[:field-id (data/id :venues :id)]
                          [:field-id (data/id :venues :name)]
                          [:datetime-field [:field-id (u/get-id field)] :default]
                          [:field-id (data/id :venues :category_id)]
                          [:field-id (data/id :venues :latitude)]
                          [:field-id (data/id :venues :longitude)]
                          [:field-id (data/id :venues :price)]]}))
             (#'add-implicit-clauses/add-implicit-fields (:query (data/mbql-query venues))))))))

;; We should add implicit Fields for source queries that have source-metadata as appropriate
(tu/expect-schema
  {:fields   (s/eq [[:field-literal "DATE" :type/DateTime]
                    [:field-literal "count" :type/BigInteger]])
   s/Keyword s/Any}
  (let [{{source-query :query} :dataset_query
         source-metadata       :result_metadata} (qp.test-util/card-with-source-metadata-for-query
         (data/mbql-query checkins
           {:aggregation [[:count]]
            :breakout    [[:datetime-field $date :month]]}))]
    (#'add-implicit-clauses/add-implicit-fields
     (:query (data/mbql-query checkins
               {:source-query    source-query
                :source-metadata source-metadata})))))
