(ns metabase.sync.analyze.query-results-test
  (:require [clojure.string :as str]
            [expectations :refer [expect]]
            [metabase
             [query-processor :as qp]
             [util :as u]]
            [metabase.mbql.schema :as mbql.s]
            [metabase.models.card :refer [Card]]
            [metabase.query-processor.test-util :as qp.test-util]
            [metabase.sync.analyze.fingerprint.fingerprinters :as fprint]
            [metabase.sync.analyze.query-results :as qr]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.mock.util :as mock.u]
            [toucan.util.test :as tt]))

(defn- column->name-keyword [field-or-column-metadata]
  (-> field-or-column-metadata
      :name
      str/lower-case
      keyword))

(defn- name->fingerprints [field-or-metadata]
  (zipmap (map column->name-keyword field-or-metadata)
          (map :fingerprint (tu/round-fingerprint-cols field-or-metadata))))

(defn- name->special-type [field-or-metadata]
  (zipmap (map column->name-keyword field-or-metadata)
          (map :special_type field-or-metadata)))

(defn- query->result-metadata
  [query-map]
  (let [results (qp/process-query query-map)]
    (when (= (:status results) :failed)
      (throw (ex-info "Query Failed" results)))
    (->> results
         :data
         qr/results->column-metadata
         :metadata
         (tu/round-all-decimals 2))))

(defn- query-for-card [card]
  {:database mbql.s/saved-questions-virtual-database-id
   :type     :query
   :query    {:source-table (str "card__" (u/get-id card))}})

(def ^:private venue-name->special-types
  {:id          :type/PK
   :name        :type/Name
   :price       :type/Category
   :category_id :type/FK
   :latitude    :type/Latitude
   :longitude   :type/Longitude})

;; Getting the result metadata for a card backed by an MBQL query should use the fingerprints from the related fields
(expect
  mock.u/venue-fingerprints
  (tt/with-temp Card [card (qp.test-util/card-with-source-metadata-for-query (data/mbql-query venues))]
    ;; check for a "proper" fingerprinter, fallthrough for PKs is fine.
    (tu/throw-if-called fprint/with-global-fingerprinter
      (name->fingerprints
       (query->result-metadata (query-for-card card))))))

;; Getting the result metadata for a card backed by an MBQL query should just infer the types of all the fields
(expect
  venue-name->special-types
  (tt/with-temp Card [card {:dataset_query (data/mbql-query venues)}]
    (name->special-type (query->result-metadata (query-for-card card)))))

;; Native queries don't know what the associated Fields are for the results, we need to compute the fingerprints, but
;; they should sill be the same except for some of the optimizations we do when we have all the information.
(expect
  (assoc-in mock.u/venue-fingerprints
            [:category_id :type]
            {:type/Number {:min 2.0, :max 74.0, :avg 29.98, :q1 7.0, :q3 49.0 :sd 23.06}})
  (tt/with-temp Card [card {:dataset_query {:database (data/id)
                                            :type     :native
                                            :native   {:query "select * from venues"}}}]

    (name->fingerprints
     (query->result-metadata (query-for-card card)))))

;; Similarly, check that we computed the correct special types. Note that we don't know that the category_id is an FK
;; as it's just an integer flowing through, similarly Price isn't found to be a category as we're inferring by name
;; only
(expect
  (assoc venue-name->special-types :category_id nil, :price nil)
  (tt/with-temp Card [card {:dataset_query {:database (data/id)
                                            :type     :native
                                            :native   {:query "select * from venues"}}}]
    (name->special-type
     (query->result-metadata (query-for-card card)))))

;; Limiting to just 1 column on an MBQL query should still get the result metadata from the Field
(expect
  (select-keys mock.u/venue-fingerprints [:longitude])
  (tt/with-temp Card [card (qp.test-util/card-with-source-metadata-for-query (data/mbql-query venues))]
    (tu/throw-if-called fprint/fingerprinter
      (name->fingerprints
       (query->result-metadata (assoc-in (query-for-card card) [:query :fields] [[:field-id (data/id :venues :longitude)]]))))))

;; Similar query as above, just native so that we need to calculate the fingerprint
(expect
  (select-keys mock.u/venue-fingerprints [:longitude])
  (tt/with-temp Card [card {:dataset_query {:database (data/id)
                                            :type     :native
                                            :native   {:query "select longitude from venues"}}}]
    (name->fingerprints
     (query->result-metadata (query-for-card card)))))
