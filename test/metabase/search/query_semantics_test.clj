(ns metabase.search.query-semantics-test
  "Exact result sets for in-place and app-db search on the shared search scenarios.
  Each scenario and adapted query runs against temporary cards or a temporary index table.
  Assertions compare membership, not ranking."
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.search.appdb.index :as search.index]
   [metabase.search.appdb.specialization.api :as specialization]
   [metabase.search.engine :as search.engine]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.query-semantics :as fixtures]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]))

(defn- result-ids
  [query raw-ctx id->label]
  (into #{} (map (comp id->label :id))
        (search.tu/search-results query raw-ctx)))

(defn- check-in-place-query!
  "Search only this case's cards, even for queries containing LIKE wildcards."
  [docs query expected]
  ;; `:ids` excludes the filler cards, even when the query is a match-all LIKE pattern.
  ;; These cards are queried directly, so they must not enqueue index updates.
  (search.tu/do-with-labelled-cards
   docs
   (fn [label->id]
     (is (= expected
            (result-ids query {:search-engine "in-place"
                               :models        #{"card"}
                               :ids           (set (vals label->id))}
                        (set/map-invert label->id)))))))

(defn- index-documents!
  "Insert this case's documents into the temporary app-db search index."
  [docs]
  (let [label->id (zipmap (keys docs) (iterate inc 1))
        documents (for [[label attrs] docs]
                    (merge {:model "card", :id (label->id label)} attrs))]
    (#'specialization/batch-upsert!
     (search.index/active-table)
     (map (comp #'search.index/document->entry
                #'search.ingestion/->document)
          documents))
    (set/map-invert label->id)))

(defn- check-appdb-query!
  "Build the case index and query it with the case's text-search language."
  [config docs query expected]
  ;; PostgreSQL uses this language for both indexed tsvectors and the query.
  ;; H2 ignores it for matching.
  (mt/with-temporary-setting-values [search-language config]
    (search.tu/with-temp-index-table
      (let [id->label (index-documents! docs)]
        (is (= expected
               (result-ids query {:search-engine "appdb"
                                  :models        #{"card"}}
                           id->label)))))))

(defn- available-appdb-dialect
  []
  (when (search.engine/supported-engine? :search.engine/appdb)
    (case (mdb/db-type)
      :h2       :appdb-h2
      :postgres :appdb-postgres
      nil)))

(deftest identical-query-semantics-test
  (let [dialect (available-appdb-dialect)]
    (doseq [{:keys [id focus config docs query] :as case} fixtures/cases]
      (testing (str id " / " focus)
        (check-in-place-query! docs query (fixtures/expected-hits case :in-place))
        (when dialect
          (check-appdb-query! config docs query (fixtures/expected-hits case dialect)))))))

(deftest translated-query-semantics-test
  (let [dialect (available-appdb-dialect)]
    (doseq [{:keys [id config docs comparisons] :as case} fixtures/cases
            {:keys [focus] :as comparison} comparisons]
      (testing (str id " / " focus)
        (let [{:keys [query hits]} (fixtures/comparison-spec case comparison :in-place)]
          (check-in-place-query! docs query hits))
        (when dialect
          (let [{:keys [query hits]} (fixtures/comparison-spec case comparison dialect)]
            (check-appdb-query! config docs query hits)))))))
