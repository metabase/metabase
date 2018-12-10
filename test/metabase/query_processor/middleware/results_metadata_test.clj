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
            [metabase.query-processor.util :as qputil]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data.users :as users]
            [metabase.test.mock.util :as mutil]
            [metabase.util.encryption :as encrypt]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(defn- native-query [sql]
  {:database (data/id)
   :type     :native
   :native   {:query sql}})

(defn- card-metadata [card]
  (db/select-one-field :result_metadata Card :id (u/get-id card)))

(defn- round-to-2-decimals
  "Defaults `tu/round-all-decimals` to 2 digits"
  [data]
  (tu/round-all-decimals 2 data))

(def ^:private default-card-results
  [{:name         "ID",      :display_name "ID", :base_type "type/Integer",
    :special_type "type/PK", :fingerprint  (:id mutil/venue-fingerprints)}
   {:name         "NAME",      :display_name "Name", :base_type "type/Text",
    :special_type "type/Name", :fingerprint  (:name mutil/venue-fingerprints)}
   {:name         "PRICE", :display_name "Price", :base_type "type/Integer",
    :special_type nil,     :fingerprint  (:price mutil/venue-fingerprints)}
   {:name         "CATEGORY_ID", :display_name "Category ID", :base_type "type/Integer",
    :special_type nil,           :fingerprint  (:category_id mutil/venue-fingerprints)}
   {:name         "LATITUDE",      :display_name "Latitude", :base_type "type/Float",
    :special_type "type/Latitude", :fingerprint  (:latitude mutil/venue-fingerprints)}
   {:name         "LONGITUDE",      :display_name "Longitude", :base_type "type/Float"
    :special_type "type/Longitude", :fingerprint  (:longitude mutil/venue-fingerprints)}])

(def ^:private default-card-results-native
  (update-in default-card-results [3 :fingerprint] assoc :type {:type/Number {:min 2.0, :max 74.0, :avg 29.98, :q1 7.0, :q3 49.0 :sd 23.06}}))

;; test that Card result metadata is saved after running a Card
(expect
  default-card-results-native
  (tt/with-temp Card [card]
    (u/prog1
     (qp/process-query (assoc (native-query "SELECT ID, NAME, PRICE, CATEGORY_ID, LATITUDE, LONGITUDE FROM VENUES")
                         :info {:card-id    (u/get-id card)
                                :query-hash (qputil/query-hash {})}))
     (assert (= (:status <>) :completed)))
    (-> card
        card-metadata
        round-to-2-decimals
        tu/round-fingerprint-cols)))

;; check that using a Card as your source doesn't overwrite the results metadata...
(expect
  [{:name "NAME", :display_name "Name", :base_type "type/Text"}]
  (tt/with-temp Card [card {:dataset_query   (native-query "SELECT * FROM VENUES")
                            :result_metadata [{:name "NAME", :display_name "Name", :base_type "type/Text"}]}]
    (u/prog1
     (qp/process-query {:database database/virtual-id
                        :type     :query
                        :query    {:source-table (str "card__" (u/get-id card))}})
     (assert (= (:status <>) :completed)))
    (card-metadata card)))

;; ...even when running via the API endpoint
(expect
  [{:name "NAME", :display_name "Name", :base_type "type/Text"}]
  (tt/with-temp* [Collection [collection]
                  Card       [card {:collection_id   (u/get-id collection)
                                    :dataset_query   (native-query "SELECT * FROM VENUES")
                                    :result_metadata [{:name "NAME", :display_name "Name", :base_type "type/Text"}]}]]
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

(def ^:private example-metadata
  [{:base_type    "type/Text"
    :display_name "Date"
    :name         "DATE"
    :unit         nil
    :special_type nil
    :fingerprint  {:global {:distinct-count 618 :nil% 0.0}, :type {:type/DateTime {:earliest "2013-01-03T00:00:00.000Z"
                                                                                   :latest   "2015-12-29T00:00:00.000Z"}}}}
   {:base_type    "type/Integer"
    :display_name "count"
    :name         "count"
    :special_type "type/Quantity"
    :fingerprint  {:global {:distinct-count 3
                            :nil%           0.0},
                   :type   {:type/Number {:min 235.0, :max 498.0, :avg 333.33 :q1 243.0, :q3 440.0 :sd 143.5}}}}])

(defn- array-map->hash-map
  "Calling something like `(into (hash-map) ...)` will only return a hash-map if there are enough elements to push it
  over the limit of an array-map. By passing the keyvals into `hash-map`, you can be sure it will be a hash-map."
  [m]
  (apply hash-map (apply concat m)))

(defn- metadata-checksum
  "Invoke `metadata-checksum` without a `default-secret-key` specified. If the key is specified, it will encrypt the
  checksum. The encryption includes random data that will cause the checksum string to be different each time, so the
  checksum strings can't be directly compared."
  [metadata]
  (with-redefs [encrypt/default-secret-key nil]
    (#'results-metadata/metadata-checksum metadata)))

;; tests that the checksum is consistent when an array-map is switched to a hash-map
(expect
  (metadata-checksum example-metadata)
  (metadata-checksum (mapv array-map->hash-map example-metadata)))

;; tests that the checksum is consistent with an integer and with a double
(expect
  (metadata-checksum example-metadata)
  (metadata-checksum (update-in example-metadata [1 :fingerprint :type :type/Number :min] int)))

;; make sure that queries come back with metadata
(expect
  {:checksum java.lang.String
   :columns  (map (fn [col]
                    (-> col
                        (update :special_type keyword)
                        (update :base_type keyword)))
                  default-card-results-native)}
  (-> (qp/process-query {:database (data/id)
                         :type     :native
                         :native   {:query "SELECT ID, NAME, PRICE, CATEGORY_ID, LATITUDE, LONGITUDE FROM VENUES"}})
      (get-in [:data :results_metadata])
      (update :checksum class)
      round-to-2-decimals
      (->> (tu/round-fingerprint-cols [:columns]))))

;; make sure that a Card where a DateTime column is broken out by year advertises that column as Text, since you can't
;; do datetime breakouts on years
(expect
  [{:base_type    "type/Text"
    :display_name "Date"
    :name         "DATE"
    :unit         nil
    :special_type nil
    :fingerprint  {:global {:distinct-count 618 :nil% 0.0}, :type {:type/DateTime {:earliest "2013-01-03T00:00:00.000Z"
                                                                         :latest   "2015-12-29T00:00:00.000Z"}}}}
   {:base_type    "type/Integer"
    :display_name "count"
    :name         "count"
    :special_type "type/Quantity"
    :fingerprint  {:global {:distinct-count 3
                            :nil%           0.0},
                   :type   {:type/Number {:min 235.0, :max 498.0, :avg 333.33 :q1 243.0, :q3 440.0 :sd 143.5}}}}]
  (tt/with-temp Card [card]
    (qp/process-query {:database (data/id)
                       :type     :query
                       :query    {:source-table (data/id :checkins)
                                  :aggregation  [[:count]]
                                  :breakout     [[:datetime-field [:field-id (data/id :checkins :date)] :year]]}
                       :info     {:card-id    (u/get-id card)
                                  :query-hash (qputil/query-hash {})}})
    (-> card
        card-metadata
        round-to-2-decimals
        tu/round-fingerprint-cols)))
