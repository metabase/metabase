(ns metabase-enterprise.custom-viz-plugin.models.custom-viz-plugin-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.custom-viz-plugin.cache :as cache]
   [metabase-enterprise.custom-viz-plugin.test-util :as cv.tu]
   [metabase-enterprise.serialization.v2.ingest :as ingest]
   [metabase-enterprise.serialization.v2.storage.util :as storage.util]
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- bundle-files
  "The files of a minimal plugin bundle, as bytes: the manifest, the JavaScript, and an `icon.svg` asset. `manifest`
  is merged over a default `:icon` naming that asset by its bare file name."
  [manifest]
  {"metabase-plugin.json" (.getBytes ^String (json/encode (merge {:icon "icon.svg"} manifest)) "UTF-8")
   "dist/index.js"        (.getBytes "{}" "UTF-8")
   "dist/assets/icon.svg" (.getBytes "<svg xmlns='http://www.w3.org/2000/svg'/>" "UTF-8")})

(defn- as-text
  "`files`, a map of path to bytes, with each file as its UTF-8 text: the form the bundle takes in an export."
  [files]
  (update-vals files #(String. ^bytes % "UTF-8")))

(defn- load-plugin!
  "Load `ingested` as a new plugin, or over the plugin row `id`, and return the stored row."
  ([ingested] (load-plugin! ingested nil))
  ([ingested id]
   (serdes/load-one! ingested (some->> id (t2/select-one :model/CustomVizPlugin :id)))
   (if id
     (t2/select-one :model/CustomVizPlugin :id id)
     (t2/select-one :model/CustomVizPlugin :identifier (:identifier ingested)))))

(deftest dot-path-bundle-round-trip-test
  (let [identifier "dot-path-viz"
        files      (bundle-files {:name identifier :icon "./icon.svg"})
        bundle     (cv.tu/make-tgz-bytes (map (fn [[path content]] [(str "./" path) content]) files))
        export     (get-in (serdes/make-spec "CustomVizPlugin" {}) [:transform :bundle :export-with-context])]
    (is (some? (cache/validate-bundle! bundle)))
    (let [exported (export {:identifier identifier} :bundle bundle)]
      (is (= (as-text files) exported))
      (when (map? exported)
        (let [ingested (ingest/read-resources
                        {:serdes/meta [{:model "CustomVizPlugin" :id identifier}]
                         :identifier identifier :files (vec (keys exported))}
                        exported)]
          (is (= (set (keys files)) (set (keys (:serdes/resources ingested)))))
          (mt/with-temp [:model/CustomVizPlugin {id :id} {:identifier   identifier
                                                          :display_name identifier
                                                          :status       :active
                                                          :bundle       bundle}]
            (let [row (load-plugin! ingested id)]
              (is (= :active (:status row)))
              (is (= (update-vals files seq) (update-vals (cache/bundle->files (:bundle row)) seq))))))))))

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
      (t2/update! :model/CustomVizPlugin :id id {:status :error})
      (is (= :error (:status (t2/select-one :model/CustomVizPlugin :id id)))))))

;;; ------------------------------------------------- Serialization --------------------------------------------------

(deftest entity-id-and-path-test
  (testing "a plugin is identified by its entity_id, like every other entity"
    (is (= "eNtItYiD0000000000001"
           (serdes/entity-id "CustomVizPlugin" {:identifier "my-viz" :entity_id "eNtItYiD0000000000001" :id 1}))))
  (testing "the path is the entity_id, labelled by the identifier"
    (is (= [{:model "CustomVizPlugin" :id "eNtItYiD0000000000001" :label "my_viz"}]
           (serdes/generate-path "CustomVizPlugin" {:identifier "My-Viz" :entity_id "eNtItYiD0000000000001"})))))

