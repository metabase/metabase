(ns metabase-enterprise.data-apps.models.data-app-test
  "Unit coverage for the DataApp model: the write hooks' invariants, the blob-excluding reads, JSON that never
   leaks the bundle bytes, the `allowed_hosts` NULL→[] read coercion, and the superuser-only permission gating."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase-enterprise.data-apps.models.data-app]
   [metabase.api.common :as api]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- insert-app! [& {:as extra}]
  (t2/insert-returning-pk!
   :model/DataApp
   (merge {:name         "m"
           :display_name "M"
           :bundle_path  "index.js"
           :bundle       (.getBytes "BUNDLEBYTES" "UTF-8")}
          extra)))

(deftest bundle-hash-follows-the-bundle-test
  (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
    (let [id   (insert-app! :bundle_hash "stale")
          hash #(t2/select-one-fn :bundle_hash :model/DataApp id)
          v1   (hash)]
      (is (= 64 (count v1)) "the hash is computed from the bundle, not taken from the row")
      (t2/update! :model/DataApp id {:display_name "Renamed"})
      (is (= v1 (hash)) "a change that leaves the bundle alone keeps its hash")
      (t2/update! :model/DataApp id {:display_name "Renamed"})
      (is (= v1 (hash)) "an update that changes nothing is a no-op")
      (t2/update! :model/DataApp id {:bundle (.getBytes "OTHER" "UTF-8")})
      (is (not= v1 (hash)))
      (t2/update! :model/DataApp id {:bundle nil})
      (is (nil? (hash))))))

(deftest insert-creates-the-resources-the-app-owns-test
  (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
    (let [{:keys [id resource_collection_id]} (t2/select-one :model/DataApp (insert-app!))]
      (is (=? {:name "Data App: m" :namespace :data-apps :location "/"}
              (t2/select-one :model/Collection :id resource_collection_id))
          "the collection is the app's own, in the data-apps namespace")
      (is (not (t2/exists? :model/DataAppGroupAssignment :data_app_id id))))))

(deftest insert-publishes-the-creation-of-the-collection-test
  (testing "the collection is created the way any collection is, so what listens to collection events (remote sync,
            the activity log) sees it"
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (let [created (atom [])]
        (mt/with-dynamic-fn-redefs [events/publish-event! (fn [topic {:keys [object]}]
                                                            (when (= :event/collection-create topic)
                                                              (swap! created conj (:id object))))]
          (let [id (insert-app!)]
            (is (= [(t2/select-one-fn :resource_collection_id :model/DataApp id)] @created))))))))

(deftest insert-keeps-the-collection-it-is-given-test
  (testing "an import names the collection its manifest references, so the insert links that one rather than creating"
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (mt/with-temp [:model/Collection {collection-id :id} {:name "Data App: m" :namespace :data-apps}]
        (let [before (t2/count :model/Collection)
              app    (t2/select-one :model/DataApp (insert-app! :resource_collection_id collection-id))]
          (is (= collection-id (:resource_collection_id app)))
          (is (= before (t2/count :model/Collection)) "no second collection is created"))))))

(deftest the-resource-collection-cannot-change-test
  (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
    (mt/with-temp [:model/Collection {other-id :id} {:name "Other" :namespace :data-apps}]
      (let [id            (insert-app!)
            collection-id (t2/select-one-fn :resource_collection_id :model/DataApp id)]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"resource collection cannot be changed"
                              (t2/update! :model/DataApp id {:resource_collection_id other-id})))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"resource collection cannot be changed"
                              (t2/update! :model/DataApp id {:resource_collection_id nil})))
        (is (= collection-id (t2/select-one-fn :resource_collection_id :model/DataApp id)))
        (testing "an update that names the same collection is not a change"
          (t2/update! :model/DataApp id {:resource_collection_id collection-id :display_name "Renamed"})
          (is (= "Renamed" (t2/select-one-fn :display_name :model/DataApp id))))
        (testing "an app whose collection was deleted out from under it may be given one again"
          (t2/delete! :model/Collection :id collection-id)
          (is (nil? (t2/select-one-fn :resource_collection_id :model/DataApp id)) "the reference was cleared")
          (t2/update! :model/DataApp id {:resource_collection_id other-id})
          (is (= other-id (t2/select-one-fn :resource_collection_id :model/DataApp id))))))))

