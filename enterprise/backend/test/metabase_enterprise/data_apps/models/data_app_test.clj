(ns metabase-enterprise.data-apps.models.data-app-test
  "Unit coverage for the DataApp model: the write hooks' invariants, the blob-excluding reads, JSON that never
   leaks the bundle bytes, the `allowed_hosts` NULL→[] read coercion, and the superuser-only permission gating."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase-enterprise.data-apps.group-access :as group-access]
   [metabase-enterprise.data-apps.models.data-app :as data-app]
   [metabase-enterprise.data-apps.test-util :as data-apps.tu]
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
   [metabase.events.test-util :as events.tu]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private bundle-bytes
  "The bundle of the apps these tests create."
  (.getBytes "BUNDLEBYTES" "UTF-8"))

(deftest bundle-hash-follows-the-bundle-test
  (mt/with-temp [:model/DataApp {id :id} {:bundle bundle-bytes}]
    (let [hash #(t2/select-one-fn :bundle_hash :model/DataApp :id id)
          v1   (hash)]
      (is (= 64 (count v1)) "the insert computes the hash from the bundle")
      (t2/update! :model/DataApp :id id {:name "Renamed"})
      (is (= v1 (hash)) "a change that leaves the bundle alone keeps its hash")
      (t2/update! :model/DataApp :id id {:name "Renamed"})
      (is (= v1 (hash)) "an update that changes nothing is a no-op")
      (t2/update! :model/DataApp :id id {:bundle (.getBytes "OTHER" "UTF-8")})
      (is (not= v1 (hash)))
      (t2/update! :model/DataApp :id id {:bundle nil})
      (is (nil? (hash)))
      (testing "the hash is never written directly"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"bundle hash is computed from its bundle"
                              (t2/update! :model/DataApp :id id {:bundle_hash "stale"})))))))

(deftest create-makes-resource-collection-test
  (testing "an app created without a collection gets a top-level collection of data apps of its own"
    (let [{:keys [id resource_collection_id]} (first (data-app/create-data-apps!
                                                      [{:slug "m" :name "m" :bundle_path "index.js"}]))]
      (try
        (is (=? {:name "Data App: m" :namespace :data-apps :location "/"}
                (t2/select-one :model/Collection :id resource_collection_id)))
        (testing "which no group but Administrators reads"
          (is (= #{} (perms/collection-read-access-group-ids resource_collection_id))))
        (finally
          (data-app/delete-data-apps! [id]))))))

(deftest the-resource-collection-cannot-change-test
  (mt/with-temp [:model/Collection {other-id :id} {:name "Other" :namespace :data-apps}
                 :model/Collection {own-id :id} {:namespace :data-apps}
                 :model/DataApp    {id :id collection-id :resource_collection_id} {:resource_collection_id own-id}]
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"resource collection cannot be changed"
                          (t2/update! :model/DataApp :id id {:resource_collection_id other-id})))
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"resource collection cannot be changed"
                          (t2/update! :model/DataApp :id id {:resource_collection_id nil})))
    (is (= collection-id (t2/select-one-fn :resource_collection_id :model/DataApp :id id)))
    (testing "an update that names the same collection is not a change"
      (t2/update! :model/DataApp :id id {:resource_collection_id collection-id :name "Renamed"})
      (is (= "Renamed" (t2/select-one-fn :name :model/DataApp :id id))))))

(deftest app-without-collection-can-be-given-one-test
  (mt/with-temp [:model/Collection {own-id :id} {:namespace :data-apps}
                 :model/Collection {second-id :id} {:namespace :data-apps}
                 :model/DataApp    {id :id collection-id :resource_collection_id} {:resource_collection_id own-id}
                 :model/DataApp    {taken-id :resource_collection_id} {:resource_collection_id second-id}
                 :model/Collection {other-id :id} {:namespace :data-apps}]
    (collection/delete-collections! [collection-id])
    (is (nil? (t2/select-one-fn :resource_collection_id :model/DataApp :id id)))
    (testing "another app's collection is refused"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"already belongs to another data app"
                            (data-app/update-data-apps! [{:id id :resource_collection_id taken-id}]))))
    (data-app/update-data-apps! [{:id id :resource_collection_id other-id}])
    (is (= other-id (t2/select-one-fn :resource_collection_id :model/DataApp :id id)))))

