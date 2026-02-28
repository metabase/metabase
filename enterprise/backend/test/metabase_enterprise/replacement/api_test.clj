(ns metabase-enterprise.replacement.api-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.replacement.execute :as replacement.execute]
   [metabase-enterprise.replacement.models.replacement-run :as replacement-run]
   [metabase-enterprise.replacement.protocols :as replacement.protocols]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.queries.models.card :as card]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- card-with-query
  "Create a card map for the given table keyword."
  [card-name table-kw]
  (let [mp (mt/metadata-provider)]
    {:name                   card-name
     :database_id            (mt/id)
     :display                :table
     :query_type             :query
     :type                   :question
     :dataset_query          (lib/query mp (lib.metadata/table mp (mt/id table-kw)))
     :visualization_settings {}}))

(defn- card-sourced-from
  "Create a card map whose query sources `inner-card`."
  [card-name inner-card]
  (let [mp        (mt/metadata-provider)
        card-meta (lib.metadata/card mp (:id inner-card))]
    {:name                   card-name
     :database_id            (mt/id)
     :display                :table
     :query_type             :query
     :type                   :question
     :dataset_query          (lib/query mp card-meta)
     :visualization_settings {}}))

;;; ------------------------------------------------ check-replace-source ------------------------------------------------

(deftest check-replace-source-compatible-test
  (testing "POST /api/ee/replacement/check-replace-source — compatible cards on the same table"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/Card card-a (card-with-query "Card A" :products)
                       :model/Card card-b (card-with-query "Card B" :products)]
          (let [response (mt/user-http-request :crowberto :post 200 "ee/replacement/check-replace-source"
                                               {:source_entity_id   (:id card-a)
                                                :source_entity_type :card
                                                :target_entity_id   (:id card-b)
                                                :target_entity_type :card})]
            (is (true? (:success response)))
            (is (nil? (:errors response)))
            (is (seq (:column_mappings response)))
            (is (not-any? :errors (:column_mappings response)))))))))

(deftest check-replace-source-incompatible-test
  (testing "POST /api/ee/replacement/check-replace-source — incompatible cards (different tables)"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/Card card-a (card-with-query "Products card" :products)
                       :model/Card card-b (card-with-query "Orders card" :orders)]
          (let [response (mt/user-http-request :crowberto :post 200 "ee/replacement/check-replace-source"
                                               {:source_entity_id   (:id card-a)
                                                :source_entity_type :card
                                                :target_entity_id   (:id card-b)
                                                :target_entity_type :card})]
            (is (false? (:success response)))
            (is (some #(= "missing-column" %) (:errors response)))))))))

(deftest check-replace-source-same-source-test
  (testing "POST /api/ee/replacement/check-replace-source — same source and target"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/Card card-a (card-with-query "Card A" :products)]
          (let [response (mt/user-http-request :crowberto :post 200 "ee/replacement/check-replace-source"
                                               {:source_entity_id   (:id card-a)
                                                :source_entity_type :card
                                                :target_entity_id   (:id card-a)
                                                :target_entity_type :card})]
            (is (false? (:success response)))
            (is (some #(= "same-source" %) (:errors response)))))))))

(deftest check-replace-source-database-mismatch-test
  (testing "POST /api/ee/replacement/check-replace-source — database mismatch"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/Database other-db {:engine  :h2
                                                 :details (:details (mt/db))}
                       :model/Card card-a (card-with-query "Card A" :products)
                       :model/Card card-b {:name                   "Card B"
                                           :database_id            (:id other-db)
                                           :type                   :question
                                           :dataset_query          {:database (:id other-db)
                                                                    :type     :native
                                                                    :native   {:query "SELECT 1"}}
                                           :visualization_settings {}}]
          (let [response (mt/user-http-request :crowberto :post 200 "ee/replacement/check-replace-source"
                                               {:source_entity_id   (:id card-a)
                                                :source_entity_type :card
                                                :target_entity_id   (:id card-b)
                                                :target_entity_type :card})]
            (is (false? (:success response)))
            (is (some #{"database-mismatch"} (:errors response)))))))))

(deftest check-replace-source-requires-premium-feature-test
  (testing "POST /api/ee/replacement/check-replace-source — requires :dependencies premium feature"
    (mt/with-premium-features #{}
      (mt/user-http-request :crowberto :post 402 "ee/replacement/check-replace-source"
                            {:source_entity_id   1
                             :source_entity_type :card
                             :target_entity_id   2
                             :target_entity_type :card}))))

;;; ------------------------------------------------ replace-source ------------------------------------------------

(deftest replace-source-returns-202-test
  (testing "POST /api/ee/replacement/replace-source — returns 202 with run_id"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "replacement-test@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency :model/ReplacementRun]
            (let [old-source (card/create-card! (card-with-query "Old source" :products) user)
                  new-source (card/create-card! (card-with-query "New source" :products) user)
                  _child     (card/create-card! (card-sourced-from "Child card" old-source) user)
                  response   (mt/user-http-request :crowberto :post 202 "ee/replacement/replace-source"
                                                   {:source_entity_id   (:id old-source)
                                                    :source_entity_type :card
                                                    :target_entity_id   (:id new-source)
                                                    :target_entity_type :card})]
              (is (pos-int? (:run_id response))))))))))

(deftest replace-source-incompatible-returns-400-test
  (testing "POST /api/ee/replacement/replace-source — incompatible sources return 400"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "replacement-incompat@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (let [old-source (card/create-card! (card-with-query "Products card" :products) user)
                  new-source (card/create-card! (card-with-query "Orders card" :orders) user)]
              (mt/user-http-request :crowberto :post 400 "ee/replacement/replace-source"
                                    {:source_entity_id   (:id old-source)
                                     :source_entity_type :card
                                     :target_entity_id   (:id new-source)
                                     :target_entity_type :card}))))))))

(deftest replace-source-database-mismatch-returns-400-test
  (testing "POST /api/ee/replacement/replace-source — database mismatch returns 400"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/Database other-db {:engine  :h2
                                                 :details (:details (mt/db))}
                       :model/Card card-a (card-with-query "Card A" :products)
                       :model/Card card-b {:name                   "Card B"
                                           :database_id            (:id other-db)
                                           :type                   :question
                                           :dataset_query          {:database (:id other-db)
                                                                    :type     :native
                                                                    :native   {:query "SELECT 1"}}
                                           :visualization_settings {}}]
          (mt/user-http-request :crowberto :post 400 "ee/replacement/replace-source"
                                {:source_entity_id   (:id card-a)
                                 :source_entity_type :card
                                 :target_entity_id   (:id card-b)
                                 :target_entity_type :card}))))))

