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

(defn- config-only
  "A snapshot file map with the app's data_app.yml but NO bundle file, so the
   bundle read fails and the app syncs with a sync_error."
  [dir {:keys [name slug path]}]
  {(format "data_apps/%s/data_app.yml" dir)
   (format "name: %s\nslug: %s\npath: %s\n" name slug path)})

(defn- app-files+hosts
  "Like `app-files`, but its data_app.yml also declares `allowed_hosts`."
  [dir {:keys [name slug path bundle allowed-hosts]}]
  {(format "data_apps/%s/data_app.yml" dir)
   (apply str (format "name: %s\nslug: %s\npath: %s\nallowed_hosts:\n" name slug path)
          (map #(format "  - %s\n" %) allowed-hosts))
   (format "data_apps/%s/%s" dir path) bundle})

(deftest changed-count-tracks-failure-transitions-test
  (testing "the :changed count reflects failure/recovery transitions, not just content"
    (mt/with-model-cleanup [:model/DataApp]
      (let [failing (snapshot (config-only "a" {:name "A" :slug "a" :path "index.js"}))
            working (snapshot (app-files "a" {:name "A" :slug "a" :path "index.js" :bundle "V1"}))]
        (testing "an app whose bundle is missing fails and counts as a change"
          (is (=? {:synced 1 :changed 1} (data-app.sync/import-from-snapshot! failing)))
          (is (some? (:sync_error (t2/select-one :model/DataApp :name "a")))))
        (testing "re-failing with the identical error is NOT a change"
          (is (=? {:synced 1 :changed 0} (data-app.sync/import-from-snapshot! failing))))
        (testing "recovering to a working bundle counts as a change and clears the error"
          (is (=? {:synced 1 :changed 1} (data-app.sync/import-from-snapshot! working)))
          (is (nil? (:sync_error (t2/select-one :model/DataApp :name "a")))))
        (testing "re-syncing the recovered app with identical content is not a change"
          (is (=? {:changed 0} (data-app.sync/import-from-snapshot! working))))))))

(deftest changed-count-tracks-allowed-hosts-test
  (testing "an allowed_hosts-only change (same bundle/metadata) still counts as changed"
    (mt/with-model-cleanup [:model/DataApp]
      (data-app.sync/import-from-snapshot!
       (snapshot (app-files "a" {:name "A" :slug "a" :path "index.js" :bundle "V1"})))
      (is (=? {:changed 1}
              (data-app.sync/import-from-snapshot!
               (snapshot (app-files+hosts "a" {:name "A" :slug "a" :path "index.js" :bundle "V1"
                                               :allowed-hosts ["https://api.example.com"]}))))
          "adding a host is a content change even though the bundle is identical")
      (is (= ["https://api.example.com"]
             (:allowed_hosts (t2/select-one :model/DataApp :name "a")))))))

(deftest sync-from-snapshot!-swallows-a-thrown-import-test
  (testing "a duplicate-slug snapshot makes import throw; sync-from-snapshot! swallows it and returns nil"
    (mt/with-model-cleanup [:model/DataApp]
      (is (nil? (data-app.sync/sync-from-snapshot!
                 (snapshot (merge (app-files "one" {:name "One" :slug "dup" :path "a.js" :bundle "A"})
                                  (app-files "two" {:name "Two" :slug "dup" :path "b.js" :bundle "B"}))))))
      (is (empty? (t2/select-fn-set :name :model/DataApp))
          "the throwing sync materialized nothing"))))

(deftest unreadable-config-becomes-a-config-error-test
  (testing "a listed config path that can't be read is isolated as a config-error, not a crash"
    (mt/with-model-cleanup [:model/DataApp]
      (let [result (data-app.sync/import-from-snapshot!
                    {:sha        fake-sha
                     :list-files (fn [] ["data_apps/ghost/data_app.yml"])
                     :read-file  (fn [_] nil)})]
        (is (= 1 (count (:config-errors result))))
        (is (str/includes? (first (:config-errors result)) "data_apps/ghost/data_app.yml"))
        (is (empty? (t2/select-fn-set :name :model/DataApp)))))))

(deftest nested-config-paths-are-not-discovered-test
  (testing "only data_apps/<dir>/data_app.yml is discovered; a deeper nested path is ignored"
    (mt/with-model-cleanup [:model/DataApp]
      (let [result (data-app.sync/import-from-snapshot!
                    {:sha        fake-sha
                     :list-files (fn [] ["data_apps/a/b/data_app.yml"])
                     :read-file  (fn [_] "name: A\nslug: a\npath: index.js\n")})]
        (is (=? {:synced 0 :changed 0 :config-errors []} result))
        (is (empty? (t2/select-fn-set :name :model/DataApp)))))))
