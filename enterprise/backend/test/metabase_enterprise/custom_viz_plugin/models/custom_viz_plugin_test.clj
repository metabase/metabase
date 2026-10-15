(ns metabase-enterprise.custom-viz-plugin.models.custom-viz-plugin-test
  (:require
   [buddy.core.codecs :as codecs]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.custom-viz-plugin.test-util :as cv.tu]
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

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
    (mt/with-temp [:model/CustomVizPlugin {id :id} {:identifier   "perm-test"
                                                    :display_name "perm-test"
                                                    :status       :active}]
      (let [plugin (t2/select-one :model/CustomVizPlugin :id id)]
        (binding [api/*current-user-id* (mt/user->id :rasta)]
          (is (true? (mi/can-read? plugin))))
        (binding [api/*current-user-id* nil]
          (is (false? (mi/can-read? plugin)))))))
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

(deftest load-find-local-test
  (testing "load-find-local finds plugin by identifier"
    (mt/with-temp [:model/CustomVizPlugin {id :id} {:identifier   "find-local"
                                                    :display_name "find-local"
                                                    :status       :active}]
      (let [found (serdes/load-find-local [{:model "CustomVizPlugin" :id "find-local"}])]
        (is (some? found))
        (is (= id (:id found)))))))

(deftest make-spec-test
  (testing "make-spec copies identity fields and bundle_hash, skips dev/error state"
    (let [spec (serdes/make-spec "CustomVizPlugin" {})]
      (is (contains? (set (:copy spec)) :identifier))
      (is (contains? (set (:copy spec)) :display_name))
      (is (contains? (set (:copy spec)) :manifest))
      (is (contains? (set (:copy spec)) :bundle_hash))
      (is (contains? (set (:skip spec)) :dev_bundle_url))
      (is (contains? (set (:skip spec)) :error_message)))))

(deftest bundle-b64-round-trip-test
  (testing "bundle bytes base64-encode on export and decode back to bytes on import"
    (let [spec   (serdes/make-spec "CustomVizPlugin" {})
          export (get-in spec [:transform :bundle :export])
          import (get-in spec [:transform :bundle :import])
          bytes  (.getBytes "pretend tgz bytes" "UTF-8")
          out    (export bytes)]
      (is (string? out))
      (is (not= (String. bytes "UTF-8") out)
          "exported value should be b64-encoded, not the raw string")
      (is (= (seq bytes) (seq (import out))))))
  (testing "nil bundle round-trips as nil"
    (let [spec   (serdes/make-spec "CustomVizPlugin" {})
          export (get-in spec [:transform :bundle :export])
          import (get-in spec [:transform :bundle :import])]
      (is (nil? (export nil)))
      (is (nil? (import nil))))))

(defn- ingested-plugin
  "What serdes ingests for an export of plugin `identifier` whose bundle bytes are `bundle`."
  [identifier ^bytes bundle]
  {:serdes/meta  [{:model "CustomVizPlugin" :id identifier :label identifier}]
   :identifier   identifier
   :display_name identifier
   :manifest     {:name identifier}
   :bundle_hash  (cv.tu/bundle-hash bundle)
   :bundle       (codecs/bytes->b64-str bundle)
   :created_at   "2026-01-01T00:00:00Z"})

(defn- active-plugin-row
  "Columns of an active, enabled plugin `identifier` backed by `bundle`, for `mt/with-temp`."
  [identifier ^bytes bundle]
  {:identifier   identifier
   :display_name identifier
   :status       :active
   :enabled      true
   :manifest     {:name identifier}
   :bundle       bundle
   :bundle_hash  (cv.tu/bundle-hash bundle)})

(deftest load-insert-validates-bundle-test
  (testing "loading an exported plugin with a valid bundle makes it :active"
    (mt/with-model-cleanup [:model/CustomVizPlugin]
      (let [bundle (cv.tu/valid-bundle-bytes "imported-viz" {:icon "chart"})]
        (serdes/load-one! (ingested-plugin "imported-viz" bundle) nil)
        (is (=? {:status        :active
                 :error_message nil
                 :enabled       true
                 :bundle_hash   (cv.tu/bundle-hash bundle)}
                (t2/select-one :model/CustomVizPlugin :identifier "imported-viz"))))))
  (testing "loading a plugin whose bundle is not a valid archive makes it :error"
    (mt/with-model-cleanup [:model/CustomVizPlugin]
      (serdes/load-one! (ingested-plugin "broken-viz" (.getBytes "not a tgz" "UTF-8")) nil)
      (is (=? {:status        :error
               :error_message string?}
              (t2/select-one :model/CustomVizPlugin :identifier "broken-viz"))))))

(deftest load-update-validates-bundle-test
  (testing "re-importing over an existing plugin re-validates the new bundle"
    (let [old-bundle (cv.tu/valid-bundle-bytes "updated-viz")
          new-bundle (cv.tu/valid-bundle-bytes "updated-viz" {:icon "star"})]
      (mt/with-temp [:model/CustomVizPlugin {id :id} (assoc (active-plugin-row "updated-viz" old-bundle)
                                                            :status        :error
                                                            :error_message "stale")]
        (serdes/load-one! (ingested-plugin "updated-viz" new-bundle) (t2/select-one :model/CustomVizPlugin :id id))
        (is (=? {:id            id
                 :status        :active
                 :error_message nil
                 :icon          "star"
                 :bundle_hash   (cv.tu/bundle-hash new-bundle)}
                (t2/select-one :model/CustomVizPlugin :id id)))))))

(deftest load-rejects-bundle-identifier-mismatch-test
  (testing "a bundle whose manifest name differs from the imported identifier lands as :error, never :active"
    (let [ingested (ingested-plugin "calendar-heatmap-viz" (cv.tu/valid-bundle-bytes "thumbs-viz"))]
      (testing "on insert"
        (mt/with-model-cleanup [:model/CustomVizPlugin]
          (serdes/load-one! ingested nil)
          (is (=? {:identifier    "calendar-heatmap-viz"
                   :status        :error
                   :error_message #(str/includes? % "does not match")}
                  (t2/select-one :model/CustomVizPlugin :identifier "calendar-heatmap-viz")))))
      (testing "on update over an active plugin"
        (mt/with-temp [:model/CustomVizPlugin {id :id} (active-plugin-row "calendar-heatmap-viz"
                                                                          (cv.tu/valid-bundle-bytes "calendar-heatmap-viz"))]
          (serdes/load-one! ingested (t2/select-one :model/CustomVizPlugin :id id))
          (is (=? {:id            id
                   :status        :error
                   :error_message #(str/includes? % "does not match")}
                  (t2/select-one :model/CustomVizPlugin :id id))))))))
