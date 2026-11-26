(ns metabase-enterprise.data-testing.models.card-test-test
  "CardTest model behavior: JSON columns, the newest run, what deleting a test or its card does, and permissions."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.data-testing.db :as data-testing.db]
   [metabase-enterprise.data-testing.models.card-test :as data-testing.models.card-test]
   [metabase-enterprise.data-testing.run-tracking :as data-testing.run-tracking]
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.permissions.test-util :as perms.tu]
   [metabase.queries.models.card :as queries.card]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private inputs
  [{:table   {:schema "PUBLIC" :name "PEOPLE"}
    :format  "rows"
    :columns [{:name "ID" :cast_type "INTEGER"}]
    :rows    [{"ID" 1}]}])

(def ^:private expectations
  [{:type "empty" :name "no orphan rows" :sql "SELECT * FROM {{output}} WHERE ID IS NULL"}])

(deftest json-columns-round-trip-test
  (mt/with-temp [:model/Card     {card-id :id} {}
                 :model/CardTest {test-id :id} {:card_id      card-id
                                                :inputs       inputs
                                                :expectations expectations}]
    (let [card-test (t2/select-one :model/CardTest :id test-id)]
      (testing "the inputs and expectations read back normalized"
        (is (= [{:table   {:schema "PUBLIC" :name "PEOPLE"}
                 :format  :rows
                 :columns [{:name "ID" :cast_type "INTEGER"}]
                 :rows    [{"ID" 1}]}]
               (:inputs card-test)))
        (is (= [{:type :empty :name "no orphan rows" :sql "SELECT * FROM {{output}} WHERE ID IS NULL"}]
               (:expectations card-test))))
      (testing "an entity id and timestamps are set on insert"
        (is (=? {:entity_id string? :created_at some? :updated_at some?} card-test))))))

(deftest invalid-expectation-is-rejected-on-write-test
  (mt/with-temp [:model/Card {card-id :id} {}]
    (is (thrown? Exception
                 (t2/insert! :model/CardTest {:card_id      card-id
                                              :creator_id   (mt/user->id :rasta)
                                              :name         "a test"
                                              :inputs       []
                                              :expectations [{:type "empty" :name "no sql"}]})))
    (is (zero? (t2/count (t2/table-name :model/CardTest) :card_id card-id)))))

(deftest last-run-hydration-finds-only-card-runs-test
  (mt/with-temp [:model/Card        {card-id :id} {}
                 :model/CardTest    {test-id :id :as card-test} {:card_id card-id}
                 :model/DataTestRun _                           {:test_type :card, :test_id test-id}
                 :model/DataTestRun {card-run :id}              {:test_type :card, :test_id test-id}
                 :model/DataTestRun _                           {:test_type :transform, :test_id test-id}]
    (testing "the newest run of the test, not a run of a transform test with the same id"
      (is (= card-run (-> (t2/hydrate card-test :last_run) :last_run :id))))
    (testing "a test with no runs has none"
      (mt/with-temp [:model/CardTest other {:card_id card-id}]
        (is (nil? (:last_run (t2/hydrate other :last_run))))))))

(deftest deleting-a-card-test-keeps-its-runs-test
  (mt/with-temp [:model/Card        {card-id :id} {}
                 :model/CardTest    {test-id :id} {:card_id card-id}
                 :model/DataTestRun {other-run :id} {:test_type :transform, :test_id test-id}]
    (let [{run-id :id} (data-testing.run-tracking/start-run! :card test-id)]
      (data-testing.run-tracking/finish-run! run-id :passed)
      (data-testing.models.card-test/delete-card-tests! [test-id])
      (testing "the run stays, with no test id"
        (is (=? {:test_id nil :status :passed} (t2/select-one :model/DataTestRun :id run-id))))
      (testing "a run of a transform test with the same id keeps its test id"
        (is (= test-id (t2/select-one-fn :test_id :model/DataTestRun :id other-run))))
      (t2/delete! :model/DataTestRun :id run-id))))

