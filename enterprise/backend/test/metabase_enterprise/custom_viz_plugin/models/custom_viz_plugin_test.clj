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
                        identifier
                        exported)]
          (is (= (set (keys files)) (set (keys (:serdes/resources ingested)))))
          (mt/with-temp [:model/CustomVizPlugin {id :id :as plugin} {:identifier   identifier
                                                                     :display_name identifier
                                                                     :status       :active
                                                                     :bundle       bundle}]
            (serdes/load-one! ingested plugin)
            (is (= :active (t2/select-one-fn :status :model/CustomVizPlugin :id id)))
            (is (= (update-vals files seq)
                   (update-vals (cache/bundle->files (t2/select-one-fn :bundle :model/CustomVizPlugin :id id)) seq)))))))))

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

(deftest entity-id-test
  (testing "a plugin is identified by its entity_id, like every other entity"
    (is (= "eNtItYiD0000000000001"
           (serdes/entity-id "CustomVizPlugin" {:identifier "my-viz" :entity_id "eNtItYiD0000000000001" :id 1})))))

(deftest generate-path-test
  (testing "the path is the entity_id, labelled by the identifier"
    (is (= [{:model "CustomVizPlugin" :id "eNtItYiD0000000000001" :label "my_viz"}]
           (serdes/generate-path "CustomVizPlugin" {:identifier "My-Viz" :entity_id "eNtItYiD0000000000001"})))))

(deftest storage-path-test
  (testing "storage-path is the identifier's own directory under custom_viz_plugins, holding custom_viz_plugin.yaml"
    (let [entity {:identifier  "My-Viz"
                  :entity_id   "eNtItYiD0000000000001"
                  :serdes/meta [{:model "CustomVizPlugin" :id "eNtItYiD0000000000001" :label "my_viz"}]}]
      (testing "the directory keeps the identifier verbatim, since import checks it against the identifier"
        (is (= "custom_viz_plugins/My-Viz/custom_viz_plugin.yaml"
               (storage.util/entity-file-path (serdes/storage-base-context) entity)))))))

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
            :serdes/directory identifier
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

(deftest load-insert-validates-bundle-test
  (testing "loading an exported plugin with a valid bundle makes it :active"
    (mt/with-model-cleanup [:model/CustomVizPlugin]
      (let [bundle (cv.tu/valid-bundle-bytes "imported-viz" {:icon "chart.svg"})]
        (serdes/load-one! (ingested-plugin "imported-viz" bundle) nil)
        (is (=? {:status        :active
                 :error_message nil
                 :enabled       true
                 :bundle_hash   (repacked-hash bundle)}
                (t2/select-one :model/CustomVizPlugin :identifier "imported-viz"))))))
  (testing "loading a plugin whose files have no manifest makes it :error, keeping the files and their hash"
    (mt/with-model-cleanup [:model/CustomVizPlugin]
      (let [packed (cache/files->bundle {"dist/index.js" (.getBytes "{}" "UTF-8")})]
        (serdes/load-one! (ingested-plugin "broken-viz" nil :serdes/resources {"metabase-plugin.json" nil
                                                                               "dist/index.js"        "{}"})
                          nil)
        (is (=? {:status        :error
                 :error_message #(str/includes? % "metabase-plugin.json not found")
                 :display_name  "broken-viz"
                 :bundle_hash   (cv.tu/bundle-hash packed)}
                (t2/select-one :model/CustomVizPlugin :identifier "broken-viz")))
        (is (= (seq packed) (seq (t2/select-one-fn :bundle :model/CustomVizPlugin :identifier "broken-viz")))))))
  (testing "loading a plugin whose directory has none of the files makes it :error"
    (mt/with-model-cleanup [:model/CustomVizPlugin]
      (serdes/load-one! (ingested-plugin "bundleless-viz" nil) nil)
      (is (=? {:status        :error
               :error_message #(str/includes? % "metabase-plugin.json not found")}
              (t2/select-one :model/CustomVizPlugin :identifier "bundleless-viz"))))))

(deftest load-leaves-enabled-to-the-instance-test
  (let [bundle (cv.tu/valid-bundle-bytes "toggled-viz")]
    (testing "a new plugin loads enabled, as an upload does"
      (mt/with-model-cleanup [:model/CustomVizPlugin]
        (serdes/load-one! (ingested-plugin "toggled-viz" bundle) nil)
        (is (true? (t2/select-one-fn :enabled :model/CustomVizPlugin :identifier "toggled-viz")))))
    (testing "a plugin an admin disabled here stays disabled when its files are loaded again"
      (mt/with-temp [:model/CustomVizPlugin {id :id} (assoc (active-plugin-row "toggled-viz" bundle) :enabled false)]
        (serdes/load-one! (ingested-plugin "toggled-viz" bundle) (t2/select-one :model/CustomVizPlugin :id id))
        (is (false? (t2/select-one-fn :enabled :model/CustomVizPlugin :id id)))))
    (testing "a file that still says `enabled` is loaded without it"
      (mt/with-temp [:model/CustomVizPlugin {id :id} (assoc (active-plugin-row "toggled-viz" bundle) :enabled false)]
        (serdes/load-one! (ingested-plugin "toggled-viz" bundle :enabled true) (t2/select-one :model/CustomVizPlugin :id id))
        (is (false? (t2/select-one-fn :enabled :model/CustomVizPlugin :id id)))))))

(deftest load-checks-the-directory-name-test
  (testing "a plugin read from a directory not named by its identifier fails the import, naming the directory"
    (mt/with-model-cleanup [:model/CustomVizPlugin]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"custom_viz_plugins/thumb: .*\"thumbs\""
                            (serdes/load-one! (ingested-plugin "thumbs" (cv.tu/valid-bundle-bytes "thumbs")
                                                               :serdes/directory "thumb")
                                              nil)))
      (is (nil? (t2/select-one :model/CustomVizPlugin :identifier "thumbs")))))
  (testing "an ingested plugin that carries no directory, such as one not read from files, loads"
    (mt/with-model-cleanup [:model/CustomVizPlugin]
      (serdes/load-one! (dissoc (ingested-plugin "thumbs" (cv.tu/valid-bundle-bytes "thumbs")) :serdes/directory) nil)
      (is (= :active (t2/select-one-fn :status :model/CustomVizPlugin :identifier "thumbs"))))))