(deftest storage-path-test
  (testing "storage-path is the slugified identifier's directory under custom_viz_plugins, holding custom_viz_plugin.yaml"
    (let [entity (fn [identifier entity-id]
                   {:identifier  identifier
                    :entity_id   entity-id
                    :serdes/meta [{:model "CustomVizPlugin" :id entity-id}]})
          ctx    (serdes/storage-base-context)]
      (is (= "custom_viz_plugins/my_viz/custom_viz_plugin.yaml"
             (storage.util/entity-file-path ctx (entity "My-Viz" "eNtItYiD0000000000001"))))
      (testing "identifiers that slugify alike, such as `My-Viz` and `my_viz`, get distinct directories"
        (is (= "custom_viz_plugins/my_viz_2/custom_viz_plugin.yaml"
               (storage.util/entity-file-path ctx (entity "my_viz" "eNtItYiD0000000000002")))))
      (testing "an identifier with spaces is slugified"
        (is (= "custom_viz_plugins/my_heatmap/custom_viz_plugin.yaml"
               (storage.util/entity-file-path ctx (entity "My Heatmap" "eNtItYiD0000000000003"))))))))

(deftest load-find-local-test
  (testing "load-find-local finds the plugin by its entity_id, not its identifier"
    (mt/with-temp [:model/CustomVizPlugin {id :id entity-id :entity_id} {:identifier   "find-local"
                                                                         :display_name "find-local"
                                                                         :status       :active}]
      (let [found (serdes/load-find-local [{:model "CustomVizPlugin" :id entity-id}])]
        (is (some? found))
        (is (= id (:id found))))
      (is (nil? (serdes/load-find-local [{:model "CustomVizPlugin" :id "find-local"}]))))))