(deftest deleting-a-card-deletes-its-tests-test
  (mt/with-temp [:model/Card     {card-id :id}  {}
                 :model/CardTest {test-id :id}  {:card_id card-id}
                 :model/CardTest {other-id :id} {:card_id card-id}]
    (let [run-ids   (mapv #(:id (data-testing.run-tracking/start-run! :card %)) [test-id other-id])
          published (atom [])]
      (try
        (doseq [run-id run-ids]
          (data-testing.run-tracking/finish-run! run-id :passed))
        (with-redefs [events/publish-event! (fn [topic event]
                                              (when (= :event/card-test-delete topic)
                                                (swap! published into (map (comp :id :previous-object) (:changes event)))))]
          (queries.card/delete-cards! [card-id]))
        (testing "the tests are gone"
          (is (false? (t2/exists? :model/CardTest :card_id card-id))))
        (testing "runs of deleted tests stay with no test id"
          (is (= [nil nil] (mapv #(t2/select-one-fn :test_id :model/DataTestRun :id %) run-ids))))
        (testing "each test published one delete event"
          (is (= [test-id other-id] (sort @published))))
        (finally
          (t2/delete! :model/DataTestRun :id [:in run-ids]))))))

;;; ------------------------------------------------ Permissions ------------------------------------------------

(defn- permissions-of-rasta!
  "What rasta may do with a test of a card in a collection where all users have `collection-perms` (`:none`, `:read` or
  `:write`), when all users may write native queries on the card's database iff `native?`."
  [collection-perms native?]
  (mt/with-non-admin-groups-no-root-collection-perms
    (perms.tu/with-no-data-perms-for-all-users!
      (mt/with-db-perms-for-group! (perms-group/all-users) (mt/id) {:perms/view-data      :unrestricted
                                                                    :perms/create-queries (if native?
                                                                                            :query-builder-and-native
                                                                                            :query-builder)}
        (mt/with-temp [:model/Collection {coll-id :id}   {}
                       :model/Card       {card-id :id}   {:collection_id coll-id
                                                          :dataset_query (lib/native-query (mt/metadata-provider) "SELECT 1")}
                       :model/CardTest   {test-id :id :as card-test} {:card_id card-id}]
          (case collection-perms
            :none  nil
            :read  (perms/grant-collection-read-permissions! (perms-group/all-users) coll-id)
            :write (perms/grant-collection-readwrite-permissions! (perms-group/all-users) coll-id))
          (mt/with-current-user (mt/user->id :rasta)
            {:read      (boolean (mi/can-read? (t2/hydrate card-test :can_read)))
             :read-pk   (boolean (mi/can-read? (t2/hydrate (t2/select-one :model/CardTest :id test-id) :can_read)))
             :run       (boolean (mi/can-query? (t2/hydrate card-test :can_query)))
             :create    (boolean (mi/can-create? :model/CardTest {:card_id card-id}))
             :update    (boolean (mi/can-update? (t2/hydrate card-test :can_write) {:name "renamed"}))
             :write     (boolean (mi/can-write? (t2/hydrate card-test :can_write)))
             :write-pk  (boolean (mi/can-write? (t2/hydrate (t2/select-one :model/CardTest :id test-id) :can_write)))}))))))

(defn- allowed
  [& ks]
  (merge {:read false :read-pk false :run false :create false :update false :write false :write-pk false}
         (zipmap ks (repeat true))))

(deftest card-test-permissions-test
  (testing "no collection access to the card: nothing"
    (is (= (allowed) (permissions-of-rasta! :none true))))
  (testing "collection read and native queries: read, run and create"
    (is (= (allowed :read :read-pk :run :create) (permissions-of-rasta! :read true))))
  (testing "collection read without native queries: read only"
    (is (= (allowed :read :read-pk) (permissions-of-rasta! :read false))))
  (testing "collection write and native queries: everything"
    (is (= (allowed :read :read-pk :run :create :update :write :write-pk) (permissions-of-rasta! :write true))))
  (testing "collection write without native queries: read, and edit what needs no native queries"
    (is (= (allowed :read :read-pk :update :write :write-pk) (permissions-of-rasta! :write false)))))

(deftest moving-a-card-test-needs-new-card-runnable-test
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp [:model/Collection {writable :id} {}
                   :model/Collection {readable :id} {}
                   :model/Collection {hidden :id}   {}
                   :model/Card       {hidden-id :id} {:collection_id hidden
                                                      :dataset_query (lib/native-query (mt/metadata-provider) "SELECT 1")}
                   :model/Card       {card-id :id}  {:collection_id writable
                                                     :dataset_query (lib/native-query (mt/metadata-provider) "SELECT 1")}
                   :model/Card       {other-id :id} {:collection_id readable
                                                     :dataset_query (lib/native-query (mt/metadata-provider) "SELECT 1")}
                   :model/CardTest   card-test      {:card_id card-id}]
      (perms/grant-collection-readwrite-permissions! (perms-group/all-users) writable)
      (perms/grant-collection-read-permissions! (perms-group/all-users) readable)
      (mt/with-current-user (mt/user->id :rasta)
        (is (true? (boolean (mi/can-update? (t2/hydrate card-test :can_write) {:name "renamed"}))))
        (is (true? (boolean (mi/can-update? (t2/hydrate card-test :can_write) {:card_id other-id}))))
        (is (false? (boolean (mi/can-update? (t2/hydrate card-test :can_write) {:card_id hidden-id}))))))))

(deftest permissions-take-the-database-of-the-card-query-test
  ;; Card hooks set `database_id` from the query on every insert and update, so only a direct row update makes the
  ;; column name another database.
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp [:model/Database   {other-db :id}  {:engine :h2 :details {}}
                   :model/Collection {coll-id :id}   {}
                   :model/Card       {card-id :id}   {:collection_id coll-id
                                                      :dataset_query (lib/native-query (mt/metadata-provider) "SELECT 1")}
                   :model/CardTest   card-test       {:card_id card-id}]
      (perms.tu/with-no-data-perms-for-all-users!
        (mt/with-db-perms-for-group! (perms-group/all-users) (mt/id) {:perms/view-data      :unrestricted
                                                                      :perms/create-queries :query-builder-and-native}
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) coll-id)
          (t2/query-one {:update (t2/table-name :model/Card) :set {:database_id other-db} :where [:= :id card-id]})
          (testing "premise: the card's database_id names a database other than its query's"
            (is (= other-db (t2/select-one-fn :database_id :model/Card :id card-id))))
          (testing "native queries on the query's database are enough to run and save the test"
            (mt/with-current-user (mt/user->id :rasta)
              (is (= {:run true :create true :update true :write true}
                     {:run    (boolean (mi/can-query? (t2/hydrate card-test :can_query)))
                      :create (boolean (mi/can-create? :model/CardTest {:card_id card-id}))
                      :update (boolean (mi/can-update? (t2/hydrate card-test :can_write) {:name "renamed"}))
                      :write  (boolean (mi/can-write? (t2/hydrate card-test :can_write)))})))))))))

