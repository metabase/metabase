(ns metabase.analyze.query-results-test
  (:require
   [clojure.test :refer :all]
   [metabase.analyze.fingerprint.fingerprinters :as fingerprinters]
   [metabase.analyze.fingerprint.insights :as insights]
   [metabase.analyze.query-results :as qr]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.card :refer [Card]]
   [metabase.models.field :refer [Field]]
   [metabase.query-processor :as qp]
   [metabase.query-processor.test-util :as qp.test-util]
   [metabase.test :as mt]
   [metabase.test.sync :as test.sync]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(defn- column->name-keyword [field-or-column-metadata]
  (-> field-or-column-metadata
      :name
      u/lower-case-en
      keyword))

(defn- name->fingerprints [field-or-metadata]
  (zipmap (map column->name-keyword field-or-metadata)
          (map :fingerprint field-or-metadata)))

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
  (let [results (qp/process-query (qp/userland-query query-map))]
    (when (= (:status results) :failed)
      (throw (ex-info "Query Failed" results)))
    (->> results
         :data
         results->column-metadata
         :metadata)))

(defn- query-for-card [card]
  {:database lib.schema.id/saved-questions-virtual-database-id
   :type     :query
   :query    {:source-table (str "card__" (u/the-id card))}})

(def ^:private venue-name->semantic-types
  {:id          :type/PK
   :name        :type/Name
   :price       :type/Category
   :category_id :type/FK
   :latitude    :type/Latitude
   :longitude   :type/Longitude})

(defn- app-db-venue-fingerprints
  "Get a map of keyword field name (as lowercased keyword) => fingerprint from the app DB."
  []
  (update-keys (t2/select-fn->fn :name :fingerprint Field :table_id (mt/id :venues))
               (comp keyword u/lower-case-en)))

(deftest mbql-result-metadata-test
  (testing "Getting the result metadata for a card backed by an MBQL query should use the fingerprints from the related fields"
    (t2.with-temp/with-temp [Card card (qp.test-util/card-with-source-metadata-for-query (mt/mbql-query venues))]
      (is (= (app-db-venue-fingerprints)
             (mt/throw-if-called! fingerprinters/with-global-fingerprinter
               (name->fingerprints (query->result-metadata (query-for-card card)))))))))

(deftest ^:parallel mbql-result-metadata-test-2
  (testing "Getting the result metadata for a card backed by an MBQL query should just infer the types of all the fields"
    (t2.with-temp/with-temp [Card card {:dataset_query (mt/mbql-query venues)}]
      (is (= venue-name->semantic-types
             (name->semantic-type (query->result-metadata (query-for-card card))))))))

(deftest ^:parallel native-query-result-metadata-test
  (testing (str "Native queries don't know what the associated Fields are for the results, we need to compute the fingerprints, but "
                "they should sill be the same except for some of the optimizations we do when we have all the information.")
    (t2.with-temp/with-temp [Card card {:dataset_query {:database (mt/id), :type :native, :native {:query "select * from venues"}}}]
      (is (= (assoc-in (mt/round-all-decimals 2 (app-db-venue-fingerprints))
                       [:category_id :type]
                       #:type{:Number {:min 2.0, :max 74.0, :avg 29.98, :q1 6.9, :q3 49.24, :sd 23.06}})
             (->> (name->fingerprints (query->result-metadata (query-for-card card)))
                  (mt/round-all-decimals 2)))))))

(deftest ^:parallel compute-semantic-types-test
  (testing (str "Similarly, check that we compute the correct semantic types. Note that we don't know that the category_id is an FK "
                "as it's just an integer flowing through, similarly Price isn't found to be a category as we're inferring by name "
                "only")
    (t2.with-temp/with-temp [Card card {:dataset_query {:database (mt/id)
                                                        :type     :native
                                                        :native   {:query "select * from venues"}}}]
      (is (= (assoc venue-name->semantic-types :category_id nil :price nil)
             (name->semantic-type (query->result-metadata (query-for-card card))))))))

(deftest one-column-test
  (testing "Limiting to just 1 column on an MBQL query should still get the result metadata from the Field"
    (t2.with-temp/with-temp [Card card (qp.test-util/card-with-source-metadata-for-query (mt/mbql-query venues))]
      (is (= (select-keys (app-db-venue-fingerprints) [:longitude])
             (mt/throw-if-called! fingerprinters/fingerprinter
               (-> card
                   query-for-card
                   (assoc-in [:query :fields] [[:field (mt/id :venues :longitude) nil]])
                   query->result-metadata
                   name->fingerprints)))))))

(deftest ^:parallel one-column-test-2
  (testing "Similar query as above, just native so that we need to calculate the fingerprint"
    (t2.with-temp/with-temp [Card card {:dataset_query {:database (mt/id), :type :native, :native {:query "select longitude from venues"}}}]
      (is (= (select-keys (app-db-venue-fingerprints) [:longitude])
             (name->fingerprints (query->result-metadata (query-for-card card))))))))

(defn- timeseries-dataset
  []
  (->> {:aggregation [[:count]]
        :breakout    [[:field (mt/id :checkins :date) {:temporal-unit :month}]]}
       (mt/run-mbql-query checkins)
       :data))

(deftest error-resilience-test
  (testing "Data should come back even if there is an error during fingerprinting"
    (is (= 36 (with-redefs [fingerprinters/earliest test.sync/crash-fn]
                (-> (timeseries-dataset) :rows count)))))
  (testing "Data should come back even if there is an error when calculating insights"
    (is (= 36 (with-redefs [insights/change test.sync/crash-fn]
                (-> (timeseries-dataset) :rows count))))))
