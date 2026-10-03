(ns metabase-enterprise.remote-sync.export-preflight-test
  "The export preflight (`impl/preview-export-merge`) serializes only the local entities that the remote changed. These
  tests check that it still finds the conflicts and the remote changes of models other than cards, and of a file with
  no serdes identity (a data app bundle)."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.cost-test-util :as cost]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.models.remote-sync-task :as remote-sync.task]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.test-helpers :as rs.test]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each rs.test/clean-remote-sync-state rs.test/commit-with-temp)

(defn- edit-file
  "`tree` with `f` applied to the content of the one file whose path matches `re`."
  [tree re f]
  (let [paths (filter #(re-find re %) (keys tree))]
    (assert (= 1 (count paths)) (str "expected one file for " re ", got " (vec paths)))
    (update tree (first paths) f)))

(defn- preview!
  "The preflight result when the remote is `v1` and the last sync was `v0`."
  [v0 v1]
  (let [src (rs.test/versioned-source :trees {"v0" v0 "v1" v1} :current "v1")]
    (mt/with-dynamic-fn-redefs [remote-sync.task/last-version (constantly "v0")
                                source/source-from-settings   (constantly src)]
      (impl/preview-export-merge "main"))))

(deftest document-edited-on-both-sides-conflicts-test
  (testing "a document that the remote and the instance both changed is a conflict"
    (mt/with-temporary-setting-values [remote-sync-type :read-write]
      (mt/with-temp [:model/Collection {coll-id :id} {:name "Synced" :location "/" :is_remote_synced true}
                     :model/Document {doc-id :id} {:name "Plan" :collection_id coll-id :creator_id (mt/user->id :rasta)}]
        (let [v0 (cost/synced-tree)
              v1 (edit-file v0 #"plan\.yaml$" #(str/replace % "name: Plan" "name: Remote plan"))]
          (t2/update! :model/Document doc-id {:name "Local plan"})
          (is (=? {:clean? false :conflicts [#"Local plan .*"]} (preview! v0 v1))))))))

(deftest transform-edited-on-both-sides-conflicts-test
  (testing "a transform that the remote and the instance both changed is a conflict"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temporary-setting-values [remote-sync-type :read-write remote-sync-transforms true]
        (mt/with-temp [:model/Transform {transform-id :id} {:name   "Nightly"
                                                            :source {:type  "query"
                                                                     :query {:database (mt/id)
                                                                             :type     :query
                                                                             :query    {:source-table (mt/id :venues)}}}
                                                            :target {:database (mt/id)
                                                                     :type     "table"
                                                                     :schema   "public"
                                                                     :name     "nightly_target"}}]
          (let [v0 (cost/synced-tree)
                v1 (edit-file v0 #"nightly\.yaml$" #(str/replace % "name: Nightly" "name: Remote nightly"))]
            (t2/update! :model/Transform transform-id {:name "Local nightly"})
            (is (=? {:clean? false :conflicts [#"Local nightly .*"]} (preview! v0 v1)))))))))

(deftest data-app-bundle-edited-remotely-is-a-clean-update-test
  (testing "a remote edit of a data app bundle (a file with no serdes identity) is a clean update, not a conflict"
    (search.tu/with-index-disabled
      (mt/with-premium-features #{:data-apps}
        (mt/with-temporary-setting-values [remote-sync-type :read-write remote-sync-transforms false]
          (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
            (mt/user-http-request :crowberto :post 200 "apps" {:name         "sales"
                                                               :display_name "Sales"
                                                               :bundle_path  "dist/index.js"
                                                               :bundle       "BUNDLE"})
            (let [v0 (cost/synced-tree)
                  v1 (edit-file v0 #"^data_apps/sales/dist/index\.js$" (constantly "BUNDLE-REMOTE"))]
              (is (=? {:clean? true :conflicts [] :summary {:added 0 :updated 1 :removed 0}}
                      (preview! v0 v1))))))))))