(deftest permissions-of-a-test-of-a-card-with-no-query-test
  (mt/with-temp [:model/Card     {card-id :id} {:dataset_query {}}
                 :model/CardTest card-test     {:card_id card-id}]
    (testing "premise: the card has no query"
      (is (= {} (t2/select-one-fn :dataset_query :model/Card :id card-id))))
    (testing "an admin may save and run the test"
      (mt/with-current-user (mt/user->id :crowberto)
        (is (= {:run true :write true}
               {:run   (boolean (mi/can-query? (t2/hydrate card-test :can_query)))
                :write (boolean (mi/can-write? (t2/hydrate card-test :can_write)))}))))
    (testing "another user who reads and edits the card may too: running and editing need no native queries"
      (mt/with-current-user (mt/user->id :rasta)
        (is (= {:run true :write true}
               {:run   (boolean (mi/can-query? (t2/hydrate card-test :can_query)))
                :write (boolean (mi/can-write? (t2/hydrate card-test :can_write)))}))))))

(deftest create-card-tests-with-different-key-sets-test
  (mt/with-temp [:model/Card {card-id :id} {}]
    (mt/with-model-cleanup [:model/CardTest]
      (let [row                (fn [test-name] {:card_id card-id :name test-name :creator_id (mt/user->id :crowberto)
                                                :inputs (lib/normalize ::data-testing.schema/inputs inputs)
                                                :expectations (lib/normalize ::data-testing.schema/expectations expectations)})
            [plain described]  (data-testing.models.card-test/create-card-tests! [(row "Plain")
                                                                                  (assoc (row "Described") :description "About")])]
        (is (nil? (t2/select-one-fn :description :model/CardTest :id (:id plain))))
        (is (= "About" (t2/select-one-fn :description :model/CardTest :id (:id described))))))))

(defn- native-card
  "Attributes of a card in the collection `collection-id` whose query is native SQL on the Database `db-id`."
  [collection-id db-id]
  {:collection_id collection-id
   :dataset_query (lib/native-query (lib-be/application-database-metadata-provider db-id) "SELECT 1")})

