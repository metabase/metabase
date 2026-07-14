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

(defn- snapshot
  [path->content & {:keys [sha] :or {sha fake-sha}}]
  {:sha        sha
   :list-files (fn [] (vec (keys path->content)))
   :read-file  (fn [p] (get path->content p))})

(defn- app-files
  [dir {:keys [name slug path bundle]}]
  {(format "data_apps/%s/data_app.yml" dir)
   (format "name: %s\nslug: %s\npath: %s\n" name slug path)
   (format "data_apps/%s/%s" dir path) bundle})

(deftest changed-count-tracks-content-not-sha-bumps-test
  (mt/with-model-cleanup [:model/DataApp]
    (let [files (app-files "a" {:name "A" :slug "a" :path "index.js" :bundle "V1"})]
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
                 (snapshot (app-files "a" {:name "A renamed" :slug "a" :path "index.js" :bundle "V1"}))))))
      (testing "a bundle content change counts"
        (is (=? {:changed 1}
                (data-app.sync/import-from-snapshot!
                 (snapshot (app-files "a" {:name "A renamed" :slug "a" :path "index.js" :bundle "V2"})))))))))

(deftest sync-across-repos-keeps-overrides-and-adds-test
  (testing "linking repo A, unlinking, then linking repo B: keep A-only apps, override shared slugs with B, add B-only apps"
    (mt/with-model-cleanup [:model/DataApp]
      ;; Repo A: Foo + Bar
      (data-app.sync/import-from-snapshot!
       (snapshot (merge (app-files "foo" {:name "Foo" :slug "foo" :path "index.js" :bundle "FOO"})
                        (app-files "bar" {:name "Bar A" :slug "bar" :path "index.js" :bundle "BAR-A"}))))
      (is (= #{"foo" "bar"} (t2/select-fn-set :name :model/DataApp)))
      ;; Unlinking A doesn't sync (nothing prunes). Linking repo B (Bar + Baz)
      ;; and importing it keeps Foo, overrides Bar by slug, and adds Baz.
      (data-app.sync/import-from-snapshot!
       (snapshot (merge (app-files "bar" {:name "Bar B" :slug "bar" :path "index.js" :bundle "BAR-B"})
                        (app-files "baz" {:name "Baz" :slug "baz" :path "index.js" :bundle "BAZ"}))))
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
       (snapshot (app-files "big" {:name "Big" :slug "big" :path "index.js"
                                   :bundle (oversized-bundle)})))
      (let [app (t2/select-one :model/DataApp :name "big")]
        (is (some? app) "the app still appears in the list")
        (is (nil? (:bundle app)) "no oversized bundle was cached")
        (is (str/includes? (:sync_error app) "MiB"))))))

(deftest oversized-resync-keeps-the-previous-bundle-test
  (testing "an oversized re-sync sets sync_error but keeps the last good bundle"
    (mt/with-model-cleanup [:model/DataApp]
      (data-app.sync/import-from-snapshot!
       (snapshot (app-files "app" {:name "App" :slug "app" :path "index.js" :bundle "GOOD"})))
      (data-app.sync/import-from-snapshot!
       (snapshot (app-files "app" {:name "App" :slug "app" :path "index.js"
                                   :bundle (oversized-bundle)})))
      (let [app (t2/select-one :model/DataApp :name "app")]
        (is (= "GOOD" (String. ^bytes (:bundle app) "UTF-8"))
            "the previously cached bundle is retained")
        (is (str/includes? (:sync_error app) "MiB"))))))