(deftest make-spec-test
  (testing "the YAML holds plugin settings and declares the unpacked bundle files"
    (let [spec (serdes/make-spec "CustomVizPlugin" {})]
      (is (= #{:entity_id :identifier} (set (:copy spec))) "the entity_id travels in the YAML, as a data app's does")
      (is (contains? (set (:skip spec)) :enabled) "enabled is an admin's choice on each instance, as for data apps")
      (is (= :serdes/resources (get-in spec [:transform :bundle :as])))))
  (testing "bundle transforms skip unreadable archives and pack resources deterministically"
    (let [spec     (serdes/make-spec "CustomVizPlugin" {})
          export   (let [f (get-in spec [:transform :bundle :export-with-context])]
                     (fn [bundle] (f {:identifier "my-viz"} :bundle bundle)))
          import   (get-in spec [:transform :bundle :import])
          files    (bundle-files {:name "my-viz"})
          texts    (as-text files)]
      (is (= ::serdes/skip (export nil)))
      (is (= ::serdes/skip (export (.getBytes "not a tgz" "UTF-8"))) "a stored archive that can't be read is left out")
      (testing "a file that isn't there is left out of the archive"
        (is (= {"dist/index.js" (seq (get files "dist/index.js"))}
               (update-vals (cache/bundle->files (import (assoc texts "metabase-plugin.json" nil "dist/assets/icon.svg" nil)))
                            seq))))
      (testing "the same files always pack to the same bytes, so the hash is stable across imports"
        (is (= (seq (import texts)) (seq (import texts)))))))
  (testing "resource paths come from YAML, including assets unknown to the manifest"
    (let [paths ["metabase-plugin.json" "dist/index.js" "dist/assets/icon.svg" "dist/assets/extra.svg"]
          ingested {:serdes/meta [{:model "CustomVizPlugin" :id "my-viz"}]
                    :files paths}]
      (is (= paths (serdes/resource-paths ingested)))))
  (testing "export declares exactly the resources it writes, unpacking the bundle once"
    (let [unpack cache/bundle->files
          calls (atom 0)]
      (mt/with-dynamic-fn-redefs [cache/bundle->files (fn [bundle]
                                                        (swap! calls inc)
                                                        (unpack bundle))]
        (let [entity (serdes/extract-one "CustomVizPlugin" {}
                                         {:identifier "my-viz" :enabled true
                                          :bundle (cache/files->bundle (bundle-files {:name "my-viz"}))})]
          (is (= "my-viz" (:identifier entity)))
          (is (= (sort (keys (:serdes/resources entity))) (:files entity)))
          (is (= 1 @calls)))))))

(defn- ingested-plugin
  "Build an ingested plugin from bundle files, read as text, under a fresh entity_id unless `extra` gives one."
  [identifier ^bytes bundle & {:as extra}]
  (let [entity-id (or (:entity_id extra) (u/generate-nano-id))]
    (merge {:serdes/meta      [{:model "CustomVizPlugin" :id entity-id :label identifier}]
            :serdes/resources (when bundle (as-text (cache/bundle->files bundle)))
            :identifier       identifier
            :entity_id        entity-id}
           extra)))

(defn- repacked-hash
  "The `bundle_hash` an import of `bundle`'s files stores: the hash of the archive it packs them back into."
  [^bytes bundle]
  (cv.tu/bundle-hash (cache/files->bundle (cache/bundle->files bundle))))

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

(defn- load-as-new-and-over-existing
  "The rows stored by loading `ingested` as a new plugin, and over an active plugin of its identifier."
  [{:keys [identifier] :as ingested}]
  [(mt/with-model-cleanup [:model/CustomVizPlugin]
     (load-plugin! ingested))
   (mt/with-temp [:model/CustomVizPlugin {id :id} (active-plugin-row identifier (cv.tu/valid-bundle-bytes identifier))]
     (load-plugin! ingested id))])

(deftest load-insert-validates-bundle-test
  (mt/with-model-cleanup [:model/CustomVizPlugin]
    (testing "loading an exported plugin with a valid bundle makes it :active"
      (let [bundle (cv.tu/valid-bundle-bytes "imported-viz" {:icon "chart.svg"})]
        (is (=? {:status :active :error_message nil :enabled true :bundle_hash (repacked-hash bundle)}
                (load-plugin! (ingested-plugin "imported-viz" bundle))))))
    (testing "loading a plugin whose files have no manifest makes it :error, keeping the files and their hash"
      (let [packed (cache/files->bundle {"dist/index.js" (.getBytes "{}" "UTF-8")})]
        (is (=? {:status        :error
                 :error_message #(str/includes? % "metabase-plugin.json not found")
                 :display_name  "broken-viz"
                 :bundle_hash   (cv.tu/bundle-hash packed)
                 :bundle        #(= (seq packed) (seq %))}
                (load-plugin! (ingested-plugin "broken-viz" nil :serdes/resources {"metabase-plugin.json" nil
                                                                                   "dist/index.js"        "{}"}))))))
    (testing "loading a plugin whose directory has none of the files makes it :error"
      (is (=? {:status :error :error_message #(str/includes? % "metabase-plugin.json not found")}
              (load-plugin! (ingested-plugin "bundleless-viz" nil)))))))

(deftest load-leaves-enabled-to-the-instance-test
  (let [bundle (cv.tu/valid-bundle-bytes "toggled-viz")]
    (testing "a new plugin loads enabled, as an upload does"
      (mt/with-model-cleanup [:model/CustomVizPlugin]
        (is (true? (:enabled (load-plugin! (ingested-plugin "toggled-viz" bundle)))))))
    (testing "a plugin an admin disabled here stays disabled when loaded again, even from a file that says `enabled`"
      (mt/with-temp [:model/CustomVizPlugin {id :id} (assoc (active-plugin-row "toggled-viz" bundle) :enabled false)]
        (doseq [extra [{} {:enabled true}]]
          (is (false? (:enabled (load-plugin! (ingested-plugin "toggled-viz" bundle extra) id)))))))))

(deftest load-refuses-a-new-identifier-that-cannot-name-a-directory-test
  (let [bundle (cv.tu/valid-bundle-bytes "bad/identifier")]
    (testing "a new plugin is a registration, held to the directory rule"
      (mt/with-model-cleanup [:model/CustomVizPlugin]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"\"bad/identifier\" must be letters, digits"
                              (load-plugin! (ingested-plugin "bad/identifier" bundle))))))
    (testing "an existing plugin from before the rule still updates in place"
      (mt/with-temp [:model/CustomVizPlugin {id :id} (active-plugin-row "bad/identifier" bundle)]
        (is (= :active (:status (load-plugin! (ingested-plugin "bad/identifier" bundle) id))))))))

(deftest load-identifier-uniqueness-test
  (let [ingested (fn [identifier & kvs]
                   (apply ingested-plugin identifier (cv.tu/valid-bundle-bytes identifier) kvs))]
    (mt/with-temp [:model/CustomVizPlugin {id :id entity-id :entity_id} (active-plugin-row "thumbs" (cv.tu/valid-bundle-bytes "thumbs"))
                   :model/CustomVizPlugin {ops-id :id ops-entity-id :entity_id} (active-plugin-row "ops" (cv.tu/valid-bundle-bytes "ops"))]
      (testing "a new plugin can't take an identifier held here under another entity_id; the import says what to do"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"A custom viz plugin \"thumbs\" already exists on this instance\. Delete it and pull again"
                              (load-plugin! (ingested "thumbs"))))
        (is (= entity-id (t2/select-one-fn :entity_id :model/CustomVizPlugin :id id))
            "the local plugin's entity_id is never replaced by the file's"))
      (testing "nor one differing only in case, and the error names both"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"\"THUMBS\" differs only in case from .*\"thumbs\""
                              (load-plugin! (ingested "THUMBS")))))
      (testing "a plugin matched by its entity_id can't be renamed to an identifier another plugin holds, in any case"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"A custom viz plugin \"thumbs\" already exists on this instance"
                              (load-plugin! (ingested "thumbs" :entity_id ops-entity-id) ops-id)))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"\"THUMBS\" differs only in case from .*\"thumbs\""
                              (load-plugin! (ingested "THUMBS" :entity_id ops-entity-id) ops-id)))
        (is (= "ops" (t2/select-one-fn :identifier :model/CustomVizPlugin :id ops-id))))
      (testing "the plugin matched by its entity_id updates in place and takes the file's identifier, even its own in another case"
        (doseq [identifier ["thumbs" "thumbs2" "THUMBS2"]]
          (is (=? {:id id :entity_id entity-id :identifier identifier :display_name identifier :status :active}
                  (load-plugin! (ingested identifier :entity_id entity-id) id))))))))

