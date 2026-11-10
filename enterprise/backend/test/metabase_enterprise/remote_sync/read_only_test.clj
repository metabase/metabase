(ns metabase-enterprise.remote-sync.read-only-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.test-util :as remote-sync.tu]
   [metabase.collections.test-utils :as collections.tu]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.interface :as mi]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(def ^:private url "file:///tmp/remote-sync-read-only-test")

(deftest read-only-test
  (mt/with-premium-features #{:remote-sync}
    (testing "remote sync is off without a repository"
      (mt/with-temporary-setting-values [remote-sync-url nil]
        (is (false? (remote-sync/read-only?)))))
    (testing "read-only instance syncs from the remote"
      (remote-sync.tu/with-remote-sync [url :read-only]
        (is (true? (remote-sync/read-only?)))))
    (testing "read-write instance pushes to the remote"
      (remote-sync.tu/with-remote-sync [url :read-write]
        (is (false? (remote-sync/read-only?)))))))

(deftest can-write-test
  (mt/with-temp [:model/Collection synced   {:name "Synced" :is_remote_synced true :location "/"}
                 :model/Collection unsynced {:name "Unsynced" :location "/"}
                 :model/Card       card     {:name "Synced card" :collection_id (:id synced)}
                 :model/Card       other    {:name "Unsynced card" :collection_id (:id unsynced)}]
    (let [writable-ids #(t2/select-pks-set :model/Card {:where [:and
                                                                [:in :id [(:id card) (:id other)]]
                                                                (remote-sync/can-write-filter-clause :model/Card :report_card)]})]
      (testing "on read-only instance, synced rows can't be written"
        (remote-sync.tu/with-remote-sync [url :read-only]
          (is (false? (remote-sync/can-write? :model/Card (:id card))))
          (is (true? (remote-sync/can-write? :model/Card (:id other))))
          (is (= #{(:id other)} (writable-ids)))))
      (testing "on read-write instance, every row can be written"
        (remote-sync.tu/with-remote-sync [url :read-write]
          (is (true? (remote-sync/can-write? :model/Card (:id card))))
          (is (= #{(:id card) (:id other)} (writable-ids))))))))

(deftest synced-changes-test
  (mt/with-temp [:model/Card card {:name "Card"}]
    (testing "changes to exported columns are synced changes"
      (is (true? (remote-sync/synced-changes? :model/Card card {:name "Renamed"}))))
    (testing "changes that keep exported columns as they are, or change other columns, are not"
      (is (false? (remote-sync/synced-changes? :model/Card card {:name "Card"})))
      (is (false? (remote-sync/synced-changes? :model/Card card {:view_count 10}))))))

(deftest transform-tag-create-test
  (testing "transform tags can't be created on read-only instance"
    (remote-sync.tu/with-remote-sync [url :read-only]
      (mt/with-test-user :crowberto
        (is (false? (mi/can-create? :model/TransformTag {:name "New tag"})))))
    (remote-sync.tu/with-remote-sync [url :read-write]
      (mt/with-test-user :crowberto
        (is (true? (mi/can-create? :model/TransformTag {:name "New tag"})))))))

(deftest api-test
  (mt/with-temp [:model/Collection synced   {:name "Synced" :is_remote_synced true :location "/"}
                 :model/Collection unsynced {:name "Unsynced" :location "/"}
                 :model/Card       card     {:name "Synced card" :collection_id (:id synced)}
                 :model/Card       other    {:name "Unsynced card" :collection_id (:id unsynced)}]
    (remote-sync.tu/with-remote-sync [url :read-only]
      (testing "synced content can't be changed or deleted through the API"
        (mt/user-http-request :crowberto :put 403 (str "card/" (:id card)) {:name "Renamed"})
        (mt/user-http-request :crowberto :delete 403 (str "card/" (:id card)))
        (mt/user-http-request :crowberto :post 403 "card"
                              {:name                   "New card"
                               :display                "table"
                               :visualization_settings {}
                               :collection_id          (:id synced)
                               :dataset_query          (let [mp (mt/metadata-provider)]
                                                         (lib/query mp (lib.metadata/table mp (mt/id :venues))))})
        (is (= "Synced card" (t2/select-one-fn :name :model/Card :id (:id card)))))
      (testing "unsynced content can be changed"
        (mt/user-http-request :crowberto :put 200 (str "card/" (:id other)) {:name "Renamed"})
        (is (= "Renamed" (t2/select-one-fn :name :model/Card :id (:id other))))))))

(deftest library-api-test
  (collections.tu/with-library-synced
    (remote-sync.tu/with-remote-sync [url :read-only]
      (testing "glossary entries can't be created while the Library is synced"
        (mt/user-http-request :crowberto :post 403 "glossary" {:term "Term" :definition "Definition"})))))

(deftest built-in-rows-test
  (let [daily (t2/select-one :model/TransformTag :built_in_type "daily")]
    (testing "on read-only instance, built-in rows can't be written, though they are not synced"
      (remote-sync.tu/with-remote-sync [url :read-only]
        (is (false? (remote-sync/can-write? :model/TransformTag (:id daily))))))
    (testing "on read-write instance, they can"
      (remote-sync.tu/with-remote-sync [url :read-write]
        (is (true? (remote-sync/can-write? :model/TransformTag (:id daily))))))))
