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

(def ^:private bundle-bytes
  "The bundle of the apps these tests create."
  (.getBytes "BUNDLEBYTES" "UTF-8"))

(deftest bundle-hash-follows-the-bundle-test
  (mt/with-temp [:model/DataApp {id :id} {:bundle bundle-bytes}]
    (let [hash #(t2/select-one-fn :bundle_hash :model/DataApp id)
          v1   (hash)]
      (is (= 64 (count v1)) "the insert computes the hash from the bundle")
      (t2/update! :model/DataApp id {:display_name "Renamed"})
      (is (= v1 (hash)) "a change that leaves the bundle alone keeps its hash")
      (t2/update! :model/DataApp id {:display_name "Renamed"})
      (is (= v1 (hash)) "an update that changes nothing is a no-op")
      (t2/update! :model/DataApp id {:bundle (.getBytes "OTHER" "UTF-8")})
      (is (not= v1 (hash)))
      (t2/update! :model/DataApp id {:bundle nil})
      (is (nil? (hash)))
      (testing "the hash is never written directly"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"bundle hash is computed from its bundle"
                              (t2/update! :model/DataApp id {:bundle_hash "stale"})))))))

(deftest insert-requires-a-resource-collection-test
  (testing "the API creates an app's collection, so an insert without one is refused"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"needs a collection of its own"
                          (mt/with-temp [:model/DataApp _ {:name "m" :resource_collection_id nil}])))
    (is (not (t2/exists? :model/DataApp :name "m")))))

(deftest the-resource-collection-cannot-change-test
  (mt/with-temp [:model/Collection {other-id :id} {:name "Other" :namespace :data-apps}
                 :model/DataApp    {id :id collection-id :resource_collection_id} {}]
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"resource collection cannot be changed"
                          (t2/update! :model/DataApp id {:resource_collection_id other-id})))
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"resource collection cannot be changed"
                          (t2/update! :model/DataApp id {:resource_collection_id nil})))
    (is (= collection-id (t2/select-one-fn :resource_collection_id :model/DataApp id)))
    (testing "an update that names the same collection is not a change"
      (t2/update! :model/DataApp id {:resource_collection_id collection-id :display_name "Renamed"})
      (is (= "Renamed" (t2/select-one-fn :display_name :model/DataApp id))))))

(deftest delete-removes-the-resource-collection-the-app-owns-test
  (mt/with-temp [:model/DataApp {id :id collection-id :resource_collection_id} {}]
    (t2/delete! :model/DataApp id)
    (is (not (t2/exists? :model/Collection :id collection-id)))))

(deftest writes-are-normalized-and-validated-against-the-schema-test
  (mt/with-temp [:model/DataApp {id :id} {:display_name  "  M  "
                                          :bundle_path   "./dist/index.js"
                                          :allowed_hosts ["https://API.example.com/"]}]
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
                          (mt/with-temp [:model/DataApp _ {:name "Not A Slug"}])))))

(deftest to-json-never-includes-the-bundle-bytes-test
  (mt/with-temp [:model/DataApp {id :id} {:display_name "M" :bundle bundle-bytes}]
    (let [app     (t2/select-one [:model/DataApp :bundle :display_name] id)
          decoded (json/decode (json/encode app))]
      (is (contains? app :bundle) "the instance selected with its bundle carries the raw bytes")
      (is (not (contains? decoded "bundle"))
          "but the JSON representation omits it")
      (is (= "M" (get decoded "display_name"))))))

(deftest default-selects-exclude-the-bundle-test
  (mt/with-temp [:model/DataApp {id :id app-name :name} {:display_name  "M"
                                                         :bundle        bundle-bytes
                                                         :allowed_hosts ["https://api.example.com"]}]
    (is (not (contains? (t2/select-one :model/DataApp id) :bundle)))
    (is (= "BUNDLEBYTES" (String. ^bytes (data-apps.db/data-app-bundle id) "UTF-8")))
    (testing "data-app-by-slug returns metadata without the bundle blob"
      (let [app (data-apps.db/data-app-by-slug app-name)]
        (is (not (contains? app :bundle)))
        (is (= "M" (:display_name app)))
        (is (= ["https://api.example.com"] (:allowed_hosts app)))))))

(deftest allowed-hosts-reads-as-a-vector-never-nil-test
  (mt/with-temp [:model/DataApp {without-id :id} {}
                 :model/DataApp {with-id :id}    {:allowed_hosts ["https://a.com" "https://b.com"]}]
    (testing "a row stored with NULL allowed_hosts reads back as []"
      (is (= [] (:allowed_hosts (t2/select-one :model/DataApp without-id)))))
    (testing "a stored list round-trips through the JSON transform"
      (is (= ["https://a.com" "https://b.com"]
             (:allowed_hosts (t2/select-one :model/DataApp with-id)))))))

(deftest permissions-test
  (mt/with-temp [:model/DataApp {id :id} {}]
    (testing "a superuser can read, write, and create"
      (mt/with-premium-features #{:data-apps}
        (binding [api/*is-superuser?* true]
          (is (mi/can-read? :model/DataApp id))
          (is (mi/can-write? :model/DataApp id))
          (is (mi/can-create? :model/DataApp {})))))
    (testing "without the data apps feature, a superuser cannot read"
      (mt/with-premium-features #{}
        (binding [api/*is-superuser?* true]
          (is (not (mi/can-read? :model/DataApp id))))))
    (testing "a user without access to the app's collection cannot read, write, or create"
      (binding [api/*is-superuser?* false]
        (is (not (mi/can-read? :model/DataApp id)))
        (is (not (mi/can-write? :model/DataApp id)))
        (is (not (mi/can-create? :model/DataApp {})))))))
