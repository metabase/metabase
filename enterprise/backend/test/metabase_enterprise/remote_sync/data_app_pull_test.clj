(ns metabase-enterprise.remote-sync.data-app-pull-test
  "A remote-sync pull's outcome (the \"N changes\" summary the admin sees) must
  count data-app changes. Data apps live under `data_apps/` — outside serdes — and
  are materialized separately (`metabase-enterprise.data-apps.sync`), so without
  `impl/fold-data-app-changes` a pull whose only changes are data apps reports
  `pull-skipped` / `count 0`. These cover the three pull shapes: data-app-only,
  mixed (serdes + data apps), and serdes-only."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.test-helpers :as rs.test]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each rs.test/clean-remote-sync-state rs.test/commit-with-temp)

(defn- import-at!
  "Run `import!` against the source's snapshot at `version`, complete the task (so
  `last-version` advances for the next pull), and return the result."
  [src version & {:keys [force?] :or {force? false}}]
  (let [task   (t2/insert-returning-pk! :model/RemoteSyncTask
                                        {:sync_task_type "import" :initiated_by (mt/user->id :rasta)})
        result (impl/import! (source.p/snapshot-at src version) task :force? force?)]
    (impl/handle-task-result! result task)
    result))

(defn- app-tree
  "Repo files for one data app: its `data_app.yml` + a bundle at `dist/index.js`."
  [slug bundle]
  {(str "data_apps/" slug "/data_app.yml")  (str "name: " slug "\nslug: " slug "\npath: dist/index.js\n")
   (str "data_apps/" slug "/dist/index.js") bundle})

;; One self-contained serdes entity (a bare collection — no DB deps), used as the
;; "data" change. Reuses the path/content shape the mock harness imports cleanly.
(def ^:private coll-path
  "collections/M-Q4pcV0qkiyJ0kiSWECl_some_collection/M-Q4pcV0qkiyJ0kiSWECl_some_collection.yaml")
(def ^:private coll-file
  {coll-path (rs.test/generate-collection-yaml "M-Q4pcV0qkiyJ0kiSWECl" "Some Collection")})

(defn- pull-outcome!
  "Establish `v0` as the baseline, then pull `v1` (a normal, non-forced pull) and
  return its `:outcome`."
  [v0 v1]
  (let [src (rs.test/versioned-source :trees {"v0" v0 "v1" v1} :current "v0")]
    (is (= :success (:status (import-at! src "v0" :force? true))) "baseline import succeeds")
    (let [result (import-at! src "v1")]
      (is (= :success (:status result)) "pull succeeds")
      (:outcome result))))

(deftest data-app-only-pull-counts-app-changes-test
  (testing "a pull whose only change is a data app is reported as a real pull, not pull-skipped / 0 changes"
    (search.tu/with-index-disabled
      (mt/with-premium-features #{:data-apps}
        (mt/with-temporary-setting-values [remote-sync-type :read-write remote-sync-transforms false]
          (mt/with-model-cleanup [:model/DataApp]
            (let [outcome (pull-outcome! (app-tree "sales" "BUNDLE-V1")
                                         (app-tree "sales" "BUNDLE-V2"))]
              (is (= "pulled" (:kind outcome)) "not reported as skipped")
              (is (= 1 (:count outcome)) "the one changed data app is counted"))))))))

(deftest data-only-pull-excludes-unchanged-apps-test
  (testing "a serdes-only pull counts serdes content; unchanged data apps add nothing"
    (search.tu/with-index-disabled
      (mt/with-premium-features #{:data-apps}
        (mt/with-temporary-setting-values [remote-sync-type :read-write remote-sync-transforms false]
          (mt/with-model-cleanup [:model/DataApp :model/Collection]
            ;; v1 adds a collection; the data app is byte-for-byte the same as v0.
            (let [app     (app-tree "sales" "BUNDLE")
                  outcome (pull-outcome! app (merge coll-file app))]
              (is (= "pulled" (:kind outcome)))
              (is (= 1 (:count outcome)) "the collection counts; the unchanged app adds 0"))))))))

(deftest mixed-pull-counts-serdes-and-apps-test
  (testing "a mixed pull counts serdes content AND the changed data apps"
    (search.tu/with-index-disabled
      (mt/with-premium-features #{:data-apps}
        (mt/with-temporary-setting-values [remote-sync-type :read-write remote-sync-transforms false]
          (mt/with-model-cleanup [:model/DataApp :model/Collection]
            ;; v1 adds a collection AND changes the data app's bundle.
            (let [outcome (pull-outcome! (app-tree "ops" "BUNDLE")
                                         (merge coll-file (app-tree "ops" "BUNDLE-V2")))]
              (is (= "pulled" (:kind outcome)))
              (is (= 2 (:count outcome)) "the collection (1) plus the changed data app (1)"))))))))
