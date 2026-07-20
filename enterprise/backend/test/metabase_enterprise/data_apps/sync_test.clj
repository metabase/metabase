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
  (let [prefix (str dir "/")]
    (distinct (keep #(when (str/starts-with? % prefix)
                       (first (str/split (subs % (count prefix)) #"/")))
                    paths))))

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

(deftest sync-across-repos-keeps-overrides-and-adds-test
  (testing "linking repo A, unlinking, then linking repo B: keep A-only apps, override shared slugs with B, add B-only apps"
    (mt/with-model-cleanup [:model/DataApp]
      ;; Repo A: Foo + Bar
      (data-app.sync/import-from-snapshot!
       (snapshot (merge (app-files "foo" {:name "Foo" :path "index.js" :bundle "FOO"})
                        (app-files "bar" {:name "Bar A" :path "index.js" :bundle "BAR-A"}))))
      (is (= #{"foo" "bar"} (t2/select-fn-set :name :model/DataApp)))
      ;; Unlinking A doesn't sync (nothing prunes). Linking repo B (Bar + Baz)
      ;; and importing it keeps Foo, overrides Bar by slug, and adds Baz.
      (data-app.sync/import-from-snapshot!
       (snapshot (merge (app-files "bar" {:name "Bar B" :path "index.js" :bundle "BAR-B"})
                        (app-files "baz" {:name "Baz" :path "index.js" :bundle "BAZ"}))))
      (is (= #{"foo" "bar" "baz"} (t2/select-fn-set :name :model/DataApp))
          "Foo (from repo A) is kept and Baz (from repo B) is added")
      (is (= "Foo" (:display_name (t2/select-one :model/DataApp :name "foo")))
          "Foo is untouched by repo B")
      (let [bar (t2/select-one :model/DataApp :name "bar")]
        (is (= "Bar B" (:display_name bar))
            "Bar is overridden in place by repo B (slug conflict)")
        (is (= "BAR-B" (String. ^bytes (:bundle bar) "UTF-8"))
            "Bar's cached bundle is repo B's")))))

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
