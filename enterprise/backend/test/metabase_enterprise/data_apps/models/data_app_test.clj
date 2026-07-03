(ns metabase-enterprise.data-apps.models.data-app-test
  "Unit coverage for the DataApp model: the blob-excluding reads, JSON that never
   leaks the bundle bytes, the `allowed_hosts` NULL→[] read coercion, and the
   superuser-only permission gating."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.models.data-app :as data-app]
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
           :bundle_path  "data_apps/m/index.js"
           :bundle       (.getBytes "BUNDLEBYTES" "UTF-8")
           :bundle_hash  "hash"}
          extra)))

(deftest to-json-never-includes-the-bundle-bytes-test
  (mt/with-model-cleanup [:model/DataApp]
    (insert-app!)
    (let [app     (t2/select-one :model/DataApp :name "m")
          decoded (json/decode (json/encode app))]
      (is (contains? app :bundle) "the selected instance still carries the raw bundle")
      (is (not (contains? decoded "bundle"))
          "but the JSON representation omits it")
      (is (= "M" (get decoded "display_name"))))))

(deftest non-blob-selects-exclude-the-bundle-test
  (mt/with-model-cleanup [:model/DataApp]
    (insert-app! :allowed_hosts ["https://api.example.com"])
    (testing "select-one-non-blob returns metadata without the bundle blob"
      (let [app (data-app/select-one-non-blob :name "m")]
        (is (not (contains? app :bundle)))
        (is (= "M" (:display_name app)))
        (is (= ["https://api.example.com"] (:allowed_hosts app)))))
    (testing "select-non-blob returns a seq of blob-free rows"
      (let [apps (data-app/select-non-blob :name "m")]
        (is (= 1 (count apps)))
        (is (not (contains? (first apps) :bundle)))))))

(deftest allowed-hosts-reads-as-a-vector-never-nil-test
  (mt/with-model-cleanup [:model/DataApp]
    (testing "a row stored with NULL allowed_hosts reads back as []"
      (insert-app!)
      (is (= [] (:allowed_hosts (t2/select-one :model/DataApp :name "m")))))
    (testing "a stored list round-trips through the JSON transform"
      (insert-app! :name "n" :allowed_hosts ["https://a.com" "https://b.com"])
      (is (= ["https://a.com" "https://b.com"]
             (:allowed_hosts (t2/select-one :model/DataApp :name "n")))))))

(deftest permissions-are-superuser-only-test
  (testing "read/write/create are granted only to superusers"
    (binding [api/*is-superuser?* true]
      (is (mi/can-read? :model/DataApp 1))
      (is (mi/can-write? :model/DataApp 1))
      (is (mi/can-create? :model/DataApp {})))
    (binding [api/*is-superuser?* false]
      (is (not (mi/can-read? :model/DataApp 1)))
      (is (not (mi/can-write? :model/DataApp 1)))
      (is (not (mi/can-create? :model/DataApp {}))))))
