(ns metabase.transforms-rest.api.transform-dag-run-test
  "Tests for the /api/transform-dag-run endpoints, plus the per-transform DAG endpoints on
  /api/transform/:id (previewing and triggering a DAG-reprocess run)."
  (:require
   [clojure.test :refer :all]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [metabase.transforms.test-util :refer [parse-instant utc-timestamp]]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; +------------------------------------------------------------------------------------------------------------------+
;;; |                                 GET /api/transform-dag-run/:run-id/transform-runs                                 |
;;; +------------------------------------------------------------------------------------------------------------------+

(deftest get-dag-run-transform-runs-test
  (testing "GET /api/transform-dag-run/:run-id/transform-runs"
    (mt/with-data-analyst-role! (mt/user->id :lucky)
      (mt/with-premium-features #{:transforms-basic}
        (mt/with-temp [:model/Transform {seed-id :id} {:name "Seed"}
                       :model/Transform {t1-id :id} {:name "TR1"}
                       :model/TransformDagRun {run-id :id} {:source_transform_id seed-id
                                                            :direction           "upstream"
                                                            :status              "succeeded"
                                                            :start_time          (parse-instant "2025-09-01T10:00:00")}
                       :model/TransformRun {tr1-id :id} {:transform_id   t1-id
                                                         :dag_run_id     run-id
                                                         :status         "succeeded"
                                                         :run_method     "manual"
                                                         :transform_name "TR1"
                                                         :start_time     (parse-instant "2025-09-01T10:00:00")
                                                         :end_time       (parse-instant "2025-09-01T10:02:00")}
                       :model/TransformRun {tr2-id :id} {:transform_id   seed-id
                                                         :dag_run_id     run-id
                                                         :status         "failed"
                                                         :run_method     "manual"
                                                         :transform_name "Seed"
                                                         :start_time     (parse-instant "2025-09-01T10:02:00")
                                                         :message        "Query failed"}
                       ;; a run of the same transform outside the DAG run must not leak in
                       :model/TransformRun _ {:transform_id   t1-id
                                              :status         "succeeded"
                                              :run_method     "manual"
                                              :transform_name "TR1"
                                              :start_time     (parse-instant "2025-08-01T10:00:00")}]
          (testing "returns the member runs, ordered by start_time ascending"
            (let [response (mt/user-http-request :lucky :get 200
                                                 (str "transform-dag-run/" run-id "/transform-runs"))]
              (is (= [tr1-id tr2-id] (map :id response)))
              (is (every? #(= run-id (:dag_run_id %)) response))))
          (testing "response shape"
            (let [response (mt/user-http-request :lucky :get 200
                                                 (str "transform-dag-run/" run-id "/transform-runs"))
                  tr1      (first (filter #(= tr1-id (:id %)) response))]
              (is (= t1-id (:transform_id tr1)))
              (is (= "manual" (:run_method tr1)))
              (is (= "succeeded" (:status tr1)))
              (is (= "TR1" (:transform_name tr1)))
              (is (= (utc-timestamp "2025-09-01T10:00:00") (:start_time tr1)))
              (is (= (utc-timestamp "2025-09-01T10:02:00") (:end_time tr1)))))
          (testing "returns 404 for a non-existent DAG run"
            (mt/user-http-request :lucky :get 404 "transform-dag-run/999999/transform-runs")))))))

(deftest get-dag-run-transform-runs-requires-read-permission-test
  (testing "GET /api/transform-dag-run/:run-id/transform-runs requires read permission on the seed transform"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temp [:model/Transform {seed-id :id} {:name "Seed"}
                     :model/TransformDagRun {run-id :id} {:source_transform_id seed-id
                                                          :direction           "upstream"
                                                          :status              "succeeded"
                                                          :start_time          (parse-instant "2025-09-01T10:00:00")}]
        (mt/user-http-request :rasta :get 403 (str "transform-dag-run/" run-id "/transform-runs"))))))

;;; +------------------------------------------------------------------------------------------------------------------+
;;; |                                     POST /api/transform-dag-run/:run-id/cancel                                    |
;;; +------------------------------------------------------------------------------------------------------------------+

(deftest cancel-dag-run-test
  (testing "POST /api/transform-dag-run/:run-id/cancel"
    (mt/with-data-analyst-role! (mt/user->id :lucky)
      (mt/with-premium-features #{:transforms-basic}
        ;; canceling write-checks the seed transform, which needs the transforms permission on its source DB
        (mt/with-db-perm-for-group! (perms-group/all-users) (mt/id) :perms/transforms :yes
          (testing "cancels an active DAG run and requests cancellation of its active members"
            (mt/with-temp [:model/Transform {seed-id :id} {:name "Seed"}
                           :model/Transform {t1-id :id} {:name "TR1"}
                           :model/TransformDagRun {run-id :id} {:source_transform_id seed-id
                                                                :direction           "upstream"
                                                                :status              "started"
                                                                :is_active           true
                                                                :start_time          (parse-instant "2025-09-01T10:00:00")}
                           :model/TransformRun {member-id :id} {:transform_id t1-id
                                                                :dag_run_id   run-id
                                                                :status       "started"
                                                                :is_active    true
                                                                :run_method   "manual"
                                                                :start_time   (parse-instant "2025-09-01T10:00:00")}]
              (mt/user-http-request :lucky :post 204 (str "transform-dag-run/" run-id "/cancel"))
              (let [run (t2/select-one :model/TransformDagRun :id run-id)]
                (is (= :canceled (:status run)))
                (is (nil? (:is_active run)))
                (is (some? (:end_time run))))
              (testing "a cancelation row is recorded for the still-running member"
                (is (t2/exists? :model/TransformRunCancelation :run_id member-id)))))
          (testing "returns 400 when the run has already finished"
            (mt/with-temp [:model/Transform {seed-id :id} {:name "Seed"}
                           :model/TransformDagRun {run-id :id} {:source_transform_id seed-id
                                                                :direction           "downstream"
                                                                :status              "succeeded"
                                                                :start_time          (parse-instant "2025-09-01T10:00:00")
                                                                :end_time            (parse-instant "2025-09-01T10:05:00")}]
              (mt/user-http-request :lucky :post 400 (str "transform-dag-run/" run-id "/cancel"))
              (is (= :succeeded (:status (t2/select-one :model/TransformDagRun :id run-id)))
                  "a finished run is never resurrected into a canceled state")))
          (testing "returns 404 for a non-existent DAG run"
            (mt/user-http-request :lucky :post 404 "transform-dag-run/999999/cancel")))))))

(deftest cancel-dag-run-requires-write-permission-test
  (testing "POST /api/transform-dag-run/:run-id/cancel requires write permission on the seed transform"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temp [:model/Transform {seed-id :id} {:name "Seed"}
                     :model/TransformDagRun {run-id :id} {:source_transform_id seed-id
                                                          :direction           "upstream"
                                                          :status              "started"
                                                          :is_active           true
                                                          :start_time          (parse-instant "2025-09-01T10:00:00")}]
        (mt/user-http-request :rasta :post 403 (str "transform-dag-run/" run-id "/cancel"))))))

;;; +------------------------------------------------------------------------------------------------------------------+
;;; |                                      GET /api/transform/:id/dag-transforms                                        |
;;; +------------------------------------------------------------------------------------------------------------------+

(deftest dag-transforms-preview-test
  (testing "GET /api/transform/:id/dag-transforms"
    (mt/with-data-analyst-role! (mt/user->id :lucky)
      (mt/with-premium-features #{:transforms-basic}
        ;; consumer reads producer's output table via the stored table_dependencies column, so the
        ;; dependency graph resolves without parsing any queries
        (mt/with-temp [:model/Transform {producer-id :id} {:name               "Producer"
                                                           :target_table_id    (mt/id :orders)
                                                           :table_dependencies []}
                       :model/Transform {consumer-id :id} {:name               "Consumer"
                                                           :table_dependencies [{:table (mt/id :orders)}]}]
          (testing "upstream preview returns the dependency closure in execution order"
            (is (= [{:id producer-id :name "Producer"}
                    {:id consumer-id :name "Consumer"}]
                   (mt/user-http-request :lucky :get 200 (str "transform/" consumer-id "/dag-transforms")
                                         :direction "upstream"))))
          (testing "upstream preview of a transform with no dependencies is just itself"
            (is (= [{:id producer-id :name "Producer"}]
                   (mt/user-http-request :lucky :get 200 (str "transform/" producer-id "/dag-transforms")
                                         :direction "upstream"))))
          (testing "downstream preview returns the dependents closure in execution order"
            (is (= [{:id producer-id :name "Producer"}
                    {:id consumer-id :name "Consumer"}]
                   (mt/user-http-request :lucky :get 200 (str "transform/" producer-id "/dag-transforms")
                                         :direction "downstream"))))
          (testing "direction is required and validated"
            (mt/user-http-request :lucky :get 400 (str "transform/" consumer-id "/dag-transforms"))
            (mt/user-http-request :lucky :get 400 (str "transform/" consumer-id "/dag-transforms")
                                  :direction "sideways"))
          (testing "returns 404 for a non-existent transform"
            (mt/user-http-request :lucky :get 404 "transform/999999/dag-transforms"
                                  :direction "upstream")))))))

;;; +------------------------------------------------------------------------------------------------------------------+
;;; |                                         POST /api/transform/:id/run-dag                                           |
;;; +------------------------------------------------------------------------------------------------------------------+

(deftest run-dag-already-running-test
  (testing "POST /api/transform/:id/run-dag returns 202 with a nil dag_run_id when a DAG run is already in progress"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temp [:model/Transform {tid :id} {:name "Seed"}
                     :model/TransformDagRun _ {:source_transform_id tid
                                               :direction           "upstream"
                                               :status              "started"
                                               :is_active           true
                                               :start_time          (parse-instant "2025-09-01T10:00:00")}]
        (let [response (mt/user-http-request :crowberto :post 202 (str "transform/" tid "/run-dag")
                                             {:direction "upstream"})]
          (is (nil? (:dag_run_id response))))))))

(deftest run-dag-validates-direction-test
  (testing "POST /api/transform/:id/run-dag requires a valid direction"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temp [:model/Transform {tid :id} {:name "Seed"}]
        (mt/user-http-request :crowberto :post 400 (str "transform/" tid "/run-dag") {})
        (mt/user-http-request :crowberto :post 400 (str "transform/" tid "/run-dag")
                              {:direction "sideways"})))))

(deftest run-dag-requires-write-permission-test
  (testing "POST /api/transform/:id/run-dag requires write permission on the transform"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temp [:model/Transform {tid :id} {:name "Seed"}]
        (mt/user-http-request :rasta :post 403 (str "transform/" tid "/run-dag")
                              {:direction "upstream"})))))