(deftest load-update-validates-bundle-test
  (testing "re-importing over an existing plugin re-validates the new bundle"
    (let [old-bundle (cv.tu/valid-bundle-bytes "updated-viz")
          new-bundle (cv.tu/valid-bundle-bytes "updated-viz" {:icon "star.svg"})]
      (mt/with-temp [:model/CustomVizPlugin {id :id} (assoc (active-plugin-row "updated-viz" old-bundle)
                                                            :status        :error
                                                            :error_message "stale")]
        (is (=? {:id id :status :active :error_message nil :icon "star.svg" :bundle_hash (repacked-hash new-bundle)}
                (load-plugin! (ingested-plugin "updated-viz" new-bundle) id)))))))

(deftest load-keeps-a-plugin-with-a-bitmap-icon-active-test
  (testing "a plugin exported with a bitmap icon, from before icons had to be SVG files, keeps working once imported"
    (is (=? (repeat 2 {:status :active :error_message nil})
            (load-as-new-and-over-existing
             (ingested-plugin "bitmap-viz" (cv.tu/valid-bundle-bytes "bitmap-viz" {:icon "icon.png"})))))))

(deftest load-rejects-bundle-identifier-mismatch-test
  (testing "a bundle whose manifest name differs from the imported identifier lands as :error, never :active"
    (is (=? (repeat 2 {:identifier    "calendar-heatmap-viz"
                       :status        :error
                       :error_message #(str/includes? % "does not match")})
            (load-as-new-and-over-existing
             (ingested-plugin "calendar-heatmap-viz" (cv.tu/valid-bundle-bytes "thumbs-viz")))))))
