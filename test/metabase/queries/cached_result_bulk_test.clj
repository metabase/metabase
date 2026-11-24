(ns metabase.queries.cached-result-bulk-test
  "The cached-result gate asked for many snapshots at once, against the same gate asked for each one on its own."
  (:require
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.queries.cached-result :as cached-result]
   [metabase.query-permissions.core :as query-perms]
   [metabase.test :as mt]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private tables
  [:venues :checkins :users :categories :orders :people :products :reviews])

(defn- count-query
  "A count over `table`."
  [table]
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id table)))
        (lib/aggregate (lib/count)))))

(defn- snapshot-row
  "A StoredResult row over `table` computed under `token`, its resolved source ids stamped unless `stamp?` is false."
  [table token stamp?]
  (let [query (count-query table)]
    (cond-> {:result_data       (byte-array 0)
             :creator_id        (mt/user->id :crowberto)
             :database_id       (mt/id)
             :dataset_query     query
             :data_access_token token}
      stamp? (assoc :resolved_source_ids
                    (query-perms/stamped-resolved-source-ids query (query-perms/query->resolved-source-ids query))))))

(defn- summary-cards-run!
  "Calls `f` with the ids of Cards of an exploration Summary in a Collection every user reads, the i-th Card rendering
  the snapshots `(nth snapshot-lists i)`, each a list of StoredResult rows."
  [snapshot-lists f]
  (mt/with-model-cleanup [:model/Collection :model/Card :model/StoredResult]
    (let [{coll-id :id :as coll} (first (collection/create-collections! [{:name (mt/random-name) :location "/"}]))]
      (mt/with-temp [:model/Exploration {expl-id :id}    {:name "Explo" :creator_id (mt/user->id :rasta)}
                     :model/Document    {summary-id :id} {:name           "Summary"
                                                          :creator_id     (mt/user->id :rasta)
                                                          :collection_id  coll-id
                                                          :exploration_id expl-id}]
        (let [card-ids (vec (for [snapshots snapshot-lists]
                              (let [card-id (t2/insert-returning-pk! :model/Card
                                                                     {:name                   (mt/random-name)
                                                                      :display                :table
                                                                      :visualization_settings {}
                                                                      :dataset_query          (count-query :venues)
                                                                      :collection_id          coll-id
                                                                      :document_id            summary-id
                                                                      :creator_id             (mt/user->id :rasta)})]
                                (doseq [row snapshots]
                                  (t2/insert! :model/StoredResultUse
                                              {:stored_result_id (t2/insert-returning-pk! :model/StoredResult row)
                                               :card_id          card-id}))
                                card-id)))]
          (perms/grant-collection-read-permissions! (perms/all-users-group) coll)
          (f card-ids))))))

(defn- can-read-answers
  "The `:can_read` of the Cards with `card-ids` hydrated together."
  [card-ids]
  (mapv mi/can-read? (t2/hydrate (t2/select :model/Card :id [:in card-ids] {:order-by [[:id :asc]]}) :can_read)))