(deftest delete-removes-the-resource-collection-the-app-owns-test
  (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
    (let [id (insert-app!)
          {:keys [resource_collection_id]} (t2/select-one :model/DataApp id)]
      (t2/delete! :model/DataApp id)
      (is (not (t2/exists? :model/Collection :id resource_collection_id))))))

(deftest writes-are-normalized-and-validated-against-the-schema-test
  (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
    (let [id (insert-app! :display_name "  M  " :bundle_path "./dist/index.js"
                          :allowed_hosts ["https://API.example.com/"])]
      (is (=? {:display_name "M" :bundle_path "dist/index.js" :version 1 :allowed_hosts ["https://api.example.com"]}
              (t2/select-one :model/DataApp id)))
      (testing "an update with an invalid column is refused"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"does not match schema"
                              (t2/update! :model/DataApp id {:bundle_path "../escape.js"})))
        (is (= "dist/index.js" (t2/select-one-fn :bundle_path :model/DataApp id)))))
    (testing "an insert without a required manifest column is refused"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"does not match schema"
                            (t2/insert! :model/DataApp {:name "x" :bundle_path "i.js"}))))
    (testing "an insert with an invalid slug is refused"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"does not match schema"
                            (insert-app! :name "Not A Slug"))))))

(deftest to-json-never-includes-the-bundle-bytes-test
  (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
    (insert-app!)
    (let [app     (t2/select-one [:model/DataApp :bundle :display_name] :name "m")
          decoded (json/decode (json/encode app))]
      (is (contains? app :bundle) "the instance selected with its bundle carries the raw bytes")
      (is (not (contains? decoded "bundle"))
          "but the JSON representation omits it")
      (is (= "M" (get decoded "display_name"))))))

(deftest default-selects-exclude-the-bundle-test
  (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
    (insert-app! :allowed_hosts ["https://api.example.com"])
    (is (not (contains? (t2/select-one :model/DataApp :name "m") :bundle)))
    (is (= "BUNDLEBYTES" (String. ^bytes (data-apps.db/data-app-bundle (t2/select-one-pk :model/DataApp :name "m"))
                                  "UTF-8")))
    (testing "data-app-by-slug returns metadata without the bundle blob"
      (let [app (data-apps.db/data-app-by-slug "m")]
        (is (not (contains? app :bundle)))
        (is (= "M" (:display_name app)))
        (is (= ["https://api.example.com"] (:allowed_hosts app)))))))

(deftest allowed-hosts-reads-as-a-vector-never-nil-test
  (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
    (testing "a row stored with NULL allowed_hosts reads back as []"
      (insert-app!)
      (is (= [] (:allowed_hosts (t2/select-one :model/DataApp :name "m")))))
    (testing "a stored list round-trips through the JSON transform"
      (insert-app! :name "n" :allowed_hosts ["https://a.com" "https://b.com"])
      (is (= ["https://a.com" "https://b.com"]
             (:allowed_hosts (t2/select-one :model/DataApp :name "n")))))))

(deftest permissions-test
  (testing "a superuser can read, write, and create"
    (binding [api/*is-superuser?* true]
      (is (mi/can-read? :model/DataApp 1))
      (is (mi/can-write? :model/DataApp 1))
      (is (mi/can-create? :model/DataApp {}))))
  (testing "an unassigned user cannot read, write, or create"
    (binding [api/*is-superuser?* false]
      (is (not (mi/can-read? :model/DataApp 1)))
      (is (not (mi/can-write? :model/DataApp 1)))
      (is (not (mi/can-create? :model/DataApp {}))))))
