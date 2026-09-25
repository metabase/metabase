(ns metabase.search.query-semantics-test
  "Exact result-set contracts for in-place and app-db search.

  The S cases use identical queries; the T cases use engine-specific translations.
  Each case runs against temporary cards or a temporary index table. Assertions
  compare membership, not ranking. The case IDs match the metabase-wiki corpuses."
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.search.appdb.index :as search.index]
   [metabase.search.appdb.specialization.api :as specialization]
   [metabase.search.core :as search]
   [metabase.search.engine :as search.engine]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]))

(def ^:private cases
  (-> "search/query_semantics_cases.edn" io/resource slurp edn/read-string))

(def ^:private translations
  (-> "search/query_semantics_translations.edn" io/resource slurp edn/read-string))

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
          (is (= (set expected)
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
        (is (= (set expected)
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
    (doseq [{:keys [id focus] :as case} cases]
      (testing (str id " — " focus)
        (let [{:keys [config docs expect query]} case]
          (check-in-place-query! docs query (:in-place expect))
          (when dialect
            (check-appdb-query! config docs query (dialect expect))))))))

(deftest translated-query-semantics-test
  (let [cases-by-id (into {} (map (juxt :id identity)) cases)
        dialect     (available-appdb-dialect)]
    (doseq [{:keys [id focus source target queries expect]} translations]
      (testing (str id " — " focus " (target " target " on " source ")")
        (let [{:keys [config docs] :as source-case} (cases-by-id source)]
          ;; Keep the translated target anchored to its same-query S-case oracle.
          (is (= (set (target (:expect source-case))) (set (target expect))))
          (check-in-place-query! docs (:in-place queries) (:in-place expect))
          (when dialect
            (check-appdb-query! config docs (dialect queries) (dialect expect))))))))
