(ns metabase.collections.curation-test
  (:require
   [clojure.test :refer :all]
   [metabase.collections.curation :as collections.curation]
   [metabase.content-verification.core :as moderation]
   [metabase.search.core :as search]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest curated?-test
  (testing "verified card/dashboard is curated"
    (is (collections.curation/curated? {:model "card" :verified true}))
    (is (collections.curation/curated? {:model "dashboard" :verified true})))
  (testing "official-collection content is curated"
    (is (collections.curation/curated? {:model "card" :official_collection true})))
  (testing "plain content is not curated"
    (is (not (collections.curation/curated? {:model "card"})))
    (is (not (collections.curation/curated? {:model "table"}))))
  (testing "non-table library content is always curated"
    (is (collections.curation/curated? {:model "metric" :root_collection_type "library-metrics"}))
    (is (collections.curation/curated? {:model "segment" :root_collection_type "library"})))
  (testing "published tables count only when at the final data layer (BOT-1536)"
    (is (collections.curation/curated? {:model "table" :is_published true :data_layer "final"}))
    (is (not (collections.curation/curated? {:model "table" :is_published true :data_layer "internal"})))
    (is (not (collections.curation/curated? {:model "table" :is_published true :data_layer "hidden"}))))
  (testing "authoritative tables are curated regardless of data layer"
    (is (collections.curation/curated? {:model "table" :data_authority "authoritative"}))
    (is (collections.curation/curated? {:model "table" :data_authority "authoritative" :data_layer "internal"})))
  (testing "text signals are normalized whether keyword or string"
    (is (collections.curation/curated? {:model "table" :is_published true :data_layer :final}))
    (is (collections.curation/curated? {:model :metric :root_collection_type :library-metrics}))
    (is (collections.curation/curated? {:model "table" :data_authority :authoritative})))
  (testing "boolean signals are coerced — only true/1 count, not numeric 0 (DB driver quirk)"
    (is (collections.curation/curated? {:model "card" :verified 1}))
    (is (collections.curation/curated? {:model "card" :official_collection 1}))
    (is (not (collections.curation/curated? {:model "card" :verified 0})))
    (is (not (collections.curation/curated? {:model "card" :official_collection 0})))
    (is (not (collections.curation/curated? {:model "table" :is_published 0 :data_layer "final"})))))

(deftest curated-ids-consistent-with-index-test
  (testing "curated-ids reads the same verdict from source-of-truth tables that the search index
            precomputes from the specs — the two definitions stay consistent (BOT-1570)"
    (search.tu/with-new-search-if-available-without-fallback
      (mt/with-temp [:model/Database   {db :id}  {}
                     :model/Collection {off :id} {:authority_level "official"}
                     :model/Card  {vq :id} {:name "curationfixture verified"}
                     :model/Card  {oq :id} {:name "curationfixture official" :collection_id off}
                     :model/Card  {pq :id} {:name "curationfixture plain"}
                     :model/Table {pt :id} {:db_id db :name "curationfixture published" :active true
                                            :is_published true :data_layer :final}
                     :model/Table {at :id} {:db_id db :name "curationfixture authoritative" :active true
                                            :data_authority :authoritative}
                     :model/Table {xt :id} {:db_id db :name "curationfixture plaintable" :active true}]
        (moderation/create-review! {:moderated_item_id   vq
                                    :moderated_item_type "card"
                                    :moderator_id        (mt/user->id :crowberto)
                                    :status              "verified"})
        ;; re-ingest the now-verified card so the index reflects it
        (search/update! (t2/select-one :model/Card :id vq) true)
        (let [items    [["card" vq] ["card" oq] ["card" pq] ["table" pt] ["table" at] ["table" xt]]
              source   (collections.curation/curated-ids items)
              ;; the index-derived verdict, read back off search results (which now carry :curated)
              indexed  (into #{} (comp (filter :curated) (map (juxt :model :id)))
                             (search.tu/search-results "curationfixture"))
              ->strs   #(into #{} (map (fn [[m id]] [m (str id)])) %)]
          (is (= #{["card" vq] ["card" oq] ["table" pt] ["table" at]} source)
              "source-of-truth marks verified/official cards and published-final/authoritative tables curated")
          (is (= (->strs source) (->strs indexed))
              "source-of-truth agrees with the index's precomputed curated column"))))))
