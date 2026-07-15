(ns metabase.transforms-rest.api.transform-runs-test
  "Tests for GET /api/transform/runs — the unified listing of root runs (job runs, manual
  DAG-reprocess runs, and standalone transform runs)."
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.transforms.test-util :refer [parse-instant utc-timestamp]]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- rows-by-type
  "Index the response rows by `[run_type id]` so assertions are immune to rows created by other
  tests (the listing is global)."
  [response]
  (into {} (map (juxt (juxt :run_type :id) identity)) (:data response)))

(defn- do-with-runs-fixture!
  "Call `f` with a map of fixture ids: a job run whose member ran `transform-a`, a DAG run seeded
  from (and whose member ran) `transform-b`, and a standalone run of `transform-a`."
  [f]
  (mt/with-temp [:model/Transform {ta-id :id} {:name "Transform A"}
                 :model/Transform {tb-id :id} {:name "Transform B"}
                 :model/TransformJob {job-id :id} {:name "Nightly Job" :schedule "0 0 0 * * ?"}
                 :model/TransformJobRun {job-run-id :id} {:job_id     job-id
                                                          :status     "succeeded"
                                                          :run_method "cron"
                                                          :start_time (parse-instant "2025-09-01T10:00:00")
                                                          :end_time   (parse-instant "2025-09-01T10:05:00")}
                 :model/TransformRun {member-a-id :id} {:transform_id ta-id
                                                        :job_run_id   job-run-id
                                                        :status       "succeeded"
                                                        :run_method   "cron"
                                                        :start_time   (parse-instant "2025-09-01T10:00:00")}
                 :model/TransformDagRun {dag-run-id :id} {:source_transform_id tb-id
                                                          :direction           "downstream"
                                                          :transform_count     4
                                                          :status              "failed"
                                                          :message             "boom"
                                                          :user_id             (mt/user->id :lucky)
                                                          :start_time          (parse-instant "2025-09-02T10:00:00")
                                                          :end_time            (parse-instant "2025-09-02T10:03:00")}
                 :model/TransformRun {member-b-id :id} {:transform_id tb-id
                                                        :dag_run_id   dag-run-id
                                                        :status       "failed"
                                                        :run_method   "manual"
                                                        :start_time   (parse-instant "2025-09-02T10:00:00")}
                 :model/TransformRun {standalone-id :id} {:transform_id ta-id
                                                          :status       "succeeded"
                                                          :run_method   "manual"
                                                          :user_id      (mt/user->id :lucky)
                                                          :start_time   (parse-instant "2025-09-03T10:00:00")
                                                          :end_time     (parse-instant "2025-09-03T10:01:00")}]
    (f {:ta-id ta-id, :tb-id tb-id, :job-id job-id, :job-run-id job-run-id, :dag-run-id dag-run-id
        :member-a-id member-a-id, :member-b-id member-b-id, :standalone-id standalone-id})))

