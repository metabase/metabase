(ns ^:synchronized metabase-enterprise.content-diagnostics.transforms-test
  "End-to-end (scan → API) coverage of the transform stale findings the Content Diagnostics UI lists:
  run-based staleness through the real checker, schedule awareness, archived folders, and the
  delete → invalidate → 404 lifecycle. The query-level staleness rules are covered in
  `metabase.transforms.models.transform-test/find-stale-query-test`."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.content-diagnostics.scan :as scan]
   [metabase-enterprise.content-diagnostics.settings :as cd.settings]
   [metabase-enterprise.content-diagnostics.test-util :as cd.tu]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(use-fixtures :each cd.tu/with-authorized-reader!)

(defn- days-ago [n]
  (t/minus (t/offset-date-time) (t/days n)))

(defn- insert-run!
  [transform-id started-at]
  (t2/insert! :model/TransformRun {:transform_id transform-id
                                   :status       :succeeded
                                   :run_method   :manual
                                   :start_time   started-at
                                   :end_time     started-at}))

(defn- stale-findings-by-transform!
  "Scan, then index this scan's `:stale` transform findings by transform id."
  []
  (let [scan-id (:scan_id (scan/scan!))]
    (t2/select-fn->fn :entity_id identity :model/ContentDiagnosticsFinding
                      :scan_id scan-id :finding_type :stale :entity_type :transform)))

(deftest stale-transforms-by-last-run-test
  (testing "TR-1/TR-2/TR-5/TR-13/TR-14: stale transforms are found by last run - folder state and
            unscheduled-ness aside - and a transform between cron fires is not"
    (mt/with-premium-features #{:content-diagnostics :advanced-permissions :transforms-basic :hosting}
      (mt/with-temporary-setting-values [content-diagnostics-stale-threshold-days 90]
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (let [old-days   (+ (cd.settings/content-diagnostics-stale-threshold-days) 30)
                ;; fires once a year, ~2 months from now: nothing has fired since a run `old-days` ago
                anchor     (t/plus (t/local-date) (t/months 2))
                yearly     (format "0 0 0 15 %d ?" (t/as anchor :month-of-year))]
            (mt/with-temp [:model/Collection   {archived-folder :id} {:namespace "transforms" :archived true}
                           :model/Transform    {shelved :id}     {:collection_id archived-folder}
                           :model/Transform    {unscheduled :id} {}
                           :model/Transform    {scheduled :id}   {}
                           :model/Transform    {fresh :id}       {}
                           :model/TransformTag {tag-id :id}      {}
                           :model/TransformJob {job-id :id}      {:name "yearly job" :schedule yearly}
                           :model/TransformJobTransformTag _     {:job_id job-id :tag_id tag-id :position 0}
                           :model/TransformTransformTag _        {:transform_id scheduled :tag_id tag-id :position 0}]
              (run! #(insert-run! % (days-ago old-days)) [shelved unscheduled scheduled])
              (insert-run! fresh (days-ago 1))
              (let [findings (stale-findings-by-transform!)]
                (testing "TR-1/TR-2: stale transform in an archived folder is reported, anchored on its last run"
                  (is (some? (:last_active_at (findings shelved)))))
                (testing "TR-5/TR-13: an unscheduled transform whose last run is old is reported"
                  (is (some? (:last_active_at (findings unscheduled)))))
                (testing "TR-14: a scheduled transform between cron fires is not stale"
                  (is (nil? (findings scheduled))))
                (testing "a recently run transform is not stale"
                  (is (nil? (findings fresh))))))))))))

(deftest delete-transform-drops-its-stale-finding-test
  (testing "TR-11/TR-12: DELETE /api/transform/:id removes the transform (404) and drops its finding from /stale"
    (mt/with-premium-features #{:content-diagnostics :advanced-permissions :transforms-basic :hosting}
      (mt/with-temporary-setting-values [content-diagnostics-stale-threshold-days 90]
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp [:model/Transform {xf-id :id} {:name (str "cd-" (mt/random-name))}]
            (insert-run! xf-id (days-ago (+ (cd.settings/content-diagnostics-stale-threshold-days) 30)))
            (let [nm     (t2/select-one-fn :name :model/Transform :id xf-id)
                  listed (fn [] (into #{} (map :entity_id)
                                      (:data (mt/user-http-request :crowberto :get 200
                                                                   "ee/content-diagnostics/stale"
                                                                   :entity-types "transform" :query nm))))]
              (is (contains? (stale-findings-by-transform!) xf-id))
              (is (= #{xf-id} (listed)))
              (mt/user-http-request :crowberto :delete 204 (str "transform/" xf-id))
              (mt/user-http-request :crowberto :get 404 (str "transform/" xf-id))
              (is (= #{} (listed)))
              (is (some? (:invalidated_at (t2/select-one :model/ContentDiagnosticsFinding
                                                         :entity_type :transform :entity_id xf-id
                                                         :finding_type :stale)))))))))))
