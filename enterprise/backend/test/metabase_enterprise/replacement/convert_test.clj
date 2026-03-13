(ns ^:mb/driver-tests metabase-enterprise.replacement.convert-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.dependencies.events]
   [metabase-enterprise.replacement.models.replacement-run :as replacement-run]
   [metabase-enterprise.replacement.timeout :as replacement.timeout]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.transforms.test-dataset :as transforms-dataset]
   [metabase.transforms.test-util :refer [with-transform-cleanup!]]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ model layer ------------------------------------------------

(deftest create-run-with-run-type-test
  (testing "5-arity defaults to :replace run_type"
    (mt/with-model-cleanup [:model/ReplacementRun]
      (let [run (replacement-run/create-run! :card 1 :card 2 (mt/user->id :crowberto))]
        (is (= :replace (:run_type run))))))
  (testing "6-arity accepts explicit run_type"
    (mt/with-model-cleanup [:model/ReplacementRun]
      (let [run (replacement-run/create-run! :card 1 :card 2 (mt/user->id :crowberto) :convert-to-transform)]
        (is (= :convert-to-transform (:run_type run)))))))

(deftest list-runs-test
  (mt/with-model-cleanup [:model/ReplacementRun]
    (let [run1 (replacement-run/create-run! :card 1 :card 2 (mt/user->id :crowberto))
          run2 (replacement-run/create-run! :card 3 :card 4 (mt/user->id :crowberto) :convert-to-transform)]
      ;; Start run2 so it's active
      (replacement-run/start-run! (:id run2))
      (testing "lists all runs"
        (let [runs (replacement-run/list-runs)]
          (is (>= (count runs) 2))
          (is (some #(= (:id run1) (:id %)) runs))
          (is (some #(= (:id run2) (:id %)) runs))))
      (testing "filters to active runs only"
        (let [runs (replacement-run/list-runs :is-active true)]
          (is (every? :is_active runs))
          (is (some #(= (:id run2) (:id %)) runs))
          (is (not (some #(= (:id run1) (:id %)) runs))))))))

(deftest update-target-test
  (mt/with-model-cleanup [:model/ReplacementRun]
    (let [run (replacement-run/create-run! :card 1 :card 1 (mt/user->id :crowberto) :convert-to-transform)]
      (replacement-run/update-target! (:id run) :table 42)
      (let [updated (t2/select-one :model/ReplacementRun :id (:id run))]
        (is (= :table (:target_entity_type updated)))
        (is (= 42 (:target_entity_id updated)))))))

(deftest update-transform-id-test
  (mt/with-model-cleanup [:model/ReplacementRun]
    (let [run (replacement-run/create-run! :card 1 :card 1 (mt/user->id :crowberto) :convert-to-transform)]
      (is (nil? (:transform_id run)))
      (replacement-run/update-transform-id! (:id run) 42)
      (let [updated (t2/select-one :model/ReplacementRun :id (:id run))]
        (is (= 42 (:transform_id updated)))))))

(deftest failed-runs-with-transforms-test
  (mt/with-model-cleanup [:model/ReplacementRun]
    (let [failed-rwt    (replacement-run/create-run! :card 1 :card 1 (mt/user->id :crowberto) :convert-to-transform)
          failed-replace (replacement-run/create-run! :card 2 :card 3 (mt/user->id :crowberto))
          ok-rwt         (replacement-run/create-run! :card 4 :card 4 (mt/user->id :crowberto) :convert-to-transform)]
      ;; Start and fail the convert-to-transform run with a transform_id
      (replacement-run/start-run! (:id failed-rwt))
      (replacement-run/update-transform-id! (:id failed-rwt) 100)
      (replacement-run/fail-run! (:id failed-rwt) "boom")
      ;; Start and fail the replace run (no transform_id)
      (replacement-run/start-run! (:id failed-replace))
      (replacement-run/fail-run! (:id failed-replace) "boom")
      ;; Start and succeed the other run
      (replacement-run/start-run! (:id ok-rwt))
      (replacement-run/update-transform-id! (:id ok-rwt) 200)
      (replacement-run/succeed-run! (:id ok-rwt))
      (testing "returns only failed runs with transform_id"
        (let [runs (replacement-run/failed-runs-with-transforms)]
          (is (= 1 (count runs)))
          (is (= (:id failed-rwt) (:id (first runs))))
          (is (= 100 (:transform_id (first runs)))))))))

(deftest cleanup-failed-runs-with-transforms-test
  (testing "cleanup deletes orphaned transforms and clears transform_id on the run"
    (mt/with-model-cleanup [:model/ReplacementRun :model/Transform]
      (let [transform (t2/insert-returning-instance! :model/Transform
                                                     {:name               "orphaned"
                                                      :source             {:type  "query"
                                                                           :query (mt/mbql-query orders)}
                                                      :target             {:type "table" :name "t" :schema "s"}
                                                      :source_database_id (mt/id)
                                                      :creator_id         (mt/user->id :crowberto)})
            run       (replacement-run/create-run! :card 1 :card 1 (mt/user->id :crowberto) :convert-to-transform)]
        (replacement-run/start-run! (:id run))
        (replacement-run/update-transform-id! (:id run) (:id transform))
        (replacement-run/fail-run! (:id run) "boom")
        ;; Run cleanup
        (#'replacement.timeout/cleanup-failed-runs-with-transforms!)
        ;; Transform should be deleted
        (is (nil? (t2/select-one :model/Transform :id (:id transform))))
        ;; Run should have transform_id cleared
        (let [updated (t2/select-one :model/ReplacementRun :id (:id run))]
          (is (nil? (:transform_id updated))))))))

;;; ------------------------------------------------ API endpoints ------------------------------------------------

(def ^:private valid-replace-with-transform-body
  "A valid request body for the replace-source-with-transform endpoint."
  {:source_entity_id   999999
   :source_entity_type "card"
   :transform_id       999999})

(deftest replace-source-with-transform-requires-superuser-test
  (testing "POST /replace-source-with-transform — 403 for non-admin"
    (mt/with-premium-features #{:dependencies}
      (mt/user-http-request :rasta :post 403 "ee/replacement/replace-source-with-transform"
                            valid-replace-with-transform-body))))

(deftest replace-source-with-transform-transform-not-found-test
  (testing "POST /replace-source-with-transform — 404 for non-existent transform"
    (mt/with-premium-features #{:dependencies}
      (mt/user-http-request :crowberto :post 404 "ee/replacement/replace-source-with-transform"
                            valid-replace-with-transform-body))))

(deftest replace-source-with-transform-concurrent-409-test
  (testing "POST /replace-source-with-transform — 409 when another run is active"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/Transform {transform-id :id}
                     {:name               "t"
                      :source             {:type  "query"
                                           :query (mt/mbql-query orders)}
                      :target             {:type "table" :name "t" :schema "s"}
                      :source_database_id (mt/id)
                      :creator_id         (mt/user->id :crowberto)}]
        (mt/with-model-cleanup [:model/ReplacementRun]
          ;; Insert a fake active run
          (let [run (replacement-run/create-run! :card 1 :card 2 (mt/user->id :crowberto))]
            (replacement-run/start-run! (:id run)))
          (mt/user-http-request :crowberto :post 409 "ee/replacement/replace-source-with-transform"
                                {:source_entity_id   1
                                 :source_entity_type "card"
                                 :transform_id       transform-id}))))))

(deftest replace-source-with-transform-requires-params-test
  (testing "POST /replace-source-with-transform — 400 when missing transform_id"
    (mt/with-premium-features #{:dependencies}
      (mt/user-http-request :crowberto :post 400 "ee/replacement/replace-source-with-transform"
                            {:source_entity_id 1 :source_entity_type "card"})))
  (testing "POST /replace-source-with-transform — 400 when missing source_entity_type"
    (mt/with-premium-features #{:dependencies}
      (mt/user-http-request :crowberto :post 400 "ee/replacement/replace-source-with-transform"
                            {:source_entity_id 1 :transform_id 1}))))

(deftest list-runs-api-test
  (testing "GET /runs — lists runs"
    (mt/with-premium-features #{:dependencies}
      (mt/with-model-cleanup [:model/ReplacementRun]
        (let [run  (replacement-run/create-run! :card 1 :card 2 (mt/user->id :crowberto) :convert-to-transform)
              runs (mt/user-http-request :crowberto :get 200 "ee/replacement/runs")]
          (is (sequential? runs))
          (is (some #(= (:id run) (:id %)) runs))))))
  (testing "GET /runs — requires superuser"
    (mt/with-premium-features #{:dependencies}
      (mt/user-http-request :rasta :get 403 "ee/replacement/runs")))
  (testing "GET /runs — requires feature flag"
    (mt/with-premium-features #{}
      (mt/assert-has-premium-feature-error
       "Dependency Tracking"
       (mt/user-http-request :crowberto :get 402 "ee/replacement/runs")))))

(deftest existing-endpoints-include-run-type-test
  (testing "GET /runs/:id returns run_type field"
    (mt/with-premium-features #{:dependencies}
      (mt/with-model-cleanup [:model/ReplacementRun]
        (let [run (replacement-run/create-run! :card 1 :card 2 (mt/user->id :crowberto) :convert-to-transform)]
          (replacement-run/start-run! (:id run))
          (let [result (mt/user-http-request :crowberto :get 200 (str "ee/replacement/runs/" (:id run)))]
            (is (= "convert-to-transform" (:run_type result)))
            (is (nil? (:progress result)))))))))

;;; ---------------------------------------- E2E acceptance test ----------------------------------------

(defn- poll-run
  "Poll a replacement run until it completes or times out. Returns the final run state."
  [run-id & {:keys [timeout-ms interval-ms]
             :or   {timeout-ms 30000 interval-ms 200}}]
  (let [deadline (+ (System/currentTimeMillis) timeout-ms)]
    (loop []
      (let [run (mt/user-http-request :crowberto :get 200 (str "ee/replacement/runs/" run-id))]
        (if (or (not (:is_active run))
                (> (System/currentTimeMillis) deadline))
          run
          (do (Thread/sleep (long interval-ms))
              (recur)))))))

(deftest replace-source-with-transform-acceptance-test
  (testing "Full E2E: create model + child, create transform, call endpoint, verify replacement"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (mt/dataset transforms-dataset/transforms-test
        (mt/with-premium-features #{:dependencies}
          (let [mp     (mt/metadata-provider)
                schema (t2/select-one-fn :schema :model/Table (mt/id :transforms_products))]
            (with-transform-cleanup! [target {:type   "table"
                                              :schema schema
                                              :name   "rwt_acceptance"}]
              (mt/with-temp [:model/Card {model-id :id :as model}
                             {:database_id   (mt/id)
                              :dataset_query (lib/query mp (lib.metadata/table mp (mt/id :transforms_products)))
                              :type          :model
                              :name          "Source Model"}

                             :model/Card {child-id :id :as child-card}
                             {:database_id   (mt/id)
                              :dataset_query (lib/query mp (lib.metadata/card mp model-id))
                              :type          :question
                              :name          "Child Question"}

                             :model/Transform {transform-id :id}
                             {:name   "rwt_acceptance_transform"
                              :source {:type  :query
                                       :query (lib/query mp (lib.metadata/table mp (mt/id :transforms_products)))}
                              :target (assoc target :database (mt/id))}]
                (mt/with-model-cleanup [:model/ReplacementRun :model/Dependency]
                  ;; Populate dependency graph
                  (events/publish-event! :event/card-create {:object model :user-id (mt/user->id :crowberto)})
                  (events/publish-event! :event/card-create {:object child-card :user-id (mt/user->id :crowberto)})

                  (let [response (mt/user-http-request :crowberto :post 202
                                                       "ee/replacement/replace-source-with-transform"
                                                       {:source_entity_id   model-id
                                                        :source_entity_type "card"
                                                        :transform_id       transform-id})
                        run-id   (:run_id response)
                        final    (poll-run run-id)]
                    (testing "run succeeds"
                      (is (= "succeeded" (:status final))))

                    (testing "run metadata is correct"
                      (is (= "convert-to-transform" (:run_type final)))
                      (is (= transform-id (:transform_id final)))
                      (is (= "table" (:target_entity_type final)))
                      (is (some? (:target_entity_id final))))

                    (testing "child card now references the output table"
                      (let [child-query (t2/select-one-fn :dataset_query :model/Card :id child-id)
                            source-table (get-in child-query [:stages 0 :source-table])]
                        (is (integer? source-table)
                            "Child should reference a table, not a card")
                        (is (= (:target_entity_id final) source-table)
                            "Child should reference the transform's output table")))))))))))))