(deftest delete-removes-collection-its-contents-and-grants-but-keeps-groups-test
  (mt/with-premium-features #{:data-apps}
    (data-apps.tu/with-published-tables! [(mt/id :venues)]
      (mt/with-temp [:model/Collection       {coll-id :id}  {:namespace :data-apps}
                     :model/DataApp          app            {:resource_collection_id coll-id}
                     :model/PermissionsGroup {group-id :id} {}
                     :model/Card             {card-id :id}  {:collection_id coll-id
                                                             :dataset_query (data-apps.tu/venues-query)}]
        (group-access/add-groups! app [group-id])
        (data-app/delete-data-apps! [(:id app)])
        (is (not (t2/exists? :model/DataApp :id (:id app))))
        (is (not (t2/exists? :model/Collection :id coll-id)))
        (is (not (t2/exists? :model/Card :id card-id)))
        (is (not (t2/exists? :model/Permissions :group_id group-id :object (perms/collection-read-path coll-id))))
        (is (t2/exists? :model/PermissionsGroup :id group-id))))))

(deftest writes-store-values-as-given-test
  (mt/with-temp [:model/DataApp {id :id} {:name          "M"
                                          :bundle_path   "dist/index.js"
                                          :allowed_hosts ["https://api.example.com"]}]
    (is (=? {:name "M" :bundle_path "dist/index.js" :version 1 :allowed_hosts ["https://api.example.com"]}
            (t2/select-one :model/DataApp :id id)))
    (testing "an update stores a value as it is, an empty description included"
      (t2/update! :model/DataApp :id id {:bundle_path "other.js" :description ""})
      (is (=? {:bundle_path "other.js" :description ""}
              (t2/select-one :model/DataApp :id id))))))

(deftest to-json-never-includes-the-bundle-bytes-test
  (mt/with-temp [:model/DataApp {id :id} {:name "M" :bundle bundle-bytes}]
    (let [app     (t2/select-one [:model/DataApp :bundle :name] :id id)
          decoded (json/decode (json/encode app))]
      (is (contains? app :bundle) "the instance selected with its bundle carries the raw bytes")
      (is (not (contains? decoded "bundle"))
          "but the JSON representation omits it")
      (is (= "M" (get decoded "name"))))))

(deftest default-selects-exclude-the-bundle-test
  (mt/with-temp [:model/DataApp {id :id app-name :slug} {:name          "M"
                                                         :bundle        bundle-bytes
                                                         :allowed_hosts ["https://api.example.com"]}]
    (is (not (contains? (t2/select-one :model/DataApp :id id) :bundle)))
    (is (= "BUNDLEBYTES" (String. ^bytes (data-apps.db/data-app-bundle id) "UTF-8")))
    (testing "data-app-by-slug returns metadata without the bundle blob"
      (let [app (data-apps.db/data-app-by-slug app-name)]
        (is (not (contains? app :bundle)))
        (is (= "M" (:name app)))
        (is (= ["https://api.example.com"] (:allowed_hosts app)))))))

(deftest allowed-hosts-reads-as-a-vector-never-nil-test
  (mt/with-temp [:model/DataApp {without-id :id} {}
                 :model/DataApp {with-id :id}    {:allowed_hosts ["https://a.com" "https://b.com"]}]
    (testing "a row stored with NULL allowed_hosts reads back as []"
      (is (= [] (:allowed_hosts (t2/select-one :model/DataApp :id without-id)))))
    (testing "a stored list round-trips through the JSON transform"
      (is (= ["https://a.com" "https://b.com"]
             (:allowed_hosts (t2/select-one :model/DataApp :id with-id)))))))

