(ns metabase-enterprise.data-apps.models.data-app-test
  "Unit coverage for the DataApp model: the write hooks' invariants, the blob-excluding reads, JSON that never
   leaks the bundle bytes, the `allowed_hosts` NULL→[] read coercion, and the superuser-only permission gating."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase-enterprise.data-apps.models.data-app]
   [metabase.api.common :as api]
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

(deftest insert-creates-the-permission-group-the-app-owns-test
  (testing "the resource collection comes from the repository with the app, or is created for an app made through
            the API, so an inserted row gets its group alone"
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (let [{:keys [resource_collection_id permission_group_id]} (t2/select-one :model/DataApp (insert-app!))]
        (is (nil? resource_collection_id))
        (is (t2/exists? :model/PermissionsGroup :id permission_group_id :is_data_app_group true))))))

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
  (testing "any signed-in user can read (view), but write/create stay superuser-only"
    (binding [api/*is-superuser?* false]
      (is (mi/can-read? :model/DataApp 1))
      (is (not (mi/can-write? :model/DataApp 1)))
      (is (not (mi/can-create? :model/DataApp {}))))))