(deftest load-refuses-a-new-identifier-that-cannot-name-a-directory-test
  (mt/with-model-cleanup [:model/CustomVizPlugin]
    (testing "a new plugin is a registration, held to the directory rule"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"\"bad/identifier\" must be letters, digits"
                            (serdes/load-one! (ingested-plugin "bad/identifier" (cv.tu/valid-bundle-bytes "bad/identifier")) nil))))
    (testing "an existing plugin from before the rule still updates in place"
      (let [bundle (cv.tu/valid-bundle-bytes "bad/identifier")]
        (mt/with-temp [:model/CustomVizPlugin {id :id} (active-plugin-row "bad/identifier" bundle)]
          (serdes/load-one! (ingested-plugin "bad/identifier" bundle) (t2/select-one :model/CustomVizPlugin :id id))
          (is (= :active (t2/select-one-fn :status :model/CustomVizPlugin :id id))))))))

(deftest load-refuses-a-second-plugin-with-the-same-identifier-test
  (testing "a plugin made on this instance holds its identifier under another entity_id; the import says what to do"
    (let [bundle (cv.tu/valid-bundle-bytes "thumbs")]
      (mt/with-temp [:model/CustomVizPlugin {id :id entity-id :entity_id} (active-plugin-row "thumbs" bundle)]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"A custom viz plugin \"thumbs\" already exists on this instance\. Delete it and pull again"
                              (serdes/load-one! (ingested-plugin "thumbs" bundle) nil)))
        (testing "the local plugin is untouched: its entity_id is never replaced by the file's"
          (is (= entity-id (t2/select-one-fn :entity_id :model/CustomVizPlugin :id id))))
        (testing "the same file matched to the local row by its entity_id updates it in place"
          (serdes/load-one! (ingested-plugin "thumbs" bundle :entity_id entity-id) (t2/select-one :model/CustomVizPlugin :id id))
          (is (= [id entity-id] ((juxt :id :entity_id) (t2/select-one :model/CustomVizPlugin :identifier "thumbs")))))))))

