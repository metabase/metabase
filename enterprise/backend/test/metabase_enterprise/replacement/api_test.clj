(ns metabase-enterprise.replacement.api-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.dependencies.events]
   [metabase-enterprise.replacement.execute :as replacement.execute]
   [metabase-enterprise.replacement.models.replacement-run :as replacement-run]
   [metabase-enterprise.replacement.protocols :as replacement.protocols]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- poll-run
  "Poll a run until it's no longer active or we hit the timeout.
   Returns the final run state."
  [run-id & {:keys [timeout-ms interval-ms]
             :or   {timeout-ms 10000 interval-ms 100}}]
  (let [deadline (+ (System/currentTimeMillis) timeout-ms)]
    (loop []
      (let [run (mt/user-http-request :crowberto :get 200 (str "ee/replacement/runs/" run-id))]
        (if (or (not (:is_active run))
                (> (System/currentTimeMillis) deadline))
          run
          (do (Thread/sleep (long interval-ms))
              (recur)))))))

;;; ------------------------------------------------ POST /check-replace-source ------------------------------------------------

(deftest check-replace-source-success-test
  (testing "POST /check-replace-source — success with matching tables"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/Database {db-id :id} {}
                     :model/Table {t1-id :id} {:db_id db-id}
                     :model/Table {t2-id :id} {:db_id db-id}
                     :model/Field _ {:table_id t1-id :name "id" :base_type :type/Integer
                                     :effective_type :type/Integer}
                     :model/Field _ {:table_id t2-id :name "id" :base_type :type/Integer
                                     :effective_type :type/Integer}]
        (let [result (mt/user-http-request :crowberto :post 200 "ee/replacement/check-replace-source"
                                           {:source_entity_id   t1-id
                                            :source_entity_type :table
                                            :target_entity_id   t2-id
                                            :target_entity_type :table})]
          (is (true? (:success result)))
          (is (seq (:column_mappings result))))))))

(deftest check-replace-source-failure-test
  (testing "POST /check-replace-source — failure when databases differ"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/Database {db1-id :id} {}
                     :model/Database {db2-id :id} {}
                     :model/Table {t1-id :id} {:db_id db1-id}
                     :model/Table {t2-id :id} {:db_id db2-id}
                     :model/Field _ {:table_id t1-id :name "id" :base_type :type/Integer}
                     :model/Field _ {:table_id t2-id :name "id" :base_type :type/Integer}]
        (let [result (mt/user-http-request :crowberto :post 200 "ee/replacement/check-replace-source"
                                           {:source_entity_id   t1-id
                                            :source_entity_type :table
                                            :target_entity_id   t2-id
                                            :target_entity_type :table})]
          (is (false? (:success result)))
          (is (= ["database-mismatch"] (:errors result))))))))

;;; ------------------------------------------------ POST /replace-source ------------------------------------------------

