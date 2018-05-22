(ns metabase.query-processor.middleware.results-metadata-test
  (:require [expectations :refer [expect]]
            [metabase
             [query-processor :as qp]
             [util :as u]]
            [metabase.models
             [card :refer [Card]]
             [collection :refer [Collection]]
             [database :as database]
             [permissions :as perms]
             [permissions-group :as group]]
            [metabase.query-processor.middleware.results-metadata :as results-metadata]
            [metabase.test.data :as data]
            [metabase.test.data.users :as users]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(defn- native-query [sql]
  {:database (data/id)
   :type     :native
   :native   {:query sql}})

(defn- card-metadata [card]
  (db/select-one-field :result_metadata Card :id (u/get-id card)))

;; test that Card result metadata is saved after running a Card
(expect
  [{:name "ID",          :display_name "ID",          :base_type "type/Integer"}
   {:name "NAME",        :display_name "Name",        :base_type "type/Text"}
   {:name "PRICE",       :display_name "Price",       :base_type "type/Integer"}
   {:name "CATEGORY_ID", :display_name "Category ID", :base_type "type/Integer"}
   {:name "LATITUDE",    :display_name "Latitude",    :base_type "type/Float"}
   {:name "LONGITUDE",   :display_name "Longitude",   :base_type "type/Float"}]
  (tt/with-temp Card [card]
    (qp/process-query (assoc (native-query "SELECT ID, NAME, PRICE, CATEGORY_ID, LATITUDE, LONGITUDE FROM VENUES")
                        :info {:card-id    (u/get-id card)
                               :query-hash (byte-array 0)}))
    (card-metadata card)))

;; check that using a Card as your source doesn't overwrite the results metadata...
(expect
  {:name "NAME", :display_name "Name", :base_type "type/Text"}
  (tt/with-temp Card [card {:dataset_query   (native-query "SELECT * FROM VENUES")
                            :result_metadata {:name "NAME", :display_name "Name", :base_type "type/Text"}}]
    (qp/process-query {:database database/virtual-id
                       :type     :query
                       :query    {:source-table (str "card__" (u/get-id card))}})
    (card-metadata card)))

;; ...even when running via the API endpoint
(expect
  {:name "NAME", :display_name "Name", :base_type "type/Text"}
  (tt/with-temp* [Collection [collection]
                  Card       [card {:collection_id   (u/get-id collection)
                                    :dataset_query   (native-query "SELECT * FROM VENUES")
                                    :result_metadata {:name "NAME", :display_name "Name", :base_type "type/Text"}}]]
    (perms/grant-collection-read-permissions! (group/all-users) collection)
    ((users/user->client :rasta) :post 200 "dataset" {:database database/virtual-id
                                                      :type     :query
                                                      :query    {:source-table (str "card__" (u/get-id card))}})
    (card-metadata card)))


;; tests for valid-checksum?
(expect
  (results-metadata/valid-checksum? "ABCDE" (#'results-metadata/metadata-checksum "ABCDE")))

(expect
  false
  (results-metadata/valid-checksum? "ABCD" (#'results-metadata/metadata-checksum "ABCDE")))


;; make sure that queries come back with metadata
(expect
  {:checksum java.lang.String
   :columns [{:base_type :type/Integer, :display_name "ID",          :name "ID"}
             {:base_type :type/Text,    :display_name "Name",        :name "NAME"}
             {:base_type :type/Integer, :display_name "Price",       :name "PRICE"}
             {:base_type :type/Integer, :display_name "Category ID", :name "CATEGORY_ID"}
             {:base_type :type/Float,   :display_name "Latitude",    :name "LATITUDE"}
             {:base_type :type/Float,   :display_name "Longitude",   :name "LONGITUDE"}]}
  (-> (qp/process-query {:database (data/id)
                         :type     :native
                         :native   {:query "SELECT ID, NAME, PRICE, CATEGORY_ID, LATITUDE, LONGITUDE FROM VENUES"}})
      (get-in [:data :results_metadata])
      (update :checksum class)))

;; make sure that a Card where a DateTime column is broken out by year advertises that column as Text, since you can't
;; do datetime breakouts on years
(expect
  [{:base_type    "type/Text"
    :display_name "Date"
    :name         "DATE"
    :unit         nil}
   {:base_type    "type/Integer"
    :display_name "count"
    :name         "count"
    :special_type "type/Number"}]
  (tt/with-temp Card [card]
    (qp/process-query {:database (data/id)
                       :type     :query
                       :query    {:source-table (data/id :checkins)
                                  :aggregation  [[:count]]
                                  :breakout     [[:datetime-field [:field-id (data/id :checkins :date)] :year]]}
                       :info     {:card-id    (u/get-id card)
                                  :query-hash (byte-array 0)}})
    (card-metadata card)))