(deftest can-write-statements-do-not-grow-with-tests-test
  (mt/with-non-admin-groups-no-root-collection-perms
    (perms.tu/with-no-data-perms-for-all-users!
      (mt/with-db-perms-for-group! (perms-group/all-users) (mt/id) {:perms/view-data      :unrestricted
                                                                    :perms/create-queries :query-builder-and-native}
        (mt/with-temp [:model/Collection {writable :id} {}
                       :model/Collection {readable :id} {}
                       :model/Card       {c1 :id}       (native-card writable (mt/id))
                       :model/Card       {c2 :id}       (native-card readable (mt/id))
                       :model/Card       {c3 :id}       (native-card writable (mt/id))
                       :model/Card       {c4 :id}       (native-card readable (mt/id))
                       :model/Card       {c5 :id}       (native-card writable (mt/id))
                       :model/Card       {c6 :id}       (native-card readable (mt/id))]
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) writable)
          (perms/grant-collection-read-permissions! (perms-group/all-users) readable)
          (mt/with-current-user (mt/user->id :rasta)
            (let [card-ids   [c1 c2 c3 c4 c5 c6]
                  tests      (mapv #(t2/instance :model/CardTest {:id %1 :card_id %2}) (range 6) card-ids)
                  hydrate    (fn [n]
                               (t2/with-call-count [call-count]
                                 (let [hydrated (doall (t2/hydrate (vec (take n tests)) :can_write))]
                                   {:statements (call-count)
                                    :values     (mapv :can_write hydrated)})))
                  own        (fn [n]
                               (t2/with-call-count [call-count]
                                 (doall (t2/hydrate (data-testing.db/cards-by-ids (vec (take n card-ids))) :can_write))
                                 (call-count)))
                  beyond-own (fn [n]
                               (own n)
                               (- (:statements (hydrate n)) (own n)))]
              (testing "the statements of the hydration on distinct cards, beyond loading the cards and their own checks"
                (beyond-own 1)
                (is (= (beyond-own 2) (beyond-own 6))))
              (is (= [true false true false true false] (:values (hydrate 6))))
              (testing "each test gets the answer the per-test check gave"
                (is (= (mapv #(boolean (some-> (data-testing.db/card (:card_id %)) (t2/hydrate :can_write) mi/can-write?)) tests)
                       (:values (hydrate 6))))))))))))

(deftest can-write-statements-do-not-grow-with-databases-test
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp [:model/Database   {d1 :id}       {:engine :h2 :details (:details (mt/db))}
                   :model/Database   {d2 :id}       {:engine :h2 :details (:details (mt/db))}
                   :model/Database   {d3 :id}       {:engine :h2 :details (:details (mt/db))}
                   :model/Database   {d4 :id}       {:engine :h2 :details (:details (mt/db))}
                   :model/Database   {d5 :id}       {:engine :h2 :details (:details (mt/db))}
                   :model/Database   {d6 :id}       {:engine :h2 :details (:details (mt/db))}
                   :model/Collection {writable :id} {}]
      (perms.tu/with-no-data-perms-for-all-users!
        (doseq [db-id [d1 d2 d3 d4 d5 d6]]
          (perms/set-database-permission! (perms-group/all-users) db-id :perms/view-data :unrestricted)
          (perms/set-database-permission! (perms-group/all-users) db-id :perms/create-queries :query-builder-and-native))
        (perms/set-database-permission! (perms-group/all-users) d6 :perms/create-queries :query-builder)
        (perms/grant-collection-readwrite-permissions! (perms-group/all-users) writable)
        (mt/with-temp [:model/Card {c1 :id} (native-card writable d1)
                       :model/Card {c2 :id} (native-card writable d2)
                       :model/Card {c3 :id} (native-card writable d3)
                       :model/Card {c4 :id} (native-card writable d4)
                       :model/Card {c5 :id} (native-card writable d5)
                       :model/Card {c6 :id} (native-card writable d6)]
          (mt/with-current-user (mt/user->id :rasta)
            (let [tests   (mapv #(t2/instance :model/CardTest {:id %1 :card_id %2}) (range 6) [c1 c2 c3 c4 c5 c6])
                  hydrate (fn [k n]
                            (t2/with-call-count [call-count]
                              (let [hydrated (doall (t2/hydrate (vec (take n tests)) k))]
                                {:statements (call-count)
                                 :values     (mapv k hydrated)})))]
              (testing "the statements of the hydration on cards of distinct Databases, beyond loading the cards and their own checks"
                (let [own        (fn [subject-ks n]
                                   (t2/with-call-count [call-count]
                                     (doall (apply t2/hydrate (data-testing.db/cards-by-ids (vec (take n [c1 c2 c3 c4 c5 c6]))) subject-ks))
                                     (call-count)))
                      beyond-own (fn [k subject-ks n]
                                   (own subject-ks n)
                                   (- (:statements (hydrate k n)) (own subject-ks n)))]
                  (doseq [[k subject-ks] [[:can_write [:can_write]] [:can_query [:can_query]]]]
                    (beyond-own k subject-ks 1)
                    (is (= (beyond-own k subject-ks 2) (beyond-own k subject-ks 6))))))
              (is (= [true true true true true true] (:values (hydrate :can_write 6))))
              (is (= [true true true true true false] (:values (hydrate :can_query 6))))
              (testing "each test gets the answer the per-test check gave"
                (is (= (mapv #(boolean (some-> (data-testing.db/card (:card_id %)) (t2/hydrate :can_write) mi/can-write?)) tests)
                       (:values (hydrate :can_write 6))))))))))))