(deftest replace-model-acceptance-test
  (testing "Full replacement: MBQL children, native children, grandchildren, transforms, dashboards"
    (mt/with-premium-features #{:dependencies}
      (let [mp (mt/metadata-provider)]
        (mt/with-temp [:model/Card      {old-id :id :as old-model}
                       {:database_id   (mt/id)
                        :dataset_query (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                        :type          :model
                        :name          "Old Model"}

                       :model/Card      {new-id :id}
                       {:database_id   (mt/id)
                        :dataset_query (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                        :type          :model
                        :name          "New Model"}

                       :model/Card      {mbql-child-1-id :id :as mbql-child-1}
                       {:database_id   (mt/id)
                        :dataset_query (lib/query mp (lib.metadata/card mp old-id))
                        :type          :question
                        :name          "MBQL Child 1"}

                       :model/Card      {mbql-child-2-id :id :as mbql-child-2}
                       {:database_id   (mt/id)
                        :dataset_query (lib/query mp (lib.metadata/card mp old-id))
                        :type          :question
                        :name          "MBQL Child 2"}

                       :model/Card      {native-child-id :id :as native-child}
                       {:database_id   (mt/id)
                        :dataset_query (lib/native-query mp (str "SELECT * FROM {{#" old-id "}}"))
                        :type          :question
                        :name          "Native Child"}

                       :model/Card      {grandchild-id :id :as grandchild}
                       {:database_id   (mt/id)
                        :dataset_query (lib/query mp (lib.metadata/card mp mbql-child-1-id))
                        :type          :question
                        :name          "Grandchild"}

                       :model/Card      {grandchild-native-id :id :as grandchild-native}
                       {:database_id   (mt/id)
                        :dataset_query (lib/query mp (lib.metadata/card mp native-child-id))
                        :type          :question
                        :name          "Grandchild via Native"}

                       :model/Transform {transform-id :id}
                       {:source {:type  "query"
                                 :query (lib/query mp (lib.metadata/card mp old-id))}
                        :name   "acceptance_transform"
                        :target {:database (mt/id) :table "acceptance_transform"}}

                       :model/Dashboard     {dashboard-id :id}
                       {:name "Acceptance Dashboard"}

                       :model/DashboardCard _
                       {:dashboard_id dashboard-id :card_id old-id}

                       :model/DashboardCard _
                       {:dashboard_id dashboard-id :card_id mbql-child-1-id}]

          (mt/with-model-cleanup [:model/ReplacementRun :model/Dependency]
            ;; Populate dependencies via events
            (doseq [card [old-model mbql-child-1 mbql-child-2 native-child grandchild grandchild-native]]
              (events/publish-event! :event/card-create {:object card :user-id (mt/user->id :crowberto)}))

            (let [response (mt/user-http-request :crowberto :post 202 "ee/replacement/replace-source"
                                                 {:source_entity_id   old-id
                                                  :source_entity_type :card
                                                  :target_entity_id   new-id
                                                  :target_entity_type :card})
                  run-id   (:run_id response)
                  final    (poll-run run-id)]
              (is (= "succeeded" (:status final)))

              (testing "MBQL children have updated source-card"
                (doseq [[label card-id] [["MBQL Child 1" mbql-child-1-id]
                                         ["MBQL Child 2" mbql-child-2-id]]]
                  (testing label
                    (let [q (t2/select-one-fn :dataset_query :model/Card :id card-id)]
                      (is (= new-id (lib/primary-source-card-id q)))))))

              (testing "Native child references new model in SQL"
                (let [q   (t2/select-one-fn :dataset_query :model/Card :id native-child-id)
                      sql (get-in q [:stages 0 :native])]
                  (is (re-find (re-pattern (str "\\{\\{#" new-id "[^0-9]")) sql))
                  (is (not (re-find (re-pattern (str "\\{\\{#" old-id "[^0-9]")) sql)))))

              (testing "Grandchild still references its direct parent"
                (let [q (t2/select-one-fn :dataset_query :model/Card :id grandchild-id)]
                  (is (= mbql-child-1-id (lib/primary-source-card-id q)))))

              (testing "Grandchild via native still references native child"
                (let [q (t2/select-one-fn :dataset_query :model/Card :id grandchild-native-id)]
                  (is (= native-child-id (lib/primary-source-card-id q)))))

              (testing "Transform's source query references new model"
                (let [src (t2/select-one-fn :source :model/Transform :id transform-id)]
                  (is (= new-id (lib/primary-source-card-id (:query src))))))

              (testing "Dependencies point to new model"
                (let [deps-to-old (t2/select :model/Dependency
                                             :to_entity_type :card
                                             :to_entity_id   old-id)
                      deps-to-new (t2/select :model/Dependency
                                             :to_entity_type :card
                                             :to_entity_id   new-id)]
                  (is (empty? deps-to-old))
                  (is (seq deps-to-new)))))))))))

(deftest concurrent-run-returns-409-test
  (testing "POST /replace-source — returns 409 when another run is already active"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/Card {old-id :id} {:database_id   (mt/id)
                                               :dataset_query (let [mp (mt/metadata-provider)]
                                                                (lib/query mp (lib.metadata/table mp (mt/id :products))))
                                               :type          :model
                                               :name          "Old source"}
                     :model/Card {new-id :id} {:database_id   (mt/id)
                                               :dataset_query (let [mp (mt/metadata-provider)]
                                                                (lib/query mp (lib.metadata/table mp (mt/id :products))))
                                               :type          :model
                                               :name          "New source"}
                     :model/Card child-card {:database_id   (mt/id)
                                             :dataset_query (let [mp (mt/metadata-provider)]
                                                              (lib/query mp (lib.metadata/card mp old-id)))
                                             :type          :question
                                             :name          "Child card"}]
        (mt/with-model-cleanup [:model/ReplacementRun :model/Dependency]
          (events/publish-event! :event/card-create {:object child-card :user-id (mt/user->id :crowberto)})
          ;; Insert a fake active run to simulate one already running
          (let [run (replacement-run/create-run! :card old-id :card new-id (mt/user->id :crowberto))]
            (replacement-run/start-run! (:id run)))
          (mt/user-http-request :crowberto :post 409 "ee/replacement/replace-source"
                                {:source_entity_id   old-id
                                 :source_entity_type :card
                                 :target_entity_id   new-id
                                 :target_entity_type :card}))))))