(deftest replace-source-requires-premium-feature-test
  (testing "POST /api/ee/replacement/replace-source — requires :dependencies premium feature"
    (mt/with-premium-features #{}
      (mt/user-http-request :crowberto :post 402 "ee/replacement/replace-source"
                            {:source_entity_id   1
                             :source_entity_type :card
                             :target_entity_id   2
                             :target_entity_type :card}))))

;;; ------------------------------------------------ GET /runs/:id ------------------------------------------------

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

(deftest replace-source-poll-until-complete-test
  (testing "POST replace-source then GET /runs/:id — run reaches 'succeeded' status"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "poll-test@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency :model/ReplacementRun]
            (let [old-source (card/create-card! (card-with-query "Old source" :products) user)
                  new-source (card/create-card! (card-with-query "New source" :products) user)
                  _child     (card/create-card! (card-sourced-from "Child card" old-source) user)
                  response   (mt/user-http-request :crowberto :post 202 "ee/replacement/replace-source"
                                                   {:source_entity_id   (:id old-source)
                                                    :source_entity_type :card
                                                    :target_entity_id   (:id new-source)
                                                    :target_entity_type :card})
                  run-id     (:run_id response)
                  final-run  (poll-run run-id)]
              (is (= "succeeded" (:status final-run))
                  "Run should reach 'succeeded' status")
              (is (= 1.0 (:progress final-run))
                  "Progress should be 1.0 when done")
              (is (nil? (:is_active final-run))
                  "is_active should be nil when run is complete")
              (is (some? (:end_time final-run))
                  "end_time should be set"))))))))

(deftest get-run-not-found-test
  (testing "GET /runs/:id — returns 404 for non-existent run"
    (mt/with-premium-features #{:dependencies}
      (mt/user-http-request :crowberto :get 404 "ee/replacement/runs/999999"))))

;;; ------------------------------------------------ progress tracking ------------------------------------------------

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

;;; ------------------------------------------------ 409 concurrent run ------------------------------------------------

(deftest concurrent-run-returns-409-test
  (testing "POST /replace-source — returns 409 when another run is already active"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "concurrent-test@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency :model/ReplacementRun]
            (let [old-source (card/create-card! (card-with-query "Old source" :products) user)
                  new-source (card/create-card! (card-with-query "New source" :products) user)
                  _child     (card/create-card! (card-sourced-from "Child card" old-source) user)]
              ;; Insert a fake active run to simulate one already running
              (let [run (replacement-run/create-run! :card (:id old-source)
                                                     :card (:id new-source)
                                                     (mt/user->id :crowberto))]
                (replacement-run/start-run! (:id run)))
              (mt/user-http-request :crowberto :post 409 "ee/replacement/replace-source"
                                    {:source_entity_id   (:id old-source)
                                     :source_entity_type :card
                                     :target_entity_id   (:id new-source)
                                     :target_entity_type :card}))))))))
