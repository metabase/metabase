(ns ^:mb/driver-tests metabase-enterprise.replacement.convert-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.dependencies.events]
   [metabase-enterprise.replacement.models.replacement-run :as replacement-run]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.transforms.test-dataset :as transforms-dataset]
   [metabase.transforms.test-util :refer [with-transform-cleanup!]]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ model layer ------------------------------------------------

(deftest list-runs-test
  (mt/with-model-cleanup [:model/ReplacementRun]
    (let [run1 (replacement-run/create-run! :card 1 :card 2 (mt/user->id :crowberto))
          run2 (replacement-run/create-run! :card 3 :table 4 (mt/user->id :crowberto))]
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

;;; ------------------------------------------------ API endpoints ------------------------------------------------

(def ^:private valid-replace-source-with-transform-body
  "A valid request body for the replace-source-with-transform endpoint."
  {:source_entity_id   999999
   :source_entity_type "card"
   :transform_id       999999})

(deftest replace-source-with-transform-requires-superuser-test
  (testing "POST /replace-source-with-transform — 403 for non-admin"
    (mt/with-premium-features #{:dependencies}
      (mt/user-http-request :rasta :post 403 "ee/replacement/replace-source-with-transform"
                            valid-replace-source-with-transform-body))))

(deftest replace-source-with-transform-transform-not-found-test
  (testing "POST /replace-source-with-transform — 404 for non-existent transform"
    (mt/with-premium-features #{:dependencies}
      (mt/user-http-request :crowberto :post 404 "ee/replacement/replace-source-with-transform"
                            valid-replace-source-with-transform-body))))

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
        (let [run  (replacement-run/create-run! :card 1 :table 2 (mt/user->id :crowberto))
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

;;; ---------------------------------------- E2E acceptance test ----------------------------------------

(defn- poll-for-replacement-run
  "Poll for a replacement run matching source entity, waiting for it to complete or timeout."
  [source-type source-id & {:keys [timeout-ms interval-ms]
                            :or   {timeout-ms 30000 interval-ms 200}}]
  (let [deadline (+ (System/currentTimeMillis) timeout-ms)]
    (loop []
      (let [runs (mt/user-http-request :crowberto :get 200 "ee/replacement/runs")
            run  (some (fn [r]
                         (when (and (= source-type (:source_entity_type r))
                                    (= source-id (:source_entity_id r)))
                           r))
                       runs)]
        (cond
          (and run (not (:is_active run)))
          run

          (> (System/currentTimeMillis) deadline)
          (or run (throw (ex-info "Timed out waiting for replacement run" {})))

          :else
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
                                                        :transform_id       transform-id})]
                    (testing "response has no run_id (FE discovers runs by polling)"
                      (is (= {} response)))

                    (let [final (poll-for-replacement-run "card" model-id)]
                      (testing "run succeeds"
                        (is (= "succeeded" (:status final))))

                      (testing "run has real target from the start"
                        (is (= "table" (:target_entity_type final)))
                        (is (some? (:target_entity_id final))))

                      (testing "child card now references the output table"
                        (let [child-query (t2/select-one-fn :dataset_query :model/Card :id child-id)
                              source-table (get-in child-query [:stages 0 :source-table])]
                          (is (integer? source-table)
                              "Child should reference a table, not a card")
                          (is (= (:target_entity_id final) source-table)
                              "Child should reference the transform's output table"))))))))))))))
