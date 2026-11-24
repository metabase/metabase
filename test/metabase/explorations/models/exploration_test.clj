(ns metabase.explorations.models.exploration-test
  (:require
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.events.test-util :as events.tu]
   [metabase.explorations.models.exploration :as exploration]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.search.config :as search.config]
   [metabase.search.core :as search]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.spec :as search.spec]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(use-fixtures :once (fixtures/initialize :db :test-users))

(defn- venues-count-query
  "A `:metric` card's `:dataset_query`: count over the venues table, built with Lib."
  []
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
        (lib/aggregate (lib/count)))))

(deftest exploration-creates-entity-id-test
  (mt/with-temp [:model/User u {}
                 :model/Exploration e {:name "x" :creator_id (:id u)}]
    (is (= 21 (count (:entity_id e))))
    (testing "timestamps are populated"
      (is (some? (:created_at e)))
      (is (some? (:updated_at e))))))

(deftest exploration-collection-id-test
  (testing "omitting :collection_id leaves the exploration in the root collection"
    (mt/with-temp [:model/User u {}
                   :model/Exploration e {:name "x" :creator_id (:id u)}]
      (is (nil? (:collection_id e)))))
  (testing "explicit :collection_id is respected (including nil for root)"
    (mt/with-temp [:model/User       u {}
                   :model/Collection c {}
                   :model/Exploration explicit  {:name "y" :creator_id (:id u) :collection_id (:id c)}
                   :model/Exploration root-expl {:name "z" :creator_id (:id u) :collection_id nil}]
      (is (= (:id c) (:collection_id explicit)))
      (is (nil? (:collection_id root-expl))))))

(deftest exploration-in-personal-collection-is-creator-only-test
  (testing "an exploration in the creator's Personal Collection is private to creator + admins"
    (mt/with-temp [:model/User owner {}
                   :model/User other {}
                   :model/Exploration e {:name          "x"
                                         :creator_id    (:id owner)
                                         :collection_id (:id (collection/user->personal-collection (:id owner)))}]
      (testing "owner can read and write"
        (mt/with-current-user (:id owner)
          (is (true? (mi/can-read? (t2/hydrate (t2/select-one :model/Exploration :id (:id e)) :can_read))))
          (is (true? (mi/can-write? (t2/hydrate (t2/select-one :model/Exploration :id (:id e)) :can_write))))))
      (testing "other user cannot read or write"
        (mt/with-current-user (:id other)
          (is (false? (mi/can-read? (t2/hydrate (t2/select-one :model/Exploration :id (:id e)) :can_read))))
          (is (false? (mi/can-write? (t2/hydrate (t2/select-one :model/Exploration :id (:id e)) :can_write))))))
      (testing "superuser can read and write"
        (mt/with-test-user :crowberto
          (is (true? (mi/can-read? (t2/hydrate (t2/select-one :model/Exploration :id (:id e)) :can_read))))
          (is (true? (mi/can-write? (t2/hydrate (t2/select-one :model/Exploration :id (:id e)) :can_write)))))))))

(deftest exploration-thread-perms-delegate-to-exploration-test
  (mt/with-temp [:model/User owner {}
                 :model/User other {}
                 :model/Exploration e {:name          "x"
                                       :creator_id    (:id owner)
                                       :collection_id (:id (collection/user->personal-collection (:id owner)))}
                 :model/ExplorationThread t {:exploration_id (:id e)}]
    (mt/with-current-user (:id owner)
      (is (true? (mi/can-read? (t2/hydrate (t2/select-one :model/ExplorationThread :id (:id t)) :can_read)))))
    (mt/with-current-user (:id other)
      (is (false? (mi/can-read? (t2/hydrate (t2/select-one :model/ExplorationThread :id (:id t)) :can_read)))))))

