(ns metabase-enterprise.custom-viz-plugin.models.custom-viz-plugin-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(deftest table-name-test
  (is (= :custom_viz_plugin (t2/table-name :model/CustomVizPlugin))))

(deftest timestamped-test
  (testing "CustomVizPlugin gets auto-populated timestamps"
    (mt/with-temp [:model/CustomVizPlugin {id :id} {:identifier   "ts-test"
                                                    :display_name "ts-test"
                                                    :status       :active}]
      (let [plugin (t2/select-one :model/CustomVizPlugin :id id)]
        (is (some? (:created_at plugin)))
        (is (some? (:updated_at plugin)))))))

(deftest permissions-test
  (testing "read is available to any authenticated user"
    (mt/with-temp [:model/CustomVizPlugin {id :id} {:repo_url     "https://github.com/test/ts-test"
                                                    :identifier   "perm-test"
                                                    :display_name "perm-test"
                                                    :status       :active}]
      (let [plugin (t2/select-one :model/CustomVizPlugin :id id)]
        (binding [api/*current-user-id* 1]
          (is (true? (boolean (mi/can-read? plugin)))))
        (binding [api/*current-user-id* nil]
          (is (false? (boolean (mi/can-read? plugin))))))))
  (testing "write requires superuser"
    (mt/with-temp [:model/CustomVizPlugin {id :id} {:identifier   "perm-test-2"
                                                    :display_name "perm-test-2"
                                                    :status       :active}]
      (let [plugin (t2/select-one :model/CustomVizPlugin :id id)]
        (binding [api/*is-superuser?* true]
          (is (true? (mi/can-write? plugin))))
        (binding [api/*is-superuser?* false]
          (is (false? (mi/can-write? plugin)))))))
  (testing "create requires superuser"
    (binding [api/*is-superuser?* true]
      (is (true? (mi/can-create? :model/CustomVizPlugin {}))))
    (binding [api/*is-superuser?* false]
      (is (false? (mi/can-create? :model/CustomVizPlugin {}))))))

(deftest to-json-strips-bundle-test
  (testing "JSON serialization never includes the raw bundle bytes"
    (mt/with-temp [:model/CustomVizPlugin {id :id} {:identifier   "json-test"
                                                    :display_name "json-test"
                                                    :status       :active
                                                    :bundle       (.getBytes "pretend-zip-bytes" "UTF-8")
                                                    :bundle_hash  "feedface"}]
      (let [plugin   (t2/select-one :model/CustomVizPlugin :id id)
            json-str (json/encode plugin)]
        (is (not (re-find #"pretend-zip-bytes" json-str)))))))

(deftest status-keyword-transform-test
  (testing "status is stored as string and returned as keyword"
    (mt/with-temp [:model/CustomVizPlugin {id :id} {:identifier   "status-test"
                                                    :display_name "status-test"
                                                    :status       :active}]
      (is (= :active (:status (t2/select-one :model/CustomVizPlugin :id id))))
      (t2/update! :model/CustomVizPlugin id {:status :error})
      (is (= :error (:status (t2/select-one :model/CustomVizPlugin :id id)))))))

;;; ------------------------------------------------- Serialization --------------------------------------------------

(deftest entity-id-test
  (testing "entity-id is based on identifier"
    (is (= "my-viz"
           (serdes/entity-id "CustomVizPlugin" {:identifier "my-viz" :id 1})))))

(deftest generate-path-test
  (testing "generate-path uses identifier for both id and label"
    (is (= [{:model "CustomVizPlugin" :id "my-viz" :label "my-viz"}]
           (serdes/generate-path "CustomVizPlugin" {:identifier "my-viz"})))))

(deftest storage-path-test
  (testing "storage-path places under custom_viz_plugins directory"
    (let [entity {:identifier  "my-viz"
                  :serdes/meta [{:model "CustomVizPlugin" :id "my-viz" :label "my-viz"}]}]
      (is (= [{:label "custom_viz_plugins"} {:label "my-viz"}]
             (serdes/storage-path entity nil))))))

(deftest hash-fields-test
  (testing "hash-fields is [:identifier]"
    (is (= [:identifier]
           (serdes/hash-fields :model/CustomVizPlugin)))))

(deftest load-find-local-test
  (testing "load-find-local finds plugin by identifier"
    (mt/with-temp [:model/CustomVizPlugin {id :id} {:identifier   "find-local"
                                                    :display_name "find-local"
                                                    :status       :active}]
      (let [found (serdes/load-find-local [{:model "CustomVizPlugin" :id "find-local"}])]
        (is (some? found))
        (is (= id (:id found)))))))

(deftest make-spec-test
  (testing "make-spec copies identity fields but skips the binary bundle and transient dev/error state"
    (let [spec (serdes/make-spec "CustomVizPlugin" {})]
      (is (contains? (set (:copy spec)) :identifier))
      (is (contains? (set (:copy spec)) :display_name))
      (is (contains? (set (:copy spec)) :manifest))
      (is (contains? (set (:skip spec)) :bundle))
      (is (contains? (set (:skip spec)) :bundle_hash))
      (is (contains? (set (:skip spec)) :dev_bundle_url))
      (is (contains? (set (:skip spec)) :error_message))))
  (testing "status is always exported as skip and imported as pending"
    (let [spec          (serdes/make-spec "CustomVizPlugin" {})
          status-export (get-in spec [:transform :status :export])
          status-import (get-in spec [:transform :status :import])]
      (is (= ::serdes/skip (status-export :active)))
      (is (= "pending" (status-import nil))))))