;;; ------------------------------------------------ GET /runs/:id ------------------------------------------------

(deftest replace-source-swaps-child-card-test
  (testing "POST /replace-source — swaps source reference in child card"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/Card {old-id :id} {:database_id   (mt/id)
                                               :dataset_query (let [mp (mt/metadata-provider)]
                                                                (lib/query mp (lib.metadata/table mp (mt/id :orders))))
                                               :type          :model
                                               :name          "Old Orders"}
                     :model/Card {new-id :id} {:database_id   (mt/id)
                                               :dataset_query (let [mp (mt/metadata-provider)]
                                                                (lib/query mp (lib.metadata/table mp (mt/id :orders))))
                                               :type          :model
                                               :name          "New Orders"}
                     :model/Card child-card {:database_id   (mt/id)
                                             :dataset_query (let [mp (mt/metadata-provider)]
                                                              (lib/query mp (lib.metadata/card mp old-id)))
                                             :type          :question
                                             :name          "Child Card"}]
        (mt/with-model-cleanup [:model/ReplacementRun :model/Dependency]
          (events/publish-event! :event/card-create {:object child-card :user-id (mt/user->id :crowberto)})
          (let [response (mt/user-http-request :crowberto :post 202 "ee/replacement/replace-source"
                                               {:source_entity_id   old-id
                                                :source_entity_type :card
                                                :target_entity_id   new-id
                                                :target_entity_type :card})
                run-id   (:run_id response)
                final    (poll-run run-id)]
            (is (= "succeeded" (:status final)))
            (let [child-query (t2/select-one-fn :dataset_query :model/Card :id (:id child-card))]
              (is (= new-id (get-in child-query [:stages 0 :source-card]))
                  "Child card should now reference the new source card"))))))))

(deftest replace-source-poll-until-complete-test
  (testing "POST replace-source then GET /runs/:id — run reaches 'succeeded' status"
    (mt/with-premium-features #{:dependencies}
      (mt/with-temp [:model/Card {old-id :id} {:database_id   (mt/id)
                                               :dataset_query (let [mp (mt/metadata-provider)]
                                                                (lib/query mp (lib.metadata/table mp (mt/id :products))))
                                               :type          :model
                                               :name          "Old source"}
                     :model/Card {new-id :id} {:database_id   (mt/id)
                                               :dataset_query (let [mp (mt/metadata-provider)]
                                                                (lib/query mp (lib.metadata/table mp (mt/id :products))))
                                               :type          :model
                                               :name          "New source"}
                     :model/Card child-card {:database_id   (mt/id)
                                             :dataset_query (let [mp (mt/metadata-provider)]
                                                              (lib/query mp (lib.metadata/card mp old-id)))
                                             :type          :question
                                             :name          "Child card"}]
        (mt/with-model-cleanup [:model/ReplacementRun :model/Dependency]
          (events/publish-event! :event/card-create {:object child-card :user-id (mt/user->id :crowberto)})
          (let [response  (mt/user-http-request :crowberto :post 202 "ee/replacement/replace-source"
                                                {:source_entity_id   old-id
                                                 :source_entity_type :card
                                                 :target_entity_id   new-id
                                                 :target_entity_type :card})
                run-id    (:run_id response)
                final-run (poll-run run-id)]
            (is (= "succeeded" (:status final-run))
                "Run should reach 'succeeded' status")
            (is (= 1.0 (:progress final-run))
                "Progress should be 1.0 when done")
            (is (nil? (:is_active final-run))
                "is_active should be nil when run is complete")
            (is (some? (:end_time final-run))
                "end_time should be set")))))))