(deftest summary-cards-read-together-as-one-by-one-test
  (testing "Card :can_read of exploration Summary cards answers each Card as when it is asked on its own"
    (summary-cards-run!
     [[(snapshot-row :venues {} true)]
      [(snapshot-row :venues nil true)]
      [(snapshot-row :reviews {} true)]
      [(snapshot-row :venues {:sandbox {(mt/id :venues) "d"}} true)]
      [(snapshot-row :venues {:impersonation {(mt/id) "d"}} true)]
      [(assoc (snapshot-row :venues {} false)
              :dataset_query {:database (mt/id) :type :query :query {:source-table (str "card__" Integer/MAX_VALUE)}})]
      [(snapshot-row :checkins {} true) (snapshot-row :reviews {} true)]
      [(snapshot-row :checkins {} true) (snapshot-row :users {} false)]]
     (fn [card-ids]
       (mt/with-restored-data-perms!
         (perms/set-table-permission! (perms/all-users-group) (mt/id :reviews) :perms/create-queries :no)
         (doseq [user [:crowberto :rasta]]
           (testing user
             (mt/with-test-user user
               (let [alone (mapv #(first (can-read-answers [%])) card-ids)]
                 (when (= user :rasta)
                   (is (= [true false false false false false false true] alone)))
                 (is (= alone (can-read-answers card-ids))))))))))))

(deftest summary-cards-read-statement-count-test
  (testing "Card :can_read of more exploration Summary cards over distinct Tables takes no more statements"
    (doseq [user [:crowberto :rasta]]
      (testing user
        (let [count! (fn [table-keys]
                       (summary-cards-run!
                        (mapv #(vector (snapshot-row % {} true)) table-keys)
                        (fn [card-ids]
                          (mt/with-test-user user
                            (let [cards (t2/select :model/Card :id [:in card-ids])]
                              (t2/with-call-count [call-count]
                                (t2/hydrate cards :can_read)
                                (call-count)))))))]
          (count! (take 2 (drop 6 tables)))
          (is (= (count! (take 2 tables))
                 (count! (take 6 (drop 2 tables))))))))))

(deftest cached-results-answer-as-one-by-one-test
  (testing "the gate asked for many snapshots answers each as when it is asked on its own"
    (summary-cards-run!
     [[(snapshot-row :venues {} true)
       (snapshot-row :venues nil true)
       (snapshot-row :reviews {} true)
       (snapshot-row :venues {:sandbox {(mt/id :venues) "d"}} true)
       (snapshot-row :venues {:impersonation {(mt/id) "d"}} true)
       (assoc (snapshot-row :venues {} false)
              :dataset_query {:database (mt/id) :type :query :query {:source-table (str "card__" Integer/MAX_VALUE)}})
       (snapshot-row :users {} false)]]
     (fn [[card-id]]
       (mt/with-restored-data-perms!
         (perms/set-table-permission! (perms/all-users-group) (mt/id :reviews) :perms/create-queries :no)
         (let [snapshots (sort-by :id (t2/select :model/StoredResult
                                                 :id [:in (t2/select-fn-vec :stored_result_id :model/StoredResultUse
                                                                            :card_id card-id)]))]
           (doseq [user [:crowberto :rasta]]
             (testing user
               (mt/with-test-user user
                 (let [alone (mapv #(first (cached-result/cached-result-view-answers [%])) snapshots)]
                   (is (= alone (cached-result/cached-result-view-answers snapshots)))
                   (is (= alone (cached-result/cached-result-view-answers snapshots {:share-token-reads? true})))
                   (testing "when resolving them together throws, each is resolved on its own"
                     (mt/with-dynamic-fn-redefs [query-perms/resolved-source-ids-answers
                                                 (fn [queries]
                                                   (when (next queries)
                                                     (throw (ex-info "boom" {})))
                                                   (mapv query-perms/query->resolved-source-ids queries))]
                       (is (= alone (cached-result/cached-result-view-answers snapshots)))))))))))))))

(deftest missing-table-snapshot-answers-alike-test
  (testing "a snapshot whose stamped source ids name a Table that does not exist is answered alike alone and in a list"
    (let [query (count-query :venues)
          row   (assoc (snapshot-row :venues {} false)
                       :resolved_source_ids (query-perms/stamped-resolved-source-ids
                                             query
                                             {:table-ids #{(mt/id :venues) Integer/MAX_VALUE}}))]
      (summary-cards-run!
       [[row (snapshot-row :checkins {} true)]]
       (fn [[card-id]]
         (let [snapshots (sort-by :id (t2/select :model/StoredResult
                                                 :id [:in (t2/select-fn-vec :stored_result_id :model/StoredResultUse
                                                                            :card_id card-id)]))]
           (mt/with-test-user :rasta
             (doseq [[label run] [["schemas enforced" (fn [thunk] (thunk))]
                                  ["schemas off" (fn [thunk] (mu/disable-enforcement (thunk)))]]]
               (testing label
                 (is (= (run #(mapv (fn [snapshot] (first (cached-result/cached-result-view-answers [snapshot])))
                                    snapshots))
                        (run #(cached-result/cached-result-view-answers snapshots {:share-token-reads? true})))))))))))))
