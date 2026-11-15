(ns metabase.metabot.curation-test
  (:require
   [clojure.test :refer :all]
   [metabase.content-verification.core :as moderation]
   [metabase.metabot.curation :as metabot.curation]
   [metabase.search.core :as search]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(def ^:private curation-features
  "The features the verified, official, and Library curation signals are gated on; the index precomputes `curated`
  without a gate, so the two agree only while the features are active."
  #{:content-verification :official-collections :library})

(use-fixtures :each (fn [thunk] (mt/with-additional-premium-features curation-features (thunk))))

(deftest curated-ids-consistent-with-index-test
  (testing "curated-ids reads the same verdict from source-of-truth tables that the search index
            precomputes from the specs, so the two definitions stay consistent (BOT-1570)"
    (search.tu/with-appdb-search-if-available-without-fallback
      (mt/with-temp [:model/Database   {db :id}  {}
                     :model/Collection {off :id} {:authority_level "official"}
                     ;; name avoids the "curationfixture" search token so the collection itself isn't a
                     ;; result (curated-ids only handles recent-view models, not collections)
                     :model/Collection {lib :id} {:type "library-data" :name "fixturelibcoll"}
                     :model/Card  {vq :id} {:name "curationfixture verified"}
                     :model/Card  {oq :id} {:name "curationfixture official" :collection_id off}
                     :model/Card  {pq :id} {:name "curationfixture plain"}
                     :model/Table {pt :id} {:db_id db :name "curationfixture published" :active true
                                            :is_published true :data_layer :final}
                     :model/Table {at :id} {:db_id db :name "curationfixture authoritative" :active true
                                            :data_authority :authoritative}
                     :model/Table {xt :id} {:db_id db :name "curationfixture plaintable" :active true}
                     ;; final-layer table under a library collection but NOT published: the spec joins the
                     ;; collection only for published tables, so neither source nor index marks it curated
                     :model/Table {ult :id} {:db_id db :name "curationfixture unpublishedlib" :active true
                                             :is_published false :data_layer :final :collection_id lib}]
        (moderation/create-review! {:moderated_item_id   vq
                                    :moderated_item_type "card"
                                    :moderator_id        (mt/user->id :crowberto)
                                    :status              "verified"})
        ;; re-ingest the now-verified card so the index reflects it
        (search/update! (t2/select-one :model/Card :id vq) true)
        (let [items    [["card" vq] ["card" oq] ["card" pq]
                        ["table" pt] ["table" at] ["table" xt] ["table" ult]]
              source   (metabot.curation/curated-ids items)
              ;; the index-derived verdict, read back off search results (which now carry :curated)
              indexed  (into #{} (comp (filter :curated) (map (juxt :model :id)))
                             (search.tu/search-results "curationfixture"))
              ->strs   #(into #{} (map (fn [[m id]] [m (str id)])) %)]
          (is (= #{["card" vq] ["card" oq] ["table" pt] ["table" at]} source)
              "source-of-truth marks verified/official cards and published-final/authoritative tables curated")
          (is (= (->strs source) (->strs indexed))
              "source-of-truth agrees with the index's precomputed curated column"))))))

(deftest curated-ids-parity-with-search-filter-test
  (testing "curated-ids agrees with `search :curated true` over every model it recognizes, in more than one batch,
            and on the rows search excludes (archived, hidden, document-owned)"
    (search.tu/with-appdb-search-if-available-without-fallback
      (mt/with-temp [:model/Database   {db :id}  {}
                     :model/Collection {off :id} {:authority_level "official"}
                     :model/Collection {lib :id} {:type "library-metrics" :name "fixturelibcoll two"}
                     :model/Card {vq :id} {:name "parityfixture verified question"}
                     :model/Card {oq :id} {:name "parityfixture official question" :collection_id off}
                     :model/Card {aq :id} {:name "parityfixture archived official" :collection_id off :archived true}
                     :model/Card {lm :id} {:name "parityfixture library metric" :type :metric :collection_id lib}
                     :model/Card {om :id} {:name "parityfixture official metric" :type :metric :collection_id off}
                     :model/Card {pm :id} {:name "parityfixture plain metric" :type :metric}
                     :model/Dashboard {od :id} {:name "parityfixture official dashboard" :collection_id off}
                     :model/Dashboard {pd :id} {:name "parityfixture plain dashboard"}
                     :model/Table {pt :id} {:db_id db :name "parityfixture published" :active true
                                            :is_published true :data_layer :final}
                     :model/Table {st :id} {:db_id db :name "parityfixture staged" :active true
                                            :is_published true :data_layer :internal}
                     :model/Table {at :id} {:db_id db :name "parityfixture authoritative" :active true
                                            :data_authority :authoritative}
                     :model/Table {ht :id} {:db_id db :name "parityfixture hidden" :active true
                                            :visibility_type :hidden :data_authority :authoritative}
                     :model/Table {xt :id} {:db_id db :name "parityfixture plaintable" :active true}]
        (moderation/create-review! {:moderated_item_id   vq
                                    :moderated_item_type "card"
                                    :moderator_id        (mt/user->id :crowberto)
                                    :status              "verified"})
        (search/update! (t2/select-one :model/Card :id vq) true)
        (let [items   [["card" vq] ["card" oq] ["card" aq] ["metric" lm] ["metric" om] ["metric" pm]
                       ["dashboard" od] ["dashboard" pd]
                       ["table" pt] ["table" st] ["table" at] ["table" ht] ["table" xt]
                       ;; a duplicate id is judged once and returned once
                       ["card" vq]]
              source  (with-redefs [metabot.curation/curation-batch-size 2]
                        (metabot.curation/curated-ids items))
              indexed (into #{} (comp (filter :curated) (map (juxt :model :id)))
                            (search.tu/search-results "parityfixture"))
              ->strs  #(into #{} (map (fn [[m id]] [m (str id)])) %)]
          (is (= #{["card" vq] ["card" oq] ["metric" lm] ["metric" om] ["dashboard" od] ["table" pt] ["table" at]}
                 source))
          (is (= (->strs source) (->strs indexed))
              "source-of-truth agrees with the index's precomputed curated column"))))))