(deftest get-run-not-found-test
  (testing "GET /runs/:id — returns 404 for non-existent run"
    (mt/with-premium-features #{:dependencies}
      (mt/user-http-request :crowberto :get 404 "ee/replacement/runs/999999"))))

(deftest execute-async-progress-tracking-test
  (testing "execute-async! invokes the protocol methods correctly"
    (mt/with-premium-features #{:dependencies}
      (let [state        (atom {:total 0 :so-far 0 :status :pending})
            done?        (promise)
            progress     (reify replacement.protocols/IRunnerProgress
                           (set-total! [_ total] (swap! state assoc :total total))
                           (advance! [_] (swap! state update :so-far inc))
                           (advance! [_ n] (swap! state update :so-far + n))
                           (canceled? [_] false)
                           (start-run! [_]
                             (swap! state assoc :status :running))
                           (succeed-run! [_]
                             (swap! state assoc :status :succeeded)
                             (deliver done? true))
                           (fail-run! [_ throwable]
                             (swap! state assoc :status :failed :message (ex-message throwable))
                             (deliver done? true)))
            work-fn      (fn [progress]
                           (replacement.protocols/set-total! progress 3)
                           (is (false? (replacement.protocols/canceled? progress)))
                           (dotimes [_ 3]
                             (replacement.protocols/advance! progress)))]
        ;; Poll until done
        (replacement.execute/execute-async! work-fn progress)
        (u/deref-with-timeout done? 2000)
        (is (=? {:total 3 :so-far 3 :status :succeeded}
                @state))))))

;;; ------------------------------------------------ POST /runs/:id/cancel ------------------------------------------------

(deftest cancel-run-test
  (testing "POST /runs/:id/cancel — cancels an active run"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-model-cleanup [:model/ReplacementRun]
          ;; Insert a run directly so we can cancel it without racing the async completion
          (let [run (replacement-run/create-run! :card 1 :card 2 (mt/user->id :crowberto))
                _   (replacement-run/start-run! (:id run))
                response (mt/user-http-request :crowberto :post 200
                                               (str "ee/replacement/runs/" (:id run) "/cancel"))]
            (is (true? (:success response)))
            (let [updated (t2/select-one :model/ReplacementRun :id (:id run))]
              (is (= :canceled (:status updated)))
              (is (nil? (:is_active updated))))))))))

(deftest cancel-inactive-run-returns-409-test
  (testing "POST /runs/:id/cancel — returns 409 for already-completed run"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-model-cleanup [:model/ReplacementRun]
          (let [run (replacement-run/create-run! :card 1 :card 2 (mt/user->id :crowberto))]
            (replacement-run/start-run! (:id run))
            (replacement-run/succeed-run! (:id run))
            (mt/user-http-request :crowberto :post 409
                                  (str "ee/replacement/runs/" (:id run) "/cancel"))))))))

(deftest cancel-not-found-run-returns-404-test
  (testing "POST /runs/:id/cancel — returns 404 for non-existent run"
    (mt/with-premium-features #{:dependencies}
      (mt/user-http-request :crowberto :post 404 "ee/replacement/runs/999999/cancel"))))
