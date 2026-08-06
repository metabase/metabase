(ns metabase-enterprise.data-studio.api.usage-metadata-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-studio.api.usage-metadata :as usage-metadata.api]
   [metabase.app-db.core :as mdb]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.measures.test-util :as measures.tu]
   [metabase.models.interface :as mi]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.usage-metadata.candidate-mining :as candidate-mining]
   [metabase.usage-metadata.candidate-service :as candidate-service]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(def ^:private run-refresh-async! @#'usage-metadata.api/run-refresh-async!)

(def ^:dynamic ^:private *published-candidate-create-events* nil)

(events/derive! :event/measure-create ::candidate-create-events)
(events/derive! :event/segment-create ::candidate-create-events)

(methodical/defmethod events/publish-event! ::candidate-create-events
  [topic {:keys [object]}]
  (when *published-candidate-create-events*
    (let [model (case topic
                  :event/measure-create :model/Measure
                  :event/segment-create :model/Segment)]
      (swap! *published-candidate-create-events* conj
             {:topic topic
              :visible? (t2/exists? model :id (:id object))}))))

(deftest routes-require-library-feature-test
  (mt/with-premium-features #{}
    (let [error (try
                  (usage-metadata.api/routes {} identity identity)
                  nil
                  (catch clojure.lang.ExceptionInfo e
                    e))]
      (is (= 402 (:status-code (ex-data error))))
      (is (re-find #"Library is a paid feature" (ex-message error))))))

(deftest temporary-direct-refresh-must-not-merge-to-master-test
  ;; Remove this test only after the usage-metadata refresh API path is wired through Quartz again.
  (is false "DO NOT MERGE: the usage-metadata refresh API temporarily bypasses Quartz."))

(defn- candidate-row
  ([run-id]
   (candidate-row run-id {}))
  ([run-id overrides]
   (merge
    {:run_id                run-id
     :candidate_type        :segment
     :table_id              (mt/id :orders)
     :signature_version     candidate-service/signature-version
     :signature_hash        (apply str (repeat 64 "b"))
     :signature             "[\"segment-api\"]"
     :definition            {:database (mt/id)
                             :lib/type :mbql/query
                             :stages   [{:lib/type     :mbql.stage/mbql
                                         :source-table (mt/id :orders)}]}
     :semantic_details      {:atom-count 1
                             :base-name "Count"
                             :display-atoms [{:signature "recent"
                                              :display-name "Created At is recent"
                                              :kind :temporal}]}
     :display_name          "Recent orders"
     :suggested_name        "Recent orders"
     :suggested_description "Recent orders on Orders"
     :family_order          0
     :family_position       0
     :modeling_status       :missing
     :verified_source_count 1
     :official_source_count 0
     :popular_source_count  1
     :distinct_source_count 1
     :total_view_count      10
     :complexity            1}
    overrides)))

(deftest manual-refresh-runs-without-quartz-test
  (let [run       {:id 42, :status :queued}
        started   (promise)
        completed (promise)]
    (mt/with-dynamic-fn-redefs [candidate-service/run-refresh! (fn [submitted-run]
                                                                 (deliver started submitted-run)
                                                                 (deliver completed true))]
      (run-refresh-async! run)
      (is (= run (deref started 1000 ::timeout)))
      (is (true? (deref completed 1000 ::timeout))))))

(deftest manual-refresh-api-starts-direct-run-test
  (mt/with-premium-features #{:library}
    (let [run     {:id 42, :status :queued}
          started (promise)]
      (with-redefs-fn {#'candidate-service/queue-refresh!                 (fn [_trigger _requested-by] run)
                       #'usage-metadata.api/run-refresh-async! #(deliver started %)}
        (fn []
          (let [response (mt/user-http-request :crowberto :post 202
                                               "ee/data-studio/usage-metadata/refresh")
                submitted-run (deref started 1000 ::timeout)]
            (is (= (:run_id response) (:id submitted-run)))
            (is (= run submitted-run))))))))

(defn- definition-signature
  [candidate-type table-id definition]
  (case candidate-type
    :measure
    (candidate-mining/canonical-signature
     [table-id (candidate-mining/canonical-signature (first (lib/aggregations definition 0)))])

    :segment
    (candidate-mining/canonical-signature
     [table-id
      (->> (lib/atomic-filters definition 0)
           (map candidate-mining/canonical-signature)
           sort
           vec)])))

(deftest superuser-list-and-dismiss-workflow-test
  (mt/with-premium-features #{:library}
    (mt/with-temp [:model/UsageMetadataCandidateRun run {:status            :succeeded
                                                         :trigger           :manual
                                                         :algorithm_version 1
                                                         :source_config     {}
                                                         :finished_at       (mi/now)}
                   :model/UsageMetadataCandidate candidate (candidate-row (:id run))]
      (testing "instance-wide provenance is superuser-only"
        (mt/user-http-request :rasta :get 403 "ee/data-studio/usage-metadata/candidates"))
      (testing "list and detail expose the current snapshot"
        (let [list-response (mt/user-http-request :crowberto :get 200
                                                  "ee/data-studio/usage-metadata/candidates")
              detail-response (mt/user-http-request :crowberto :get 200
                                                    (str "ee/data-studio/usage-metadata/candidates/"
                                                         (:id candidate)))]
          (is (=? {:total 1
                   :data [{:id (:id candidate)
                           :candidate_type "segment"
                           :presentation {:predicates [{:signature "recent"
                                                        :display_name "Created At is recent"
                                                        :kind "temporal"}]}
                           :modeling_status "missing"
                           :dismissed false}]}
                  list-response))
          (is (= #{:id :candidate_type :display_name :presentation
                   :modeling_status :dismissed :evidence}
                 (set (keys (first (:data list-response))))))
          (is (=? {:id (:id candidate)
                   :definition {:lib/type "mbql/query"}
                   :sources []
                   :matches []}
                  detail-response))
          (is (not (contains? detail-response :semantic_details)))))
      (testing "table summaries use the same current snapshot"
        (let [response (mt/user-http-request :crowberto :get 200
                                             "ee/data-studio/usage-metadata/tables")]
          (is (=? {:total 1
                   :data [{:table {:id (mt/id :orders)}
                           :candidate_count 1}]}
                  response))
          (is (= #{:table :candidate_count}
                 (set (keys (first (:data response))))))))
      (testing "dismiss and restore are global and immediately visible"
        (is (=? {:dismissed true}
                (mt/user-http-request :crowberto :post 200
                                      (str "ee/data-studio/usage-metadata/candidates/" (:id candidate) "/dismiss")
                                      {:reason "not useful"})))
        (is (= 0 (:total (mt/user-http-request :crowberto :get 200
                                               "ee/data-studio/usage-metadata/candidates"))))
        (is (=? {:dismissed false}
                (mt/user-http-request :crowberto :delete 200
                                      (str "ee/data-studio/usage-metadata/candidates/" (:id candidate) "/dismissal"))))))))

(deftest candidate-detail-uses-snapshot-match-metadata-test
  (mt/with-premium-features #{:library}
    (mt/with-temp [:model/UsageMetadataCandidateRun run {:status            :succeeded
                                                         :trigger           :manual
                                                         :algorithm_version 1
                                                         :source_config     {}
                                                         :finished_at       (mi/now)}
                   :model/UsageMetadataCandidate candidate
                   (candidate-row (:id run) {:candidate_type  :measure
                                             :modeling_status :modeled})]
      (t2/insert! :model/UsageMetadataCandidateMatch
                  {:candidate_id       (:id candidate)
                   :relation           :exact
                   :measure_id         123456789
                   :entity_name        "Deleted revenue"
                   :entity_description "Snapshot description"
                   :entity_archived    false})
      (is (=? {:matches [{:relation "exact"
                          :entity_type "measure"
                          :entity {:id          123456789
                                   :name        "Deleted revenue"
                                   :description "Snapshot description"
                                   :archived    false}}]}
              (mt/user-http-request :crowberto :get 200
                                    (str "ee/data-studio/usage-metadata/candidates/" (:id candidate))))))))

(deftest candidate-list-filtering-and-priority-pagination-test
  (mt/with-premium-features #{:library}
    (mt/with-temp [:model/UsageMetadataCandidateRun run {:status            :succeeded
                                                         :trigger           :manual
                                                         :algorithm_version 1
                                                         :source_config     {}
                                                         :finished_at       (mi/now)}
                   :model/UsageMetadataCandidate _first (candidate-row (:id run)
                                                                       {:suggested_name "Alpha"
                                                                        :display_name "Alpha"
                                                                        :signature_hash (apply str (repeat 64 "c"))
                                                                        :signature "[\"alpha\"]"})
                   :model/UsageMetadataCandidate second-candidate (candidate-row
                                                                   (:id run)
                                                                   {:candidate_type :measure
                                                                    :suggested_name "Zulu"
                                                                    :display_name "Zulu"
                                                                    :signature_hash (apply str (repeat 64 "d"))
                                                                    :signature "[\"zulu\"]"
                                                                    :family_position 1
                                                                    :verified_source_count 0
                                                                    :popular_source_count 0})]
      (testing "limit and offset are applied after deterministic priority ordering"
        (is (=? {:total 2
                 :limit 1
                 :offset 1
                 :data [{:id (:id second-candidate), :display_name "Zulu"}]}
                (mt/user-http-request :crowberto :get 200
                                      "ee/data-studio/usage-metadata/candidates?limit=1&offset=1"))))
      (testing "candidate type and search filters are applied before pagination"
        (is (=? {:total 1
                 :data [{:id (:id second-candidate), :candidate_type "measure"}]}
                (mt/user-http-request :crowberto :get 200
                                      "ee/data-studio/usage-metadata/candidates?candidate-type=measure&search=zulu")))))))

(deftest table-and-metric-recommendations-are-listable-test
  (mt/with-premium-features #{:library}
    (mt/with-temp [:model/UsageMetadataCandidateRun run {:status            :succeeded
                                                         :trigger           :manual
                                                         :algorithm_version candidate-service/algorithm-version
                                                         :source_config     {}
                                                         :finished_at       (mi/now)}
                   :model/UsageMetadataCandidate table-candidate
                   (candidate-row (:id run)
                                  {:candidate_type :table
                                   :suggested_name "Publish Orders"
                                   :display_name "Publish Orders"
                                   :signature_hash (apply str (repeat 64 "4"))
                                   :signature "[\"publish-orders\"]"
                                   :definition {:table-id (mt/id :orders)}
                                   :semantic_details {:table {:id (mt/id :orders)}}})
                   :model/UsageMetadataCandidate metric-candidate
                   (candidate-row (:id run)
                                  {:candidate_type :metric
                                   :suggested_name "Large order trend"
                                   :display_name "Large order trend"
                                   :signature_hash (apply str (repeat 64 "5"))
                                   :signature "[\"large-order-trend\"]"
                                   :semantic_details {:required-tables
                                                      [{:id (mt/id :orders)
                                                        :database-id (mt/id)
                                                        :database-name "Test Database"
                                                        :name "orders"
                                                        :display-name "Orders"
                                                        :data-layer :entity
                                                        :data-authority :computed
                                                        :view-count 42
                                                        :published? false}]}})]
      (is (=? {:total 1
               :data [{:id (:id table-candidate)
                       :candidate_type "table"}]}
              (mt/user-http-request :crowberto :get 200
                                    "ee/data-studio/usage-metadata/candidates?candidate-type=table")))
      (is (=? {:total 1
               :data [{:id (:id metric-candidate)
                       :candidate_type "metric"}]}
              (mt/user-http-request :crowberto :get 200
                                    "ee/data-studio/usage-metadata/candidates?candidate-type=metric")))
      (is (=? {:required_tables [{:id (mt/id :orders)
                                  :display_name "Orders"
                                  :database {:id (mt/id)
                                             :name "Test Database"}
                                  :is_published false}]
               :creation_blockers []}
              (mt/user-http-request :crowberto :get 200
                                    (str "ee/data-studio/usage-metadata/candidates/" (:id metric-candidate)))))
      (is (=? {:data [{:candidate_count 2}]}
              (mt/user-http-request :crowberto :get 200
                                    "ee/data-studio/usage-metadata/tables"))))))

(deftest candidate-detail-normalizes-dependency-paths-test
  (mt/with-premium-features #{:library}
    (mt/with-temp [:model/UsageMetadataCandidateRun run {:status            :succeeded
                                                         :trigger           :manual
                                                         :algorithm_version 1
                                                         :source_config     {}
                                                         :finished_at       (mi/now)}
                   :model/UsageMetadataCandidate candidate
                   (candidate-row (:id run)
                                  {:candidate_type :table
                                   :definition     {:table-id (mt/id :orders)}
                                   :semantic_details
                                   {:source-dependencies
                                    [{:card-id 987654
                                      :dependency-paths
                                      [{:direct? false
                                        :models [{:id 123456, :name "Accounts model"}]}]}]}})]
      (t2/insert! :model/UsageMetadataCandidateSource
                  {:candidate_id  (:id candidate)
                   :card_id       987654
                   :card_name     "Accounts question"
                   :card_type     :question
                   :verified      true
                   :official      false
                   :popular       true
                   :view_count    12
                   :joined        false
                   :stage_numbers [0]
                   :model_lineage [{:id 123456, :name "Accounts model"}]})
      (let [response (mt/user-http-request :crowberto :get 200
                                           (str "ee/data-studio/usage-metadata/candidates/"
                                                (:id candidate)))]
        (is (=? {:sources [{:card_id 987654
                            :dependency_paths [{:direct false
                                                :models [{:id 123456
                                                          :name "Accounts model"}]}]}]}
                response))
        (is (not (contains? (first (:dependency_paths (first (:sources response)))) :direct?)))))))

(deftest refresh-status-normalizes-snapshot-summary-test
  (mt/with-premium-features #{:library}
    (mt/with-temp [:model/UsageMetadataCandidateRun _run {:status            :succeeded
                                                          :trigger           :manual
                                                          :algorithm_version 1
                                                          :source_config     {:kind :qualified-cards}
                                                          :summary           {:candidate-count 6
                                                                              :measure-count 1
                                                                              :segment-count 2
                                                                              :metric-count 1
                                                                              :publish-table-count 2
                                                                              :table-count 3}
                                                          :finished_at       (mi/now)}]
      (let [response (mt/user-http-request :crowberto :get 200
                                           "ee/data-studio/usage-metadata/refresh")]
        (is (= #{:snapshot :active :failure} (set (keys response))))
        (is (= #{:id :finished_at :summary} (set (keys (:snapshot response)))))
        (is (= {:table_count 3} (:summary (:snapshot response))))))))

(deftest candidate-priority-order-keeps-recommendation-families-together-test
  (mt/with-premium-features #{:library}
    (mt/with-temp [:model/UsageMetadataCandidateRun run {:status            :succeeded
                                                         :trigger           :manual
                                                         :algorithm_version candidate-service/algorithm-version
                                                         :source_config     {}
                                                         :finished_at       (mi/now)}
                   :model/UsageMetadataCandidate root
                   (candidate-row (:id run)
                                  {:suggested_name "Shared concept"
                                   :display_name "Shared concept"
                                   :signature_hash (apply str (repeat 64 "7"))
                                   :family_order 0
                                   :family_position 0})
                   :model/UsageMetadataCandidate child
                   (candidate-row (:id run)
                                  {:suggested_name "Shared concept with detail"
                                   :display_name "Shared concept with detail"
                                   :signature_hash (apply str (repeat 64 "8"))
                                   :family_order 0
                                   :family_position 1})
                   :model/UsageMetadataCandidate other
                   (candidate-row (:id run)
                                  {:suggested_name "Other concept"
                                   :display_name "Other concept"
                                   :signature_hash (apply str (repeat 64 "9"))
                                   :family_order 1
                                   :family_position 0
                                   :verified_source_count 10
                                   :distinct_source_count 100})]
      (let [response (mt/user-http-request :crowberto :get 200
                                           "ee/data-studio/usage-metadata/candidates")]
        (is (= [(:id root) (:id child) (:id other)]
               (mapv :id (:data response))))))))

(deftest candidate-queue-filtering-test
  (mt/with-premium-features #{:library}
    (mt/with-temp [:model/UsageMetadataCandidateRun run {:status            :succeeded
                                                         :trigger           :manual
                                                         :algorithm_version 1
                                                         :source_config     {}
                                                         :finished_at       (mi/now)}
                   :model/UsageMetadataCandidate missing-candidate
                   (candidate-row (:id run)
                                  {:suggested_name "Missing"
                                   :display_name "Missing"
                                   :signature_hash (apply str (repeat 64 "1"))
                                   :signature "[\"missing\"]"})
                   :model/UsageMetadataCandidate _review-candidate
                   (candidate-row (:id run)
                                  {:suggested_name "Review"
                                   :display_name "Review"
                                   :modeling_status :partially-modeled
                                   :signature_hash (apply str (repeat 64 "2"))
                                   :signature "[\"review\"]"})
                   :model/UsageMetadataCandidate modeled-candidate
                   (candidate-row (:id run)
                                  {:suggested_name "Modeled"
                                   :display_name "Modeled"
                                   :modeling_status :modeled
                                   :signature_hash (apply str (repeat 64 "3"))
                                   :signature "[\"modeled\"]"})]
      (testing "suggested excludes candidates that are already modeled"
        (is (=? {:total 2}
                (mt/user-http-request :crowberto :get 200
                                      "ee/data-studio/usage-metadata/candidates?queue=suggested")))
        (is (=? {:total 1
                 :data [{:table {:id (mt/id :orders)}
                         :candidate_count 2}]}
                (mt/user-http-request :crowberto :get 200
                                      "ee/data-studio/usage-metadata/tables?queue=suggested"))))
      (testing "modeled candidates that are still used raw have a dedicated queue"
        (is (=? {:total 1
                 :data [{:id (:id modeled-candidate)
                         :modeling_status "modeled"}]}
                (mt/user-http-request :crowberto :get 200
                                      "ee/data-studio/usage-metadata/candidates?queue=used-raw")))
        (is (=? {:total 1
                 :data [{:table {:id (mt/id :orders)}
                         :candidate_count 1}]}
                (mt/user-http-request :crowberto :get 200
                                      "ee/data-studio/usage-metadata/tables?queue=used-raw")))
        (testing "a previous dismissal does not hide raw usage after it becomes modeled"
          (mt/user-http-request :crowberto :post 200
                                (str "ee/data-studio/usage-metadata/candidates/" (:id modeled-candidate) "/dismiss")
                                {})
          (is (=? {:total 1
                   :data [{:id (:id modeled-candidate)}]}
                  (mt/user-http-request :crowberto :get 200
                                        "ee/data-studio/usage-metadata/candidates?queue=used-raw")))))
      (testing "discarded suggestions have a dedicated queue"
        (mt/user-http-request :crowberto :post 200
                              (str "ee/data-studio/usage-metadata/candidates/" (:id missing-candidate) "/dismiss")
                              {})
        (is (=? {:total 1}
                (mt/user-http-request :crowberto :get 200
                                      "ee/data-studio/usage-metadata/candidates?queue=suggested")))
        (is (=? {:total 1
                 :data [{:id (:id missing-candidate), :dismissed true}]}
                (mt/user-http-request :crowberto :get 200
                                      "ee/data-studio/usage-metadata/candidates?queue=discarded")))))))

(deftest create-candidate-is-idempotent-test
  (mt/with-premium-features #{:library}
    (mt/with-model-cleanup [:model/Measure :model/Segment]
      (let [table-id           (mt/id :orders)
            measure-definition (measures.tu/measure-definition table-id (mt/id :orders :subtotal))
            segment-definition (measures.tu/segment-definition table-id (mt/id :orders :total) 100)
            measure-signature  (definition-signature :measure table-id measure-definition)
            segment-signature  (definition-signature :segment table-id segment-definition)]
        (mt/with-temp [:model/UsageMetadataCandidateRun run {:status            :succeeded
                                                             :trigger           :manual
                                                             :algorithm_version 1
                                                             :source_config     {}
                                                             :finished_at       (mi/now)}
                       :model/UsageMetadataCandidate measure-candidate
                       (candidate-row (:id run)
                                      {:candidate_type        :measure
                                       :signature_hash        (apply str (repeat 64 "e"))
                                       :signature             measure-signature
                                       :definition            measure-definition
                                       :suggested_name        "Mined order subtotal"
                                       :display_name          "Mined order subtotal"
                                       :suggested_description "A persisted Measure candidate"})
                       :model/UsageMetadataCandidate segment-candidate
                       (candidate-row (:id run)
                                      {:signature_hash        (apply str (repeat 64 "f"))
                                       :signature             segment-signature
                                       :definition            segment-definition
                                       :suggested_name        "Mined large orders"
                                       :display_name          "Mined large orders"
                                       :suggested_description "A persisted Segment candidate"})]
          (mt/with-temp-vals-in-db :model/Table table-id {:is_published true}
            (mt/user->id :crowberto)
            (let [after-commit-callbacks (atom [])
                  published-events      (atom [])]
              (binding [*published-candidate-create-events* published-events]
                (mt/with-dynamic-fn-redefs [mdb/do-after-commit
                                            (fn [callback]
                                              (swap! after-commit-callbacks conj callback))]
                  (doseq [[candidate model expected-name]
                          [[measure-candidate :model/Measure "Created order subtotal"]
                           [segment-candidate :model/Segment "Created large orders"]]]
                    (testing (str "creates " (name (:candidate_type candidate)) " from its persisted definition")
                      (let [path     (str "ee/data-studio/usage-metadata/candidates/" (:id candidate) "/create")
                            response (mt/user-http-request :crowberto :post 200 path
                                                           {:name expected-name
                                                            :description "Admin override"})
                            entity   (:entity response)]
                        (is (= expected-name (:name entity)))
                        (is (= "Admin override" (:description entity)))
                        (is (= (dissoc (:definition candidate) :lib/metadata)
                               (:definition entity)))
                        (is (= "modeled" (get-in response [:candidate :modeling_status])))
                        (is (= 1 (count (get-in response [:candidate :matches]))))
                        (is (= (:id entity)
                               (get-in (mt/user-http-request :crowberto :post 200 path {}) [:entity :id])))
                        (is (= 1 (t2/count model :name expected-name)))))))
                (is (empty? @published-events)
                    "creation events are deferred until the candidate transaction commits")
                (is (= 2 (count @after-commit-callbacks)))
                (run! (fn [callback] (callback)) @after-commit-callbacks)
                (is (= [{:topic :event/measure-create, :visible? true}
                        {:topic :event/segment-create, :visible? true}]
                       @published-events))))))))))