(defmacro ^:private with-runs-fixture!
  "Execute `body` with `binding` bound to the fixture-id map of [[do-with-runs-fixture!]]."
  [[binding] & body]
  `(do-with-runs-fixture! (fn [~binding] ~@body)))

(defn- get-runs [& params]
  ;; a large limit so fixture rows can't be pushed off the page by rows other tests created
  (apply mt/user-http-request :lucky :get 200 "transform/runs" :limit 1000 params))

(deftest unified-runs-listing-test
  (testing "GET /api/transform/runs"
    (mt/with-data-analyst-role! (mt/user->id :lucky)
      (mt/with-premium-features #{:transforms-basic}
        (with-runs-fixture! [{:keys [ta-id tb-id job-id job-run-id dag-run-id member-a-id member-b-id standalone-id]}]
          (let [response (get-runs)
                rows     (rows-by-type response)]
            (testing "returns all three kinds of root run"
              (is (contains? rows ["job" job-run-id]))
              (is (contains? rows ["dag" dag-run-id]))
              (is (contains? rows ["transform" standalone-id])))
            (testing "member runs of a job/DAG run are not listed as rows"
              (is (not (contains? rows ["transform" member-a-id])))
              (is (not (contains? rows ["transform" member-b-id]))))
            (testing "pagination envelope"
              (is (<= 3 (:total response)))
              (is (pos? (:limit response)))
              (is (integer? (:offset response))))
            (testing "job row shape"
              (let [row (rows ["job" job-run-id])]
                (is (= job-id (:entity_id row)))
                (is (= "Nightly Job" (:name row)))
                (is (nil? (:direction row)))
                (is (nil? (:transform_count row)))
                (is (= "cron" (:run_method row)))
                (is (= "succeeded" (:status row)))
                (is (= (utc-timestamp "2025-09-01T10:00:00") (:start_time row)))
                (is (= (utc-timestamp "2025-09-01T10:05:00") (:end_time row)))))
            (testing "dag row shape"
              (let [row (rows ["dag" dag-run-id])]
                (is (= tb-id (:entity_id row)))
                (is (= "Transform B" (:name row)))
                (is (= "downstream" (:direction row)))
                (is (= 4 (:transform_count row)))
                (is (= "manual" (:run_method row)))
                (is (= "failed" (:status row)))
                (is (= "boom" (:message row)))
                (is (= (mt/user->id :lucky) (:user_id row)))))
            (testing "standalone transform row shape"
              (let [row (rows ["transform" standalone-id])]
                (is (= ta-id (:entity_id row)))
                (is (= "Transform A" (:name row)))
                (is (nil? (:direction row)))
                (is (= "manual" (:run_method row)))
                (is (= (mt/user->id :lucky) (:user_id row)))))))))))

(deftest unified-runs-filters-test
  (testing "GET /api/transform/runs filters"
    (mt/with-data-analyst-role! (mt/user->id :lucky)
      (mt/with-premium-features #{:transforms-basic}
        (with-runs-fixture! [{:keys [ta-id tb-id job-run-id dag-run-id standalone-id]}]
          (testing "types= restricts the kinds returned"
            (let [response (get-runs :types ["job"])]
              (is (every? #(= "job" (:run_type %)) (:data response)))
              (is (contains? (rows-by-type response) ["job" job-run-id])))
            (let [response (get-runs :types ["dag" "transform"])
                  rows     (rows-by-type response)]
              (is (every? #(contains? #{"dag" "transform"} (:run_type %)) (:data response)))
              (is (contains? rows ["dag" dag-run-id]))
              (is (contains? rows ["transform" standalone-id]))))
          (testing "statuses= filters across all kinds, matching any of the given statuses"
            (let [rows (rows-by-type (get-runs :statuses ["failed"]))]
              (is (contains? rows ["dag" dag-run-id]))
              (is (not (contains? rows ["job" job-run-id])))
              (is (not (contains? rows ["transform" standalone-id]))))
            (let [rows (rows-by-type (get-runs :statuses ["failed" "succeeded"]))]
              (is (contains? rows ["dag" dag-run-id]))
              (is (contains? rows ["job" job-run-id]))
              (is (contains? rows ["transform" standalone-id]))))
          (testing "run-methods= filters by trigger"
            (let [rows (rows-by-type (get-runs :run-methods ["cron"]))]
              (is (contains? rows ["job" job-run-id]))
              (is (not (contains? rows ["dag" dag-run-id])))
              (is (not (contains? rows ["transform" standalone-id]))))
            (let [rows (rows-by-type (get-runs :run-methods ["manual"]))]
              (is (contains? rows ["dag" dag-run-id]))
              (is (contains? rows ["transform" standalone-id]))
              (is (not (contains? rows ["job" job-run-id])))))
          (testing "transform-ids= returns runs that ran any of the transforms"
            (testing "job runs with a member run of it, plus its standalone runs"
              (let [rows (rows-by-type (get-runs :transform-ids [ta-id]))]
                (is (contains? rows ["job" job-run-id]))
                (is (contains? rows ["transform" standalone-id]))
                (is (not (contains? rows ["dag" dag-run-id])))))
            (testing "DAG runs with a member run of it"
              (let [rows (rows-by-type (get-runs :transform-ids [tb-id]))]
                (is (contains? rows ["dag" dag-run-id]))
                (is (not (contains? rows ["job" job-run-id])))
                (is (not (contains? rows ["transform" standalone-id])))))
            (testing "multiple ids match as a logical OR"
              (let [rows (rows-by-type (get-runs :transform-ids [ta-id tb-id]))]
                (is (contains? rows ["job" job-run-id]))
                (is (contains? rows ["dag" dag-run-id]))
                (is (contains? rows ["transform" standalone-id])))))
          (testing "start-time= filters by run start"
            (let [rows (rows-by-type (get-runs :start-time "2025-09-03"))]
              (is (contains? rows ["transform" standalone-id]))
              (is (not (contains? rows ["job" job-run-id])))
              (is (not (contains? rows ["dag" dag-run-id])))))
          (testing "end-time= filters by run end"
            (let [rows (rows-by-type (get-runs :end-time "2025-09-01"))]
              (is (contains? rows ["job" job-run-id]))
              (is (not (contains? rows ["dag" dag-run-id])))
              (is (not (contains? rows ["transform" standalone-id]))))))))))

(deftest unified-runs-sorting-and-pagination-test
  (testing "GET /api/transform/runs sorting and pagination"
    (mt/with-data-analyst-role! (mt/user->id :lucky)
      (mt/with-premium-features #{:transforms-basic}
        (with-runs-fixture! [{:keys [job-run-id dag-run-id standalone-id]}]
          (testing "sort-column=start_time asc keeps our rows in chronological order"
            (let [response (get-runs :sort-column "start_time" :sort-direction "asc")
                  ours     (filter (comp #{["job" job-run-id] ["dag" dag-run-id] ["transform" standalone-id]}
                                         (juxt :run_type :id))
                                   (:data response))]
              ;; rows from other tests may interleave; the relative order of ours must hold
              (is (= [["job" job-run-id] ["dag" dag-run-id] ["transform" standalone-id]]
                     (map (juxt :run_type :id) ours)))))
          (testing "limit/offset are honored"
            (let [response (mt/user-http-request :lucky :get 200 "transform/runs" :limit 1 :offset 0)]
              (is (= 1 (count (:data response))))
              (is (= 1 (:limit response)))
              (is (= 0 (:offset response)))
              (is (<= 3 (:total response))))))))))

(deftest unified-runs-deleted-entities-test
  (testing "GET /api/transform/runs keeps rows for deleted jobs/transforms, naming them from the run-start snapshot"
    (mt/with-data-analyst-role! (mt/user->id :lucky)
      (mt/with-premium-features #{:transforms-basic}
        (mt/with-temp [:model/Transform {ta-id :id} {:name "Doomed Transform"}
                       :model/Transform {tb-id :id} {:name "Doomed Seed"}
                       :model/TransformJob {job-id :id} {:name "Doomed Job" :schedule "0 0 0 * * ?"}
                       :model/TransformJobRun {job-run-id :id} {:job_id     job-id
                                                                :job_name   "Doomed Job"
                                                                :status     "succeeded"
                                                                :run_method "cron"
                                                                :start_time (parse-instant "2025-09-01T10:00:00")}
                       :model/TransformDagRun {dag-run-id :id} {:source_transform_id   tb-id
                                                                :source_transform_name "Doomed Seed"
                                                                :direction             "upstream"
                                                                :status                "succeeded"
                                                                :start_time            (parse-instant "2025-09-02T10:00:00")}
                       :model/TransformRun {standalone-id :id} {:transform_id   ta-id
                                                                :transform_name "Doomed Transform"
                                                                :status         "succeeded"
                                                                :run_method     "manual"
                                                                :start_time     (parse-instant "2025-09-03T10:00:00")}]
          (t2/delete! :model/TransformJob :id job-id)
          (t2/delete! :model/Transform :id [:in [ta-id tb-id]])
          (let [rows (rows-by-type (get-runs))]
            (testing "job run survives (job_id has no FK) with its snapshot name"
              (let [row (rows ["job" job-run-id])]
                (is (some? row))
                (is (= "Doomed Job" (:name row)))))
            (testing "DAG run survives (FK is SET NULL) with a nil entity_id and its snapshot name"
              (let [row (rows ["dag" dag-run-id])]
                (is (some? row))
                (is (nil? (:entity_id row)))
                (is (= "Doomed Seed" (:name row)))))
            (testing "standalone run survives (FK is SET NULL) with a nil entity_id and its snapshot name"
              (let [row (rows ["transform" standalone-id])]
                (is (some? row))
                (is (nil? (:entity_id row)))
                (is (= "Doomed Transform" (:name row)))))))))))

(deftest unified-runs-requires-data-analyst-test
  (testing "GET /api/transform/runs requires the data-analyst role"
    (mt/with-premium-features #{:transforms-basic}
      (mt/user-http-request :rasta :get 403 "transform/runs"))))
