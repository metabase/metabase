(ns metabase.sync.analyze.query-results-test
  (:require [clojure.string :as str]
            [expectations :refer :all]
            [metabase
             [query-processor :as qp]
             [util :as u]]
            [metabase.models
             [card :refer [Card]]
             [database :as database]]
            [metabase.sync.analyze
             [fingerprint :as fprint]
             [query-results :as qr :refer :all]]
            [metabase.sync.analyze.classifiers.name :as classify-name]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.mock.util :as mutil]
            [toucan.util.test :as tt]))

(defn- column->name-keyword [field-or-column-metadata]
  (-> field-or-column-metadata
      :name
      str/lower-case
      keyword))

(defn- name->fingerprints [field-or-metadata]
  (zipmap (map column->name-keyword field-or-metadata)
          (map :fingerprint field-or-metadata)))

(defn- name->special-type [field-or-metadata]
  (zipmap (map column->name-keyword field-or-metadata)
          (map :special_type field-or-metadata)))

(defn- query->result-metadata
  [query-map]
  (->> query-map
       qp/process-query
       :data
       results->column-metadata
       (tu/round-all-decimals 2)))

(defn- query-for-card [card]
  {:database database/virtual-id
   :type     :query
   :query    {:source-table (str "card__" (u/get-id card))}})

(def ^:private venue-name->special-types
  {:id          :type/PK,
   :name        :type/Name,
   :price       :type/Category,
   :category_id :type/FK,
   :latitude    :type/Latitude,
   :longitude   :type/Longitude})

;; Getting the result metadata for a card backed by an MBQL query should use the fingerprints from the related fields
(expect
  mutil/venue-fingerprints
  (tt/with-temp Card [card {:dataset_query   {:database (data/id)
                                              :type     :query
                                              :query    {:source-table (data/id :venues)}}}]
    (tu/throw-if-called fprint/fingerprint
      (name->fingerprints
       (query->result-metadata (query-for-card card))))))

;; Getting the result metadata for a card backed by an MBQL query should just infer the types of all the fields
(expect
  venue-name->special-types
  (tt/with-temp Card [card {:dataset_query   {:database (data/id)
                                              :type     :query
                                              :query    {:source-table (data/id :venues)}}}]
    (name->special-type (query->result-metadata (query-for-card card)))))

;; Native queries don't know what the associated Fields are for the results, we need to compute the fingerprints, but
;; they should sill be the same
(expect
  mutil/venue-fingerprints
  (tt/with-temp Card [card {:dataset_query   {:database (data/id)
                                              :type     :native
                                              :native   {:query "select * from venues"}}}]
    (name->fingerprints
     (query->result-metadata (query-for-card card)))))

;; Similarly, check that we computed the correct special types. Note that we don't know that the category_id is an FK
;; as it's just an integer flowing through, similarly Price isn't found to be a category as we're inferring by name
;; only
(expect
  (assoc venue-name->special-types :category_id nil, :price nil)
  (tt/with-temp Card [card {:dataset_query   {:database (data/id)
                                              :type     :native
                                              :native   {:query "select * from venues"}}}]
    (name->special-type
     (query->result-metadata (query-for-card card)))))

;; Limiting to just 1 column on an MBQL query should still get the result metadata from the Field
(expect
  (select-keys mutil/venue-fingerprints [:longitude])
  (tt/with-temp Card [card {:dataset_query   {:database (data/id)
                                              :type     :query
                                              :query    {:source-table (data/id :venues)}}}]
    (tu/throw-if-called fprint/fingerprint
      (name->fingerprints
       (query->result-metadata (assoc-in (query-for-card card) [:query :fields] (data/id :venues :longitude)))))))

;; Similar query as above, just native so that we need to calculate the fingerprint
(expect
  (select-keys mutil/venue-fingerprints [:longitude])
  (tt/with-temp Card [card {:dataset_query   {:database (data/id)
                                              :type     :native
                                              :native   {:query "select longitude from venues"}}}]
    (name->fingerprints
     (query->result-metadata (query-for-card card)))))
