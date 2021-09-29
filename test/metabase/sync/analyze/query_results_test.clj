(ns metabase.sync.analyze.query-results-test
  (:require [clojure.string :as str]
            [clojure.test :refer :all]
            [metabase.mbql.schema :as mbql.s]
            [metabase.models.card :refer [Card]]
            [metabase.query-processor :as qp]
            [metabase.query-processor.test-util :as qp.test-util]
            [metabase.sync.analyze.fingerprint.fingerprinters :as fprint]
            [metabase.sync.analyze.fingerprint.insights :as insights]
            [metabase.sync.analyze.query-results :as qr]
            [metabase.test :as mt]
            [metabase.test.data :as data]
            [metabase.test.mock.util :as mock.u]
            [metabase.test.sync :as sync-test]
            [metabase.test.util :as tu]
            [metabase.util :as u]))

(defn- column->name-keyword [field-or-column-metadata]
  (-> field-or-column-metadata
      :name
      str/lower-case
      keyword))

(defn- name->fingerprints [field-or-metadata]
  (zipmap (map column->name-keyword field-or-metadata)
          (map :fingerprint (tu/round-fingerprint-cols field-or-metadata))))

(defn- name->semantic-type [fields-or-metadatas]
  (zipmap (map column->name-keyword fields-or-metadatas)
          (map :semantic_type fields-or-metadatas)))

(defn- add-insights [rows result-metadata]
  (transduce identity (qr/insights-rf result-metadata) rows))

(defn results->column-metadata
  "Return the desired storage format for the column metadata coming back from `results` and fingerprint the `results`."
  [{:keys [rows], :as result}]
  {:pre [(map? result) (:cols result)]}
  (add-insights rows result))

(defn- query->result-metadata
  [query-map]
  (let [results (qp/process-userland-query query-map)]
    (when (= (:status results) :failed)
      (throw (ex-info "Query Failed" results)))
    (->> results
         :data
         results->column-metadata
         :metadata
         (tu/round-all-decimals 2))))

(defn- query-for-card [card]
  {:database mbql.s/saved-questions-virtual-database-id
   :type     :query
   :query    {:source-table (str "card__" (u/the-id card))}})

(def ^:private venue-name->semantic-types
  {:id          :type/PK
   :name        :type/Name
   :price       :type/Category
   :category_id :type/FK
   :latitude    :type/Latitude
   :longitude   :type/Longitude})

(deftest mbql-result-metadata-test
  (testing "Getting the result metadata for a card backed by an MBQL query should use the fingerprints from the related fields"
    (mt/with-temp Card [card (qp.test-util/card-with-source-metadata-for-query (mt/mbql-query venues))]
      (is (= mock.u/venue-fingerprints
             (tu/throw-if-called fprint/with-global-fingerprinter (name->fingerprints (query->result-metadata (query-for-card card))))))))

  (testing "Getting the result metadata for a card backed by an MBQL query should just infer the types of all the fields"
    (mt/with-temp Card [card {:dataset_query (mt/mbql-query venues)}]
      (is (= venue-name->semantic-types
             (name->semantic-type (query->result-metadata (query-for-card card))))))))

(deftest native-query-result-metadata-test
  (testing (str "Native queries don't know what the associated Fields are for the results, we need to compute the fingerprints, but "
                "they should sill be the same except for some of the optimizations we do when we have all the information.")
    (mt/with-temp Card [card {:dataset_query {:database (mt/id), :type :native, :native {:query "select * from venues"}}}]
      (is (= (assoc-in mock.u/venue-fingerprints [:category_id :type] #:type{:Number {:min 2.0, :max 74.0, :avg 29.98, :q1 7.0, :q3 49.0, :sd 23.06}})
             (name->fingerprints (query->result-metadata (query-for-card card))))))))

(deftest compute-semantic-types-test
  (testing (str "Similarly, check that we compute the correct semantic types. Note that we don't know that the category_id is an FK "
                "as it's just an integer flowing through, similarly Price isn't found to be a category as we're inferring by name "
                "only")
    (mt/with-temp Card [card {:dataset_query {:database (mt/id)
                                              :type     :native
                                              :native   {:query "select * from venues"}}}]
      (is (= (assoc venue-name->semantic-types :category_id nil :price nil)
             (name->semantic-type (query->result-metadata (query-for-card card))))))))

(deftest one-column-test
  (testing "Limiting to just 1 column on an MBQL query should still get the result metadata from the Field"
    (mt/with-temp Card [card (qp.test-util/card-with-source-metadata-for-query (mt/mbql-query venues))]
      (is (= (select-keys mock.u/venue-fingerprints [:longitude])
             (tu/throw-if-called fprint/fingerprinter
               (-> card
                   query-for-card
                   (assoc-in [:query :fields] [[:field-id (mt/id :venues :longitude)]])
                   query->result-metadata
                   name->fingerprints))))))

  (testing "Similar query as above, just native so that we need to calculate the fingerprint"
    (mt/with-temp Card [card {:dataset_query {:database (mt/id), :type :native, :native {:query "select longitude from venues"}}}]
      (is (= (select-keys mock.u/venue-fingerprints [:longitude])
             (name->fingerprints (query->result-metadata (query-for-card card))))))))

(defn- timeseries-dataset
  []
  (->> {:aggregation [[:count]]
        :breakout    [[:datetime-field [:field-id (data/id :checkins :date)] :month]]}
       (mt/run-mbql-query checkins)
       :data))

(deftest error-resilience-test
  (testing "Data should come back even if there is an error during fingerprinting"
    (is (= 36 (mt/suppress-output
                (with-redefs [fprint/earliest sync-test/crash-fn]
                  (-> (timeseries-dataset) :rows count))))))
  (testing "Data should come back even if there is an error when calculating insights"
    (is (= 36 (mt/suppress-output
                (with-redefs [insights/change sync-test/crash-fn]
                  (-> (timeseries-dataset) :rows count)))))))