(deftest permissions-test
  (mt/with-temp [:model/DataApp {id :id} {}]
    (testing "superuser can read and write"
      (mt/with-premium-features #{:data-apps}
        (binding [api/*is-superuser?* true]
          (is (mi/can-read? (t2/hydrate (t2/select-one :model/DataApp :id id) :can_read)))
          (is (mi/can-write? (t2/hydrate (t2/select-one :model/DataApp :id id) :can_write))))))
    (testing "without data apps feature, superuser cannot read"
      (mt/with-premium-features #{}
        (binding [api/*is-superuser?* true]
          (is (not (mi/can-read? (t2/hydrate (t2/select-one :model/DataApp :id id) :can_read)))))))
    (testing "user without access to app's collection cannot read or write"
      (binding [api/*is-superuser?* false]
        (is (not (mi/can-read? (t2/hydrate (t2/select-one :model/DataApp :id id) :can_read))))
        (is (not (mi/can-write? (t2/hydrate (t2/select-one :model/DataApp :id id) :can_write))))))))

(deftest can-write-false-on-read-only-remote-sync-instance-test
  (mt/with-temp [:model/DataApp {id :id} {}]
    (let [can-write? (fn [superuser?]
                       (binding [api/*is-superuser?* superuser?]
                         (:can_write (t2/hydrate (t2/select-one :model/DataApp :id id) :can_write))))]
      (mt/with-premium-features #{:data-apps :remote-sync}
        (testing "superuser writes on instance that is not read-only"
          (is (true? (can-write? true))))
        (mt/with-temporary-setting-values [remote-sync-url  "https://github.com/test/repo.git"
                                           remote-sync-type :read-only]
          (testing "superuser does not write on read-only instance"
            (is (false? (can-write? true))))
          (testing "non-superuser does not write on read-only instance"
            (is (false? (can-write? false)))))))))

(deftest can-update-allows-only-enabling-and-disabling-by-superuser-test
  (mt/with-temp [:model/DataApp {id :id} {}]
    (let [can-update? (fn [superuser? changes]
                        (binding [api/*is-superuser?* superuser?]
                          (mi/can-update? (t2/hydrate (t2/select-one :model/DataApp :id id) :can_write) changes)))]
      (testing "superuser may change enabled and nothing else"
        (is (true? (can-update? true {:enabled false})))
        (is (true? (can-update? true {:enabled true})))
        (doseq [changes [{:name "Renamed"}
                         {:enabled false :name "Renamed"}
                         {:bundle_path "other.js"}
                         {:bundle (.getBytes "OTHER" "UTF-8")}
                         {:allowed_hosts []}
                         {:resource_collection_id 1}]]
          (testing (pr-str (keys changes))
            (is (false? (can-update? true changes))))))
      (testing "non-superuser may change nothing"
        (doseq [changes [{:enabled false} {:enabled true} {:name "Renamed"}]]
          (testing (pr-str changes)
            (is (false? (can-update? false changes))))))
      (testing "superuser may still enable and disable on read-only remote-sync instance"
        (mt/with-premium-features #{:data-apps :remote-sync}
          (mt/with-temporary-setting-values [remote-sync-url  "https://github.com/test/repo.git"
                                             remote-sync-type :read-only]
            (is (true? (can-update? true {:enabled false})))
            (is (false? (can-update? true {:name "Renamed"})))
            (is (false? (can-update? false {:enabled false})))))))))

(deftest two-data-apps-cannot-share-collection-test
  (testing "the database refuses a second app on a collection another app already owns"
    (mt/with-model-cleanup [:model/DataApp]
      (mt/with-temp [:model/Collection {own-id :id} {:namespace :data-apps}
                     :model/DataApp {collection-id :resource_collection_id} {:resource_collection_id own-id}]
        (let [insert! (fn [slug collection-id]
                        (t2/query-one {:insert-into (t2/table-name :model/DataApp)
                                       :values      [{:slug                   slug
                                                      :name                   slug
                                                      :bundle_path            "index.js"
                                                      :entity_id              (subs (str slug "-" (apply str (repeat 21 "a"))) 0 21)
                                                      :resource_collection_id collection-id
                                                      :created_at             :%now
                                                      :updated_at             :%now}]}))]
          (mt/with-temp [:model/Collection {free-id :id} {:namespace :data-apps}]
            (testing "the same row on a collection no app owns goes in"
              (insert! "sparrows" free-id)
              (is (t2/exists? :model/DataApp :slug "sparrows")))
            (is (thrown? Exception (t2/with-transaction [_conn]
                                     (insert! "finches" collection-id))))
            (is (not (t2/exists? :model/DataApp :slug "finches")))))))))

(deftest data-apps-collection-is-root-collection-of-its-namespace-test
  (testing "an app given an existing collection gets it only when it is a plain top-level collection of data apps that
            no other app has"
    (mt/with-premium-features #{:data-apps}
      (mt/with-model-cleanup [:model/DataApp]
        (mt/with-temp [:model/Collection {default-id :id}  {:name "Finance"}
                       :model/Collection {root-id :id}     {:name "Root" :namespace :data-apps}
                       :model/Collection {archived-id :id} {:name "Archived" :namespace :data-apps :archived true}
                       :model/Collection {official-id :id} {:name "Official" :namespace :data-apps :authority_level "official"}
                       :model/Collection {synced-id :id}   {:name "Synced" :namespace :data-apps :is_remote_synced true}]
          (let [app! (fn [slug collection-id]
                       (:id (first (data-app/create-data-apps! [{:slug                   slug
                                                                 :name                   slug
                                                                 :bundle_path            "index.js"
                                                                 :resource_collection_id collection-id}]))))]
            (doseq [[label collection-id] [["a default-namespace collection" default-id]
                                           ["an archived collection" archived-id]
                                           ["an official collection" official-id]]]
              (testing label
                (is (= 400 (:status-code (ex-data (try (app! "refused" collection-id) (catch clojure.lang.ExceptionInfo e e))))))
                (is (not (t2/exists? :model/DataApp :slug "refused")))))
            (testing "a remote-synced one is fine, as remote sync marks an app's collection"
              (is (pos-int? (app! "synced" synced-id))))
            (testing "a top-level collection of data apps is fine"
              (is (pos-int? (app! "accepted" root-id)))
              (testing "but not for a second app"
                (is (thrown-with-msg? clojure.lang.ExceptionInfo #"already belongs to another data app"
                                      (app! "second" root-id)))))))))))

(deftest refused-resource-collection-leaves-no-row-in-outer-transaction-test
  (testing "a refusal inside a caller's transaction rolls back to the function's own savepoint, so the caller can go on"
    (mt/with-premium-features #{:data-apps}
      (mt/with-model-cleanup [:model/DataApp]
        (mt/with-temp [:model/Collection {archived-id :id} {:name "Archived" :namespace :data-apps :archived true}
                       :model/Collection {root-id :id}     {:name "Root" :namespace :data-apps}]
          (let [app-rows (fn [slug collection-id]
                           [{:slug slug :name slug :bundle_path "index.js" :resource_collection_id collection-id}])]
            (t2/with-transaction [_conn]
              (is (= 400 (:status-code (ex-data (try (data-app/create-data-apps! (app-rows "refused-in-outer" archived-id))
                                                     (catch clojure.lang.ExceptionInfo e e))))))
              (data-app/create-data-apps! (app-rows "accepted-in-outer" root-id)))
            (is (not (t2/exists? :model/DataApp :slug "refused-in-outer")))
            (is (t2/exists? :model/DataApp :slug "accepted-in-outer"))))))))

(deftest write-function-statement-counts-do-not-grow-with-rows-test
  (let [created     (atom [])
        app-rows    (fn [n]
                      (vec (repeatedly n #(let [slug (u/lower-case-en (mt/random-name))]
                                            {:slug slug :name slug :bundle_path "index.js"}))))
        collections (fn [n]
                      (mapv :id (collection/create-collections! (vec (repeatedly n #(hash-map :name (mt/random-name) :namespace "data-apps"))))))
        create!     (fn [n]
                      (let [rows (mapv #(assoc %1 :resource_collection_id %2) (app-rows n) (collections n))]
                        (events.tu/statement-count! (fn [] (swap! created into (map :id (data-app/create-data-apps! rows)))))))]
    (try
      (testing "creating data apps with collections"
        (create! 1)
        (is (= (create! 2) (create! 6))))
      (testing "updating data apps"
        (let [[warm-up & ids] @created
              update!         (fn [ids]
                                (events.tu/statement-count!
                                 (fn [] (data-app/update-data-apps! (mapv (fn [id] {:id id :description "same"}) (vec ids))))))]
          (update! [warm-up])
          (testing "the same number of statements for any number of data apps"
            (is (= (update! (take 2 ids)) (update! (take 6 (drop 2 ids))))))))
      (testing "deleting data apps that have no collection"
        (let [rows    (fn [n] (mapv #(assoc % :entity_id (u/generate-nano-id)) (app-rows n)))
              insert! (fn [n] (mapv :id (t2/insert-returning-instances! :model/DataApp (rows n))))
              delete! (fn [ids] (events.tu/statement-count! (fn [] (data-app/delete-data-apps! ids))))]
          (delete! (insert! 1))
          (is (= (delete! (insert! 2)) (delete! (insert! 6))))))
      (finally
        (data-app/delete-data-apps! @created)))))

(deftest create-data-apps-with-different-key-sets-test
  (mt/with-model-cleanup [:model/DataApp :model/Collection]
    (let [[plain described] (data-app/create-data-apps! [{:slug "plain-app" :name "Plain" :bundle_path "index.js"}
                                                         {:slug "described-app" :name "Described" :bundle_path "index.js"
                                                          :description "About" :enabled true}])
          [alone]           (data-app/create-data-apps! [{:slug "alone-app" :name "Alone" :bundle_path "index.js"}])]
      (is (= (:enabled alone) (t2/select-one-fn :enabled :model/DataApp :id (:id plain))))
      (is (= 1 (t2/select-one-fn :version :model/DataApp :id (:id plain))))
      (is (=? {:description "About" :enabled true} (t2/select-one :model/DataApp :id (:id described)))))))
