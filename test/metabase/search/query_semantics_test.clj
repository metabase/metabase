(ns metabase.search.query-semantics-test
  "Exact result-set contracts for in-place and app-db search.

  Each scenario runs identical and translated queries against temporary cards
  or a temporary index table. Assertions compare membership, not ranking. The
  case IDs match the metabase-wiki corpuses."
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.search.appdb.index :as search.index]
   [metabase.search.appdb.specialization.api :as specialization]
   [metabase.search.core :as search]
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
  ;; `with-temp` needs fixed bindings. Absent cards get filler names, while :ids
  ;; excludes them even when the query is a match-all LIKE pattern.
  ;; These cards are queried directly, so they must not enqueue index updates.
  (binding [search.ingestion/*disable-updates* true]
    (let [missing {:name (str "zzq-nonmatch-" (random-uuid))}]
      (mt/with-temp
        [:model/Card {a :id} (get docs :A missing)
         :model/Card {b :id} (get docs :B missing)
         :model/Card {c :id} (get docs :C missing)
         :model/Card {d :id} (get docs :D missing)
         :model/Card {e :id} (get docs :E missing)
         :model/Card {f :id} (get docs :F missing)
         :model/Card {g :id} (get docs :G missing)
         :model/Card {h :id} (get docs :H missing)]
        (let [label->id {:A a, :B b, :C c, :D d, :E e, :F f, :G g, :H h}
              ids       (set (map label->id (keys docs)))
              id->label (into {} (map (fn [[label id]] [id label])) label->id)]
          (is (= expected
                 (result-ids query {:search-engine "in-place"
                                    :models        #{"card"}
                                    :ids           ids}
                             id->label))))))))

(defn- index-documents!
  "Insert this case's documents into the temporary app-db search index."
  [docs]
  (let [label->id (into {} (map-indexed (fn [index label] [label (inc index)]) (keys docs)))
        documents (for [[label attrs] docs]
                    (merge {:model "card", :id (label->id label)} attrs))]
    (#'specialization/batch-upsert!
     (search.index/active-table)
     (map (comp #'search.index/document->entry
                #'search.ingestion/->document)
          documents))
    (into {} (map (fn [[label id]] [id label])) label->id)))

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
  (when (and (search.engine/supported-engine? :search.engine/appdb)
             (search/supports-index?))
    (case (mdb/db-type)
      :h2       :appdb-h2
      :postgres :appdb-postgres
      nil)))

(deftest identical-query-semantics-test
  (let [dialect (available-appdb-dialect)]
    (doseq [{:keys [id focus config docs query] :as case} fixtures/cases]
      (testing (str id " — " focus)
        (check-in-place-query! docs query (fixtures/expected-hits case :in-place))
        (when dialect
          (check-appdb-query! config docs query (fixtures/expected-hits case dialect)))))))

(deftest translated-query-semantics-test
  (let [dialect (available-appdb-dialect)]
    (doseq [{:keys [id config docs comparisons] :as case} fixtures/cases
            {:keys [focus target] :as comparison} comparisons]
      (testing (str (:id comparison) " — " focus " (target " target " on " id ")")
        ;; Keep the translated target anchored to its same-query scenario oracle.
        (is (= (fixtures/expected-hits case target)
               (:hits (fixtures/comparison-spec case comparison target))))
        (let [{:keys [query hits]} (fixtures/comparison-spec case comparison :in-place)]
          (check-in-place-query! docs query hits))
        (when dialect
          (let [{:keys [query hits]} (fixtures/comparison-spec case comparison dialect)]
            (check-appdb-query! config docs query hits)))))))