(defn- card-test-answers
  "What the current user may do with `card-test`, a test of an MBQL card: create a test of its card, change its inputs,
  rename it, move it to the card `runnable-id` or the card `hidden-id`, and run it."
  [card-test runnable-id hidden-id]
  (let [writable (t2/hydrate card-test :can_write)]
    {:create          (boolean (mi/can-create? :model/CardTest {:card_id (:card_id card-test)}))
     :update-inputs   (boolean (mi/can-update? writable {:inputs (lib/normalize ::data-testing.schema/inputs inputs)}))
     :update-name     (boolean (mi/can-update? writable {:name "renamed"}))
     :move-runnable   (boolean (mi/can-update? writable {:card_id runnable-id}))
     :move-unrunnable (boolean (mi/can-update? writable {:card_id hidden-id}))
     :run             (boolean (mi/can-query? (t2/hydrate card-test :can_query)))}))

(deftest card-test-create-update-and-run-matrix-test
  (mt/with-non-admin-groups-no-root-collection-perms
    (perms.tu/with-no-data-perms-for-all-users!
      (let [mp    (mt/metadata-provider)
            query (lib/query mp (lib.metadata/table mp (mt/id :venues)))]
        (mt/with-temp [:model/Collection {coll-id :id}     {}
                       :model/Collection {hidden-coll :id} {}
                       :model/Card       {card-id :id}     {:collection_id coll-id :dataset_query query}
                       :model/Card       {other-id :id}    {:collection_id coll-id :dataset_query query}
                       :model/Card       {hidden-id :id}   {:collection_id hidden-coll :dataset_query query}
                       :model/CardTest   card-test         {:card_id card-id :inputs [] :expectations expectations}]
          (let [answers (fn [user collection-perms create-queries]
                          (mt/with-db-perms-for-group! (perms-group/all-users) (mt/id) {:perms/view-data      :unrestricted
                                                                                        :perms/create-queries create-queries}
                            (when collection-perms
                              (perms/grant-collection-readwrite-permissions! (perms-group/all-users) coll-id))
                            (try
                              (mt/with-current-user (mt/user->id user)
                                (card-test-answers card-test other-id hidden-id))
                              (finally
                                (perms/revoke-collection-permissions! (perms-group/all-users) coll-id)))))
                all     (fn [& ks] (merge (zipmap [:create :update-inputs :update-name :move-runnable :move-unrunnable :run]
                                                  (repeat false))
                                          (zipmap ks (repeat true))))]
            (testing "superuser"
              (is (= (all :create :update-inputs :update-name :move-runnable :move-unrunnable :run)
                     (answers :crowberto false :no))))
            (testing "native queries and permission to run the card"
              (is (= (all :create :update-inputs :update-name :move-runnable :run)
                     (answers :rasta true :query-builder-and-native))))
            (testing "permission to run the card without native queries"
              (is (= (all :update-name :move-runnable :run)
                     (answers :rasta true :query-builder))))
            (testing "native queries without permission to run the card"
              (is (= (all) (answers :rasta false :query-builder-and-native))))
            (testing "neither"
              (is (= (all) (answers :rasta false :no))))))))))