(deftest exploration-in-shared-collection-uses-collection-perms-test
  (testing "When an exploration lives in a shared collection, can-read?/can-write? use that collection's perms."
    (mt/with-temp [:model/User       owner    {}
                   :model/Card       card     {:type          :metric
                                               :creator_id    (:id owner)
                                               :dataset_query (venues-count-query)}
                   :model/Collection coll     {}
                   :model/Exploration e       {:name          "shared"
                                               :creator_id    (:id owner)
                                               :collection_id (:id coll)}
                   :model/ExplorationThread t {:exploration_id (:id e)}
                   :model/ExplorationBlock g {:exploration_thread_id (:id t)}
                   :model/ExplorationPage p {:exploration_block_id (:id g)
                                             :card_id (:id card) :dimension_id "d1"
                                             :query_type "default"}
                   :model/ExplorationQuery  q {:exploration_thread_id (:id t)
                                               :page_id      (:id p)
                                               :card_id      (:id card)
                                               :dimension_id "d1"
                                               :dataset_query (venues-count-query)}]
      (mt/with-non-admin-groups-no-collection-perms (:id coll)
        (testing "user with no collection perms cannot read"
          (mt/with-test-user :rasta
            (is (false? (mi/can-read? (t2/hydrate (t2/select-one :model/Exploration :id (:id e)) :can_read))))
            (is (false? (mi/can-write? (t2/hydrate (t2/select-one :model/Exploration :id (:id e)) :can_write))))
            (is (false? (mi/can-read? (t2/hydrate (t2/select-one :model/ExplorationThread :id (:id t)) :can_read))))
            (is (false? (mi/can-read? (t2/hydrate (t2/select-one :model/ExplorationQuery :id (:id q)) :can_read))))))
        (perms/grant-collection-read-permissions! (perms-group/all-users) coll)
        (testing "user with collection-read can read but not write"
          (mt/with-test-user :rasta
            (is (true?  (mi/can-read? (t2/hydrate (t2/select-one :model/Exploration :id (:id e)) :can_read))))
            (is (false? (mi/can-write? (t2/hydrate (t2/select-one :model/Exploration :id (:id e)) :can_write))))
            (is (true?  (mi/can-read? (t2/hydrate (t2/select-one :model/ExplorationThread :id (:id t)) :can_read))))
            (is (true?  (mi/can-read? (t2/hydrate (t2/select-one :model/ExplorationQuery :id (:id q)) :can_read))))))
        (perms/grant-collection-readwrite-permissions! (perms-group/all-users) coll)
        (testing "user with collection-write can read and write"
          (mt/with-test-user :rasta
            (is (true? (mi/can-read? (t2/hydrate (t2/select-one :model/Exploration :id (:id e)) :can_read))))
            (is (true? (mi/can-write? (t2/hydrate (t2/select-one :model/Exploration :id (:id e)) :can_write))))
            (is (true? (mi/can-write? (t2/hydrate (t2/select-one :model/ExplorationThread :id (:id t)) :can_write))))
            (is (true? (mi/can-write? (t2/hydrate (t2/select-one :model/ExplorationQuery :id (:id q)) :can_write))))))))))

(deftest exploration-in-root-collection-uses-root-perms-test
  (testing "collection_id=NULL → root collection perms apply."
    (mt/with-temp [:model/User       owner {}
                   :model/Exploration e   {:name          "root-shared"
                                           :creator_id    (:id owner)
                                           :collection_id nil}]
      (mt/with-non-admin-groups-no-root-collection-perms
        (testing "no root perms → cannot read"
          (mt/with-test-user :rasta
            (is (false? (mi/can-read? (t2/hydrate (t2/select-one :model/Exploration :id (:id e)) :can_read))))))
        (mt/with-temp [:model/PermissionsGroup       g {}
                       :model/PermissionsGroupMembership _ {:group_id (:id g) :user_id (mt/user->id :rasta)}]
          (perms/grant-permissions! (:id g) "/collection/root/read/")
          (testing "root-read granted → can read but not write"
            (mt/with-test-user :rasta
              (is (true?  (mi/can-read? (t2/hydrate (t2/select-one :model/Exploration :id (:id e)) :can_read))))
              (is (false? (mi/can-write? (t2/hydrate (t2/select-one :model/Exploration :id (:id e)) :can_write))))))
          (perms/grant-permissions! (:id g) "/collection/root/")
          (testing "root-write granted → can write"
            (mt/with-test-user :rasta
              (is (true? (mi/can-write? (t2/hydrate (t2/select-one :model/Exploration :id (:id e)) :can_write)))))))))))

