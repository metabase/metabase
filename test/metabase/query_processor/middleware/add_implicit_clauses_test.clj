(ns metabase.query-processor.middleware.add-implicit-clauses-test
  (:require [expectations :refer :all]
            [metabase.models.field :refer [Field]]
            [metabase.query-processor.middleware.add-implicit-clauses :as add-implicit-clauses]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

;; check we fetch Fields in the right order
(expect
  [ ;; sorted first because it has lowest positon
   {:position -1, :name "PRICE",       :special_type :type/Category}
   ;; PK
   {:position 0,  :name "ID",          :special_type :type/PK}
   ;; Name
   {:position 0,  :name "NAME",        :special_type :type/Name}
   ;; The rest are sorted by name
   {:position 0,  :name "CATEGORY_ID", :special_type :type/FK}
   {:position 0,  :name "LATITUDE",    :special_type :type/Latitude}
   {:position 0,  :name "LONGITUDE",   :special_type :type/Longitude}]
  (tu/with-temp-vals-in-db Field (data/id :venues :price) {:position -1}
    (let [ids       (map second (#'add-implicit-clauses/sorted-implicit-fields-for-table (data/id :venues)))
          id->field (u/key-by :id (db/select [Field :id :position :name :special_type] :id [:in ids]))]
      (for [id ids]
        (into {} (dissoc (id->field id) :id))))))

;; we should add order-bys for breakout clauses
(expect
  {:database 1
   :type     :query
   :query    {:source-table 1
              :breakout     [[:field-id 1]]
              :order-by     [[:asc [:field-id 1]]]}}
  (#'add-implicit-clauses/add-implicit-breakout-order-by
   {:database 1
    :type     :query
    :query    {:source-table 1
               :breakout     [[:field-id 1]]}}))

(expect
  {:database 1
   :type     :query
   :query    {:source-table 1
              :breakout     [[:field-id 2]]
              :order-by     [[:asc [:field-id 1]]
                             [:asc [:field-id 2]]]}}
  (#'add-implicit-clauses/add-implicit-breakout-order-by
   {:database 1
    :type     :query
    :query    {:source-table 1
               :breakout     [[:field-id 2]]
               :order-by     [[:asc [:field-id 1]]]}}))

;; ...but not if the Field is already in an order-by
(expect
  {:database 1
   :type    :query
   :query   {:source-table 1
             :breakout     [[:field-id 1]]
             :order-by     [[:asc [:field-id 1]]]}}
  (#'add-implicit-clauses/add-implicit-breakout-order-by
   {:database 1
    :type    :query
    :query   {:source-table 1
              :breakout     [[:field-id 1]]
              :order-by     [[:asc [:field-id 1]]]}}))

(expect
  {:database 1
   :type     :query
   :query    {:source-table 1
              :breakout     [[:field-id 1]]
              :order-by     [[:desc [:field-id 1]]]}}
  (#'add-implicit-clauses/add-implicit-breakout-order-by
   {:database 1
    :type     :query
    :query    {:source-table 1
               :breakout     [[:field-id 1]]
               :order-by     [[:desc [:field-id 1]]]}}))

(expect
  {:database 1
   :type     :query
   :query    {:source-table 1
              :breakout     [[:datetime-field [:field-id 1] :day]]
              :order-by     [[:asc [:field-id 1]]]}}
  (#'add-implicit-clauses/add-implicit-breakout-order-by
   {:database 1
    :type     :query
    :query    {:source-table 1
               :breakout     [[:datetime-field [:field-id 1] :day]]
               :order-by     [[:asc [:field-id 1]]]}}))


;; We should add sorted implicit Fields for a query with no aggregations
(expect
  {:database (data/id)
   :type     :query
   :query    {:source-table (data/id :venues)
              :fields       [ ;; :type/PK Fields should get sorted first
                             [:field-id (data/id :venues :id)]
                             ;; followed by :type/Name Fields
                             [:field-id (data/id :venues :name)]
                             ;; followed by other Fields sorted by name
                             [:field-id (data/id :venues :category_id)]
                             [:field-id (data/id :venues :latitude)]
                             [:field-id (data/id :venues :longitude)]
                             [:field-id (data/id :venues :price)]]}}
  (#'add-implicit-clauses/add-implicit-fields
   {:database (data/id)
    :type     :query
    :query    {:source-table (data/id :venues)}}))

;; when adding sorted implicit Fields, Field positions should be taken into account
(tt/expect-with-temp [Field [field-1 {:table_id (data/id :venues), :position 1, :name "bbbbb"}]
                      Field [field-2 {:table_id (data/id :venues), :position 2, :name "aaaaa"}]]
  {:database (data/id)
   :type     :query
   :query    {:source-table (data/id :venues)
              :fields       [;; all fields with position = 0 should get sorted first according to rules above
                             [:field-id (data/id :venues :id)]
                             [:field-id (data/id :venues :name)]
                             [:field-id (data/id :venues :category_id)]
                             [:field-id (data/id :venues :latitude)]
                             [:field-id (data/id :venues :longitude)]
                             [:field-id (data/id :venues :price)]
                             ;; followed by position = 1
                             [:field-id (u/get-id field-1)]
                             ;; followed by position = 2
                             [:field-id (u/get-id field-2)]]}}
  (#'add-implicit-clauses/add-implicit-fields
   {:database (data/id)
    :type     :query
    :query    {:source-table (data/id :venues)}}))

;; datetime Fields should get default bucketing of :day
(tt/expect-with-temp [Field [field {:table_id (data/id :venues), :position 0, :name "aaaaa", :base_type :type/DateTime}]]
  {:database (data/id)
   :type     :query
   :query    {:source-table (data/id :venues)
              :fields       [[:field-id (data/id :venues :id)]
                             [:field-id (data/id :venues :name)]
                             [:datetime-field [:field-id (u/get-id field)] :default]
                             [:field-id (data/id :venues :category_id)]
                             [:field-id (data/id :venues :latitude)]
                             [:field-id (data/id :venues :longitude)]
                             [:field-id (data/id :venues :price)]]}}
  (#'add-implicit-clauses/add-implicit-fields
   {:database (data/id)
    :type     :query
    :query    {:source-table (data/id :venues)}}))
