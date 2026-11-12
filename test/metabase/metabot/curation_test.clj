(ns metabase.metabot.curation-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.curation :as metabot.curation]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

(use-fixtures :each (fn [thunk] (mt/with-additional-premium-features #{:library} (thunk))))

(deftest curated-ids-ignore-non-official-table-signals-test
  (testing "a table is curated only in a remote-synced collection, not for being published or authoritative"
    (mt/with-temp [:model/Database   {db :id}  {}
                   :model/Collection {data :id} {:type "library-data" :is_remote_synced true}
                   :model/Table {ot :id} {:db_id db :active true :is_published true :collection_id data}
                   :model/Table {pt :id} {:db_id db :active true :is_published true :data_layer :final}
                   :model/Table {at :id} {:db_id db :active true :data_authority :authoritative}]
      (is (= #{["table" ot]}
             (metabot.curation/curated-ids [["table" ot] ["table" pt] ["table" at]]))))))

(deftest curated-ids-official-from-remote-synced-collection-test
  (testing "content counts as curated in a remote-synced collection and not in an unsynced one"
    (mt/with-temp [:model/Collection {synced :id}   {:is_remote_synced true}
                   :model/Collection {unsynced :id} {}
                   :model/Card      {sq :id} {:collection_id synced}
                   :model/Card      {uq :id} {:collection_id unsynced}
                   :model/Dashboard {sd :id} {:collection_id synced}
                   :model/Dashboard {ud :id} {:collection_id unsynced}]
      (is (= #{["card" sq] ["dashboard" sd]}
             (metabot.curation/curated-ids [["card" sq] ["card" uq] ["dashboard" sd] ["dashboard" ud]]))))))

(deftest curated-ids-consistent-with-index-test
  (testing "curated-ids reads the same verdict from source-of-truth tables that the search index
            precomputes from the specs, so the two definitions stay consistent (BOT-1570)"
    (search.tu/with-appdb-search-if-available-without-fallback
      (mt/with-temp [:model/Database   {db :id}  {}
                     :model/Collection {off :id} {:is_remote_synced true}
                     ;; name avoids the "curationfixture" search token so the collection itself isn't a
                     ;; result (curated-ids only handles recent-view models, not collections)
                     :model/Collection {data :id} {:type "library-data" :name "fixturedatacoll" :is_remote_synced true}
                     :model/Card  {oq :id} {:name "curationfixture official" :collection_id off}
                     :model/Card  {pq :id} {:name "curationfixture plain"}
                     :model/Table {pt :id} {:db_id db :name "curationfixture published" :active true
                                            :is_published true :data_layer :final}
                     :model/Table {at :id} {:db_id db :name "curationfixture authoritative" :active true
                                            :data_authority :authoritative}
                     :model/Table {xt :id} {:db_id db :name "curationfixture plaintable" :active true}
                     :model/Table {ot :id} {:db_id db :name "curationfixture officialtable" :active true
                                            :is_published true :collection_id data}]
        (let [items    [["card" oq] ["card" pq]
                        ["table" pt] ["table" at] ["table" xt] ["table" ot]]
              source   (metabot.curation/curated-ids items)
              ;; the index-derived verdict, read back off search results (which now carry :curated)
              indexed  (into #{} (comp (filter :curated) (map (juxt :model :id)))
                             (search.tu/search-results "curationfixture"))
              ->strs   #(into #{} (map (fn [[m id]] [m (str id)])) %)]
          (is (= #{["card" oq] ["table" ot]} source)
              "source-of-truth marks only content in remote-synced collections curated")
          (is (= (->strs source) (->strs indexed))
              "source-of-truth agrees with the index's precomputed curated column"))))))

(deftest curated-ids-parity-with-search-filter-test
  (testing "curated-ids agrees with `search :curated true` over every model it recognizes, in more than one batch,
            and on the rows search excludes (archived, hidden, document-owned)"
    (search.tu/with-appdb-search-if-available-without-fallback
      (mt/with-temp [:model/Database   {db :id}  {}
                     :model/Collection {off :id} {:is_remote_synced true}
                     :model/Collection {lib :id} {:type "library-metrics" :name "fixturelibcoll two"}
                     :model/Collection {data :id} {:type "library-data" :name "fixturedatacoll two" :is_remote_synced true}
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
                                            :visibility_type :hidden :is_published true :collection_id data}
                     :model/Table {ot :id} {:db_id db :name "parityfixture officialtable" :active true
                                            :is_published true :collection_id data}
                     :model/Table {xt :id} {:db_id db :name "parityfixture plaintable" :active true}]
        (let [items   [["card" oq] ["card" aq] ["metric" lm] ["metric" om] ["metric" pm]
                       ["dashboard" od] ["dashboard" pd]
                       ["table" pt] ["table" st] ["table" at] ["table" ht] ["table" ot] ["table" xt]
                       ;; a duplicate id is judged once and returned once
                       ["card" oq]]
              source  (with-redefs [metabot.curation/curation-batch-size 2]
                        (metabot.curation/curated-ids items))
              indexed (into #{} (comp (filter :curated) (map (juxt :model :id)))
                            (search.tu/search-results "parityfixture"))
              ->strs  #(into #{} (map (fn [[m id]] [m (str id)])) %)]
          (is (= #{["card" oq] ["metric" om] ["dashboard" od] ["table" ot]}
                 source))
          (is (= (->strs source) (->strs indexed))
              "source-of-truth agrees with the index's precomputed curated column"))))))