(deftest exploration-query-json-transforms-test
  ;; ExplorationBlock's :metrics/:dimensions JSON roundtrip is covered by
  ;; `metabase.explorations.models.exploration-block-test/json-transforms-roundtrip-test`;
  ;; this test only covers the ExplorationQuery transforms.
  (mt/with-temp [:model/User u {}
                 :model/Card metric {:type :metric :creator_id (:id u)}
                 :model/Exploration e {:name "x" :creator_id (:id u)}
                 :model/ExplorationThread t {:exploration_id (:id e)}
                 :model/ExplorationBlock m {:exploration_thread_id (:id t)}
                 :model/ExplorationPage p {:exploration_block_id (:id m)
                                           :card_id (:id metric) :dimension_id "d1"
                                           :query_type "default"}
                 :model/ExplorationQuery q {:exploration_thread_id (:id t)
                                            :card_id (:id metric)
                                            :dimension_id "d1"
                                            :page_id (:id p)
                                            :dataset_query {:database 1 :type :query}}]
    (testing "ExplorationQuery transforms"
      (let [reread (t2/select-one :model/ExplorationQuery :id (:id q))]
        (is (= "d1" (:dimension_id reread)))
        (is (= 1 (-> reread :dataset_query :database)))))))

(deftest exploration-is-searchable-test
  ;; The wiring assertions run unconditionally so this test can never silently pass
  ;; with zero assertions; only the index round-trip below is gated on engine support.
  (testing "the exploration search-model is wired up"
    (is (= :model/Exploration (:model (search.spec/search-model-spec "exploration"))))
    (is (contains? search.config/all-models "exploration")))
  (testing "an exploration is indexed and returned from the default search"
    (when (search/supports-index?)
      (search.tu/with-temp-index-table
        (mt/with-temp [:model/Collection  coll {}
                       :model/Exploration e {:name "searchable-research" :collection_id (:id coll)}]
          (letfn [(research-hits [user]
                    (->> (search.tu/search-results "searchable-research"
                                                   {:search-engine   "appdb"
                                                    :current-user-id (mt/user->id user)})
                         (filter (comp #{"searchable-research"} :name))
                         (mapv (juxt :model :id))))]
            (search.ingestion/update!
             (#'search.ingestion/query->documents
              (#'search.ingestion/spec-index-reducible "exploration" [:= :this.id (:id e)]))
             [])
            (testing "a user who can read the collection finds it"
              (is (= [["exploration" (:id e)]] (research-hits :crowberto))))
            (testing "a user without collection perms does not"
              (mt/with-non-admin-groups-no-collection-perms coll
                (is (= [] (research-hits :rasta)))))))))))

(deftest hydrate-threads-on-exploration-test
  (mt/with-temp [:model/User u {}
                 :model/Exploration e {:name "x" :creator_id (:id u)}
                 :model/ExplorationThread _t1 {:exploration_id (:id e) :position 0}
                 :model/ExplorationThread _t2 {:exploration_id (:id e) :position 1}]
    (let [hydrated (t2/hydrate (t2/select-one :model/Exploration :id (:id e)) :threads)]
      (is (= 2 (count (:threads hydrated))))
      (is (= [0 1] (mapv :position (:threads hydrated)))))))

(deftest create-explorations-with-different-columns-test
  (mt/with-model-cleanup [:model/Exploration]
    (let [creator-id   (mt/user->id :rasta)
          explorations (exploration/create-explorations! [{:name "Plain" :creator_id creator-id}
                                                          {:name "Archived" :creator_id creator-id :archived true}])]
      (is (= ["Plain" "Archived"] (map :name explorations)))
      (is (= [false true] (map #(t2/select-one-fn :archived :model/Exploration :id (:id %)) explorations))))))

(deftest write-function-statement-counts-do-not-grow-with-rows-test
  (mt/with-temp [:model/Collection {live :id}  {}
                 :model/Collection {other :id} {}]
    (mt/with-model-cleanup [:model/Document :model/Exploration]
      (let [user-id (mt/user->id :rasta)
            rows    (fn [n] (mapv (fn [_] {:name (mt/random-name) :creator_id user-id :collection_id live}) (range n)))
            fresh!  (fn [n]
                      (let [ids (mapv :id (exploration/create-explorations! (rows n)))]
                        (doseq [id ids]
                          (t2/insert! :model/Document (assoc (mt/with-temp-defaults :model/Document) :exploration_id id :collection_id live)))
                        ids))
            update! (fn [prepare changes n]
                      (let [ids (fresh! n)]
                        (prepare (take-nth 2 ids))
                        (events.tu/statement-count! #(exploration/update-explorations! (mapv (fn [id] (assoc changes :id id)) ids)))))
            counted (fn [f]
                      (f 1)
                      (is (= (f 2) (f 6))))]
        (testing "creating explorations"
          (counted (fn [n] (let [rows (rows n)] (events.tu/statement-count! #(exploration/create-explorations! rows))))))
        (testing "updating columns, some already holding the new value"
          (counted (partial update!
                            (fn [ids] (exploration/update-explorations! (mapv (fn [id] {:id id :description "Same"}) ids)))
                            {:description "Same"})))
        (testing "archiving explorations and their summary documents, some already archived"
          (counted (partial update!
                            (fn [ids] (exploration/update-explorations! (mapv (fn [id] {:id id :archived true}) ids)))
                            {:archived true})))
        (testing "restoring explorations and their summary documents, some already live"
          (counted (partial update!
                            (fn [ids] (exploration/update-explorations! (mapv (fn [id] {:id id :archived true}) ids)))
                            {:archived false})))
        (testing "moving explorations, some already in the Collection"
          (counted (partial update!
                            (fn [ids] (exploration/update-explorations! (mapv (fn [id] {:id id :collection_id other}) ids)))
                            {:collection_id other})))
        (testing "deleting explorations"
          (counted (fn [n] (let [ids (fresh! n)] (events.tu/statement-count! #(exploration/delete-explorations! ids))))))))))

(deftest archived-directly-follows-collection-through-plain-update-test
  (testing "a plain t2/update! of archived derives archived_directly in the statement from the Collection"
    (mt/with-temp [:model/Collection {live :id}     {}
                   :model/Collection {archived :id} {:archived true}
                   :model/Exploration {a :id} {:collection_id live}
                   :model/Exploration {b :id} {:collection_id archived}]
      (t2/update! :model/Exploration :id [:in [a b]] {:archived true})
      (is (= [true false] (mapv #(t2/select-one-fn :archived_directly :model/Exploration :id %) [a b])))
      (t2/update! :model/Exploration :id [:in [a b]] {:archived false})
      (is (= [false false] (mapv #(t2/select-one-fn :archived_directly :model/Exploration :id %) [a b]))))))

(deftest unarchived-exploration-in-archived-collection-is-refused-test
  (mt/with-temp [:model/Collection {archived-id :id} {:archived true}
                 :model/Collection {live-id :id}     {}
                 :model/Exploration {id :id}         {:collection_id live-id}]
    (let [creator-id (mt/user->id :rasta)
          stored     #(t2/select-one-fn :collection_id :model/Exploration :id id)]
      (testing "creating one unarchived in an archived Collection throws a 400 and writes nothing"
        (let [before (t2/count :model/Exploration)]
          (is (= 400 (try (exploration/create-explorations! [{:name "Refused" :creator_id creator-id :collection_id archived-id}])
                          (catch clojure.lang.ExceptionInfo e (:status-code (ex-data e))))))
          (is (= before (t2/count :model/Exploration)))))
      (testing "moving one into an archived Collection throws a 400 and leaves it where it is"
        (is (= 400 (try (exploration/update-explorations! [{:id id :collection_id archived-id}])
                        (catch clojure.lang.ExceptionInfo e (:status-code (ex-data e))))))
        (is (= live-id (stored))))
      (testing "an archived Exploration may go into an archived Collection"
        (exploration/update-explorations! [{:id id :archived true :collection_id archived-id}])
        (is (= archived-id (stored)))))))

(defn- archive-call-count
  "The statements that rasta's question whether he may archive `explorations` takes, which must be allowed."
  [explorations]
  (mt/with-current-user (mt/user->id :rasta)
    (t2/with-call-count [call-count]
      (is (true? (mi/can-update-each? :model/Exploration explorations {:archived true})))
      (call-count))))

(deftest can-update-each-archive-test
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-model-cleanup [:model/Collection :model/Exploration]
      (let [coll-ids        (t2/insert-returning-pks! :model/Collection
                                                      (repeatedly 41 #(t2.with-temp/with-temp-defaults :model/Collection)))
            _               (doseq [coll-id (butlast coll-ids)]
                              (perms/grant-collection-readwrite-permissions! (perms/all-users-group) coll-id))
            exploration-ids (t2/insert-returning-pks! :model/Exploration
                                                      (for [coll-id coll-ids]
                                                        (assoc (t2.with-temp/with-temp-defaults :model/Exploration)
                                                               :collection_id coll-id)))
            explorations    (t2/select :model/Exploration :id [:in exploration-ids] {:order-by [[:id :asc]]})
            writable        (vec (butlast explorations))]
        (testing "a batch with one Exploration rasta cannot write is refused"
          (mt/with-current-user (mt/user->id :rasta)
            (is (false? (mi/can-update-each? :model/Exploration (conj (subvec writable 0 3) (last explorations))
                                             {:archived true})))))
        (testing "the question takes as many statements for 40 Explorations as for 10"
          (archive-call-count (subvec writable 0 2))
          (is (= (archive-call-count (subvec writable 0 10))
                 (archive-call-count writable))))))))

(defn- per-row-can-read?
  "The answer the per-row `:can_read` hydration gave: the parent row loaded alone and asked."
  [parent-model parent-id]
  (boolean (some-> (t2/select-one parent-model :id parent-id) (t2/hydrate :can_read) mi/can-read?)))

(deftest child-can-read-statements-do-not-grow-with-rows-test
  (mt/with-temp [:model/Collection open   {}
                 :model/Collection closed {}
                 :model/Card       metric {:type :metric, :dataset_query (venues-count-query)}]
    (mt/with-non-admin-groups-no-collection-perms open
      (mt/with-non-admin-groups-no-collection-perms closed
        (perms/grant-collection-read-permissions! (perms-group/all-users) open)
        (mt/with-model-cleanup [:model/Exploration]
          (let [user-id      (mt/user->id :crowberto)
                explorations (t2/insert-returning-instances! :model/Exploration
                                                             (for [i (range 6)]
                                                               {:name          (str "x" i)
                                                                :creator_id    user-id
                                                                :collection_id (:id (if (even? i) open closed))}))
                threads      (t2/insert-returning-instances! :model/ExplorationThread
                                                             (for [e explorations] {:exploration_id (:id e)}))
                blocks       (t2/insert-returning-instances! :model/ExplorationBlock
                                                             (for [t threads] {:exploration_thread_id (:id t)}))
                pages        (t2/insert-returning-instances! :model/ExplorationPage
                                                             (for [b blocks]
                                                               {:exploration_block_id (:id b), :card_id (:id metric)
                                                                :dimension_id "d1", :query_type "default"}))
                queries      (t2/insert-returning-instances! :model/ExplorationQuery
                                                             (for [[t p] (map vector threads pages)]
                                                               {:exploration_thread_id (:id t), :page_id (:id p)
                                                                :card_id (:id metric), :dimension_id "d1", :database_id (mt/id)
                                                                :dataset_query (venues-count-query)}))]
            (mt/with-test-user :rasta
              (doseq [[model rows parent-model parent-key] [[:model/ExplorationThread threads :model/Exploration :exploration_id]
                                                            [:model/ExplorationBlock blocks :model/ExplorationThread :exploration_thread_id]
                                                            [:model/ExplorationPage pages :model/ExplorationBlock :exploration_block_id]
                                                            [:model/ExplorationQuery queries :model/ExplorationThread :exploration_thread_id]]]
                (testing model
                  (let [hydrate (fn [n]
                                  (t2/with-call-count [call-count]
                                    (let [hydrated (doall (t2/hydrate (vec (take n rows)) :can_read))]
                                      {:statements (call-count)
                                       :values     (mapv mi/can-read? hydrated)})))]
                    (hydrate 1)
                    (is (= (:statements (hydrate 2)) (:statements (hydrate 6))))
                    (is (= [true false true false true false] (:values (hydrate 6))))
                    (is (= (mapv #(per-row-can-read? parent-model (parent-key %)) rows)
                           (:values (hydrate 6))))))))))))))