(deftest load-refuses-an-identifier-differing-only-in-case-test
  (let [bundle (cv.tu/valid-bundle-bytes "Thumbs")]
    (mt/with-temp [:model/CustomVizPlugin {id :id} (active-plugin-row "Thumbs" bundle)]
      (testing "a new plugin whose identifier is an existing one in another case is refused, naming both"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"\"thumbs\" differs only in case from .*\"Thumbs\""
                              (serdes/load-one! (ingested-plugin "thumbs" (cv.tu/valid-bundle-bytes "thumbs")) nil))))
      (testing "another plugin, matched by its entity_id, cannot be renamed to an existing identifier in another case"
        (mt/with-temp [:model/CustomVizPlugin {other-id :id} (active-plugin-row "ops" (cv.tu/valid-bundle-bytes "ops"))]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"\"thumbs\" differs only in case from .*\"Thumbs\""
                                (serdes/load-one! (ingested-plugin "thumbs" (cv.tu/valid-bundle-bytes "thumbs"))
                                                  (t2/select-one :model/CustomVizPlugin :id other-id))))
          (is (= ["Thumbs" "ops"] (t2/select-fn-vec :identifier :model/CustomVizPlugin :id [:in [id other-id]] {:order-by [[:id :asc]]}))))))))

(deftest load-renames-the-matched-plugin-test
  (testing "the plugin matched by its entity_id takes the file's identifier: the identifier is a name, not the identity"
    (let [bundle (cv.tu/valid-bundle-bytes "thumbs2")]
      (mt/with-temp [:model/CustomVizPlugin {id :id entity-id :entity_id} (active-plugin-row "thumbs" (cv.tu/valid-bundle-bytes "thumbs"))]
        (serdes/load-one! (ingested-plugin "thumbs2" bundle :entity_id entity-id) (t2/select-one :model/CustomVizPlugin :id id))
        (is (=? {:id id :entity_id entity-id :identifier "thumbs2" :display_name "thumbs2" :status :active}
                (t2/select-one :model/CustomVizPlugin :id id)))
        (testing "including a rename to its own identifier in another case"
          (serdes/load-one! (ingested-plugin "THUMBS2" (cv.tu/valid-bundle-bytes "THUMBS2") :entity_id entity-id)
                            (t2/select-one :model/CustomVizPlugin :id id))
          (is (= "THUMBS2" (t2/select-one-fn :identifier :model/CustomVizPlugin :id id))))
        (testing "but not to an identifier another plugin holds"
          (mt/with-temp [:model/CustomVizPlugin _ (active-plugin-row "ops" (cv.tu/valid-bundle-bytes "ops"))]
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"A custom viz plugin \"ops\" already exists on this instance"
                                  (serdes/load-one! (ingested-plugin "ops" (cv.tu/valid-bundle-bytes "ops") :entity_id entity-id)
                                                    (t2/select-one :model/CustomVizPlugin :id id))))
            (is (= "THUMBS2" (t2/select-one-fn :identifier :model/CustomVizPlugin :id id)))))))))

(deftest load-update-validates-bundle-test
  (testing "re-importing over an existing plugin re-validates the new bundle"
    (let [old-bundle (cv.tu/valid-bundle-bytes "updated-viz")
          new-bundle (cv.tu/valid-bundle-bytes "updated-viz" {:icon "star.svg"})]
      (mt/with-temp [:model/CustomVizPlugin {id :id} (assoc (active-plugin-row "updated-viz" old-bundle)
                                                            :status        :error
                                                            :error_message "stale")]
        (serdes/load-one! (ingested-plugin "updated-viz" new-bundle) (t2/select-one :model/CustomVizPlugin :id id))
        (is (=? {:id            id
                 :status        :active
                 :error_message nil
                 :icon          "star.svg"
                 :bundle_hash   (repacked-hash new-bundle)}
                (t2/select-one :model/CustomVizPlugin :id id)))))))

(deftest load-keeps-a-plugin-with-a-bitmap-icon-active-test
  (testing "a plugin exported with a bitmap icon, from before icons had to be SVG files, keeps working once imported"
    (let [bundle (cv.tu/valid-bundle-bytes "bitmap-viz" {:icon "icon.png"})]
      (testing "on insert"
        (mt/with-model-cleanup [:model/CustomVizPlugin]
          (serdes/load-one! (ingested-plugin "bitmap-viz" bundle) nil)
          (is (=? {:status :active :error_message nil}
                  (t2/select-one :model/CustomVizPlugin :identifier "bitmap-viz")))))
      (testing "on update over an active plugin"
        (mt/with-temp [:model/CustomVizPlugin {id :id} (active-plugin-row "bitmap-viz" bundle)]
          (serdes/load-one! (ingested-plugin "bitmap-viz" bundle) (t2/select-one :model/CustomVizPlugin :id id))
          (is (=? {:status :active :error_message nil}
                  (t2/select-one :model/CustomVizPlugin :id id))))))))

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
