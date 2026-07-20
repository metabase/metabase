(ns metabase-enterprise.data-apps.sync-test
  "Unit coverage for the materialization edge cases not exercised through the API
   suite: the `:changed` accounting (content vs. sha/timestamp bumps) and the
   oversized-bundle guard (rejected with a sync_error, previously cached bundle
   retained)."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.sync :as data-app.sync]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private fake-sha "0123456789abcdef0123456789abcdef01234567")

(defn- child-names
  "The immediate children of `dir` implied by `paths` — the flat-map stand-in for the real snapshot's
   single-subtree read."
  [paths dir]
  (let [prefix (if (str/blank? dir) "" (str dir "/"))]
    (->> paths
         (keep #(when (str/starts-with? % prefix)
                  (first (str/split (subs % (count prefix)) #"/"))))
         distinct
         sort
         vec)))

(defn- snapshot
  [path->content & {:keys [sha] :or {sha fake-sha}}]
  {:sha       sha
   :list-dir  (fn [dir] (child-names (keys path->content) dir))
   :read-file (fn [p] (get path->content p))})

(defn- app-files
  "The repo files for one app in `data_apps/<dir>`. `dir` is the app's slug — the
   config declares no slug, it is the directory's name."
  [dir {:keys [name path bundle]}]
  {(format "data_apps/%s/data_app.yaml" dir)
   (format "name: %s\npath: %s\n" name path)
   (format "data_apps/%s/%s" dir path) bundle})

(deftest changed-count-tracks-content-not-sha-bumps-test
  (mt/with-model-cleanup [:model/DataApp]
    (let [files (app-files "a" {:name "A" :path "index.js" :bundle "V1"})]
      (testing "the first sync counts the new app"
        (is (=? {:synced 1 :changed 1}
                (data-app.sync/import-from-snapshot! (snapshot files)))))
      (testing "re-syncing identical content at a new sha is not a change"
        (is (=? {:synced 1 :changed 0}
                (data-app.sync/import-from-snapshot!
                 (snapshot files :sha "ffffffffffffffffffffffffffffffffffffffff")))))
      (testing "a metadata-only change counts"
        (is (=? {:changed 1}
                (data-app.sync/import-from-snapshot!
                 (snapshot (app-files "a" {:name "A renamed" :path "index.js" :bundle "V1"}))))))
      (testing "a bundle content change counts"
        (is (=? {:changed 1}
                (data-app.sync/import-from-snapshot!
                 (snapshot (app-files "a" {:name "A renamed" :path "index.js" :bundle "V2"})))))))))

(deftest switching-repos-prunes-old-apps-overrides-shared-adds-new-test
  (testing "syncing a different repo: drop apps only the old repo had, override shared slugs, add new ones"
    (mt/with-model-cleanup [:model/DataApp]
      ;; Repo A: Foo + Bar
      (data-app.sync/import-from-snapshot!
       (snapshot (merge (app-files "foo" {:name "Foo" :path "index.js" :bundle "FOO"})
                        (app-files "bar" {:name "Bar A" :path "index.js" :bundle "BAR-A"}))))
      (is (= #{"foo" "bar"} (t2/select-fn-set :name :model/DataApp)))
      ;; Repo B (Bar + Baz): the repo is the source of truth, so Foo (absent from B)
      ;; is pruned, Bar is overridden by slug, and Baz is added.
      (is (=? {:synced 2 :removed 1}
              (data-app.sync/import-from-snapshot!
               (snapshot (merge (app-files "bar" {:name "Bar B" :path "index.js" :bundle "BAR-B"})
                                (app-files "baz" {:name "Baz" :path "index.js" :bundle "BAZ"}))))))
      (is (= #{"bar" "baz"} (t2/select-fn-set :name :model/DataApp))
          "Foo (only in repo A) is dropped; Baz (from repo B) is added")
      (let [bar (t2/select-one :model/DataApp :name "bar")]
        (is (= "Bar B" (:display_name bar))
            "Bar is overridden in place by repo B (shared slug)")
        (is (= "BAR-B" (String. ^bytes (:bundle bar) "UTF-8"))
            "Bar's cached bundle is repo B's")))))

(deftest an-empty-repo-prunes-all-apps-test
  (testing "syncing a repo with no data_apps/ removes every app (the repo has none)"
    (mt/with-model-cleanup [:model/DataApp]
      (data-app.sync/import-from-snapshot!
       (snapshot (app-files "solo" {:name "Solo" :path "index.js" :bundle "S"})))
      (is (= #{"solo"} (t2/select-fn-set :name :model/DataApp)))
      (is (=? {:synced 0 :removed 1}
              (data-app.sync/import-from-snapshot! (snapshot {}))))
      (is (empty? (t2/select-fn-set :name :model/DataApp))))))

(deftest a-broken-config-does-not-prune-the-existing-app-test
  (testing "a directory that still exists but whose data_app.yaml is now broken keeps the app (as a sync_error), it is not pruned"
    (mt/with-model-cleanup [:model/DataApp]
      (data-app.sync/import-from-snapshot!
       (snapshot (app-files "app" {:name "App" :path "index.js" :bundle "GOOD"})))
      (is (= "GOOD" (String. ^bytes (:bundle (t2/select-one :model/DataApp :name "app")) "UTF-8")))
      ;; Same directory, but its config no longer parses. The dir is still present,
      ;; so the app is kept — not treated as a removal — and its cached bundle stays.
      (let [result (data-app.sync/import-from-snapshot!
                    (snapshot {"data_apps/app/data_app.yaml" "name: App\n" ; missing required "path"
                               "data_apps/app/index.js"       "GOOD"}))]
        (is (=? {:removed 0} result) "the app is not pruned")
        (is (= 1 (count (:config-errors result))))
        (is (=? {:changed 1} result)
            "marking the app failed counts as a change, so the pull isn't reported as a no-op"))
      (let [app (t2/select-one :model/DataApp :name "app")]
        (is (some? app) "the app survives a transiently broken config")
        (is (= "GOOD" (String. ^bytes (:bundle app) "UTF-8"))
            "its last-good cached bundle is retained")
        (is (str/includes? (:sync_error app) "path")
            "the parse failure is recorded on the row, so the UI shows it as failed rather than freshly synced")))))

(deftest a-broken-config-for-a-brand-new-app-materializes-nothing-test
  (testing "an app whose config never parsed has no row to mark — it simply isn't materialized"
    (mt/with-model-cleanup [:model/DataApp]
      (let [result (data-app.sync/import-from-snapshot!
                    (snapshot {"data_apps/newbie/data_app.yaml" "name: Newbie\n" ; missing required "path"
                               "data_apps/newbie/index.js"      "X"}))]
        (is (= 1 (count (:config-errors result))))
        (is (=? {:synced 0 :changed 0 :removed 0} result))
        (is (empty? (t2/select-fn-set :name :model/DataApp)))))))

(defn- oversized-bundle ^String []
  (.repeat "a" (int (inc data-app.sync/max-bundle-bytes))))

(deftest oversized-bundle-is-rejected-test
  (testing "a bundle over the size cap is rejected with a sync_error, no bundle cached"
    (mt/with-model-cleanup [:model/DataApp]
      (data-app.sync/import-from-snapshot!
       (snapshot (app-files "big" {:name "Big" :path "index.js"
                                   :bundle (oversized-bundle)})))
      (let [app (t2/select-one :model/DataApp :name "big")]
        (is (some? app) "the app still appears in the list")
        (is (nil? (:bundle app)) "no oversized bundle was cached")
        (is (str/includes? (:sync_error app) "MiB"))))))

(deftest oversized-resync-keeps-the-previous-bundle-test
  (testing "an oversized re-sync sets sync_error but keeps the last good bundle"
    (mt/with-model-cleanup [:model/DataApp]
      (data-app.sync/import-from-snapshot!
       (snapshot (app-files "app" {:name "App" :path "index.js" :bundle "GOOD"})))
      (data-app.sync/import-from-snapshot!
       (snapshot (app-files "app" {:name "App" :path "index.js"
                                   :bundle (oversized-bundle)})))
      (let [app (t2/select-one :model/DataApp :name "app")]
        (is (= "GOOD" (String. ^bytes (:bundle app) "UTF-8"))
            "the previously cached bundle is retained")
        (is (str/includes? (:sync_error app) "MiB"))))))

(deftest a-directory-without-a-config-is-not-an-app-test
  (testing "a data_apps/<dir> that ships a bundle but no data_app.yaml is not discovered — no app, no error"
    (mt/with-model-cleanup [:model/DataApp]
      (let [result (data-app.sync/import-from-snapshot!
                    (snapshot {"data_apps/orphan/index.js" "BUNDLE"}))]
        (is (=? {:synced 0 :changed 0 :config-errors []} result))
        (is (empty? (t2/select-fn-set :name :model/DataApp)))))))

(deftest an-unreadable-config-is-a-config-error-test
  (testing "a data_app.yaml the snapshot lists but can't read is isolated as a config-error, not a crash"
    (mt/with-model-cleanup [:model/DataApp]
      ;; the config is listed in the tree, but reading its blob yields nothing
      (let [result (data-app.sync/import-from-snapshot!
                    (snapshot {"data_apps/ghost/data_app.yaml" nil}))]
        (is (= 1 (count (:config-errors result))))
        (is (str/includes? (first (:config-errors result)) "data_apps/ghost/data_app.yaml"))
        (is (empty? (t2/select-fn-set :name :model/DataApp)))))))
