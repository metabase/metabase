(ns metabase-enterprise.data-studio.api.usage-metadata-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.data-studio.api.usage-metadata :as usage-metadata.api]
   [metabase.app-db.core :as mdb]
   [metabase.collections.models.collection :as collection]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.measures.test-util :as measures.tu]
   [metabase.models.interface :as mi]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.usage-metadata.candidate-mining :as candidate-mining]
   [metabase.usage-metadata.candidate-refresh :as candidate-refresh]
   [metabase.usage-metadata.candidate-snapshot :as candidate-snapshot]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

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

(defn- candidate-row
  ([run-id]
   (candidate-row run-id {}))
  ([run-id overrides]
   (merge
    {:run_id                run-id
     :candidate_type        :segment
     :table_id              (mt/id :orders)
     :signature_version     candidate-snapshot/signature-version
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
     :sort_position         0
     :modeling_status       :missing
     :verified_source_count 1
     :official_source_count 0
     :popular_source_count  1
     :distinct_source_count 1
     :recent_view_count      10
     :complexity            1}
    overrides)))

(deftest manual-refresh-api-dispatches-queued-run-test
  (mt/with-premium-features #{:library}
    (let [run {:id 42, :status :queued}]
      (with-redefs-fn {#'candidate-refresh/queue-refresh! (fn [_trigger _requested-by] run)}
        (fn []
          (is (= {:run_id (:id run)}
                 (mt/user-http-request :crowberto :post 202
                                       "ee/data-studio/usage-metadata/refresh"))))))))

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
                   :modeling_status :dismissed :last_used_at :table :evidence}
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
          (is (= #{:table :candidate_count :recent_view_count}
                 (set (keys (first (:data response))))))))
      (testing "dismiss and restore are global and immediately visible"
        (is (nil? (mt/user-http-request :crowberto :post 204
                                        (str "ee/data-studio/usage-metadata/candidates/" (:id candidate) "/dismiss")
                                        {})))
        (is (= 0 (:total (mt/user-http-request :crowberto :get 200
                                               "ee/data-studio/usage-metadata/candidates"))))
        (is (nil? (mt/user-http-request :crowberto :delete 204
                                        (str "ee/data-studio/usage-metadata/candidates/" (:id candidate) "/dismissal"))))
        (is (=? {:total 1, :data [{:id (:id candidate), :dismissed false}]}
                (mt/user-http-request :crowberto :get 200 "ee/data-studio/usage-metadata/candidates")))))))

(deftest candidate-detail-reports-table-uneditable-for-read-only-remote-synced-table-test
  (mt/with-premium-features #{:library}
    (mt/with-temporary-setting-values [remote-sync-type :read-only]
      (mt/with-temp [:model/Collection {synced-id :id} {:type             collection/library-data-collection-type
                                                        :is_remote_synced true}
                     :model/UsageMetadataCandidateRun run {:status            :succeeded
                                                           :trigger           :manual
                                                           :algorithm_version 1
                                                           :source_config     {}
                                                           :finished_at       (mi/now)}
                     :model/UsageMetadataCandidate candidate (candidate-row (:id run))]
        (mt/with-temp-vals-in-db :model/Table (mt/id :orders) {:is_published true, :collection_id synced-id}
          (testing "the Create button is disabled on the detail response, not just the create endpoint"
            (is (=? {:creation_blockers ["table-uneditable"]}
                    (mt/user-http-request :crowberto :get 200
                                          (str "ee/data-studio/usage-metadata/candidates/" (:id candidate)))))))))))

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
                   :entity_id          123456789
                   :entity_name        "Deleted revenue"
                   :entity_description "Snapshot description"})
      (is (=? {:matches [{:relation "exact"
                          :entity_type "measure"
                          :entity {:id          123456789
                                   :name        "Deleted revenue"
                                   :description "Snapshot description"}}]}
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
                                                                    :sort_position 1
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
                                      "ee/data-studio/usage-metadata/candidates?candidate-type=measure&search=zulu"))))
      (testing "limit=0 falls back to the default page size instead of returning an empty page"
        (is (=? {:total 2
                 :limit 50
                 :data [{} {}]}
                (mt/user-http-request :crowberto :get 200
                                      "ee/data-studio/usage-metadata/candidates?limit=0")))))))

(deftest table-and-metric-recommendations-are-listable-test
  (mt/with-premium-features #{:library}
    (mt/with-temp [:model/UsageMetadataCandidateRun run {:status            :succeeded
                                                         :trigger           :manual
                                                         :algorithm_version candidate-refresh/algorithm-version
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
               :creation_blockers ["unsupported-candidate-type"]}
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
                   :recent_view_count 12
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

(defn- used-at?
  "A predicate matching a timestamp at the same instant as `iso-instant`, whatever its offset."
  [iso-instant]
  #(and (some? %) (= (t/instant iso-instant) (t/instant %))))

(deftest candidate-detail-exposes-source-collection-and-last-use-test
  (mt/with-premium-features #{:library}
    (mt/with-temp [:model/Collection collection {:name "Curated metrics", :authority_level "official"}
                   :model/UsageMetadataCandidateRun run {:status            :succeeded
                                                         :trigger           :manual
                                                         :algorithm_version 1
                                                         :source_config     {}
                                                         :finished_at       (mi/now)}
                   :model/UsageMetadataCandidate candidate
                   (candidate-row (:id run) {:last_used_at #t "2026-09-01T10:00:00Z"})]
      (t2/insert! :model/UsageMetadataCandidateSource
                  [{:candidate_id      (:id candidate)
                    :card_id           987654
                    :card_name         "Curated question"
                    :card_type         :question
                    :verified          false
                    :official          true
                    :popular           true
                    :recent_view_count 12
                    :joined            false
                    :stage_numbers     [0]
                    :collection_id     (:id collection)
                    :last_used_at      #t "2026-09-01T10:00:00Z"}
                   {:candidate_id      (:id candidate)
                    :card_id           987655
                    :card_name         "Uncollected question"
                    :card_type         :question
                    :verified          false
                    :official          false
                    :popular           true
                    :recent_view_count 3
                    :joined            false
                    :stage_numbers     [0]}])
      (testing "the list exposes when the candidate's sources were last used"
        (is (=? {:data [{:id (:id candidate), :last_used_at (used-at? "2026-09-01T10:00:00Z")}]}
                (mt/user-http-request :crowberto :get 200 "ee/data-studio/usage-metadata/candidates"))))
      (testing "each source names the Collection it was saved in, as the Collection is named now"
        (t2/update! :model/Collection (:id collection) {:name "Renamed metrics"})
        (is (=? {:sources [{:card_id      987654
                            :last_used_at (used-at? "2026-09-01T10:00:00Z")
                            :collection   {:id              (:id collection)
                                           :name            "Renamed metrics"
                                           :authority_level "official"}}
                           {:card_id      987655
                            :last_used_at nil
                            :collection   nil}]}
                (mt/user-http-request :crowberto :get 200
                                      (str "ee/data-studio/usage-metadata/candidates/" (:id candidate)))))))))

(deftest refresh-status-normalizes-snapshot-summary-test
  (mt/with-premium-features #{:library}
    (mt/with-temp [:model/UsageMetadataCandidateRun _run {:status            :succeeded
                                                          :trigger           :manual
                                                          :algorithm_version 1
                                                          :source_config     {:kind :qualified-cards}
                                                          :summary           {:table-count 3}
                                                          :finished_at       (mi/now)}]
      (let [response (mt/user-http-request :crowberto :get 200
                                           "ee/data-studio/usage-metadata/refresh")]
        (is (= #{:snapshot :active :failure} (set (keys response))))
        (is (= #{:id :finished_at :usage_window_days :summary} (set (keys (:snapshot response)))))
        (is (= {:table_count 3} (:summary (:snapshot response))))))))

(deftest candidate-priority-order-keeps-recommendation-families-together-test
  (mt/with-premium-features #{:library}
    (mt/with-temp [:model/UsageMetadataCandidateRun run {:status            :succeeded
                                                         :trigger           :manual
                                                         :algorithm_version candidate-refresh/algorithm-version
                                                         :source_config     {}
                                                         :finished_at       (mi/now)}
                   :model/UsageMetadataCandidate root
                   (candidate-row (:id run)
                                  {:suggested_name "Shared concept"
                                   :display_name "Shared concept"
                                   :signature_hash (apply str (repeat 64 "7"))
                                   :sort_position 0})
                   :model/UsageMetadataCandidate child
                   (candidate-row (:id run)
                                  {:suggested_name "Shared concept with detail"
                                   :display_name "Shared concept with detail"
                                   :signature_hash (apply str (repeat 64 "8"))
                                   :sort_position 1})
                   :model/UsageMetadataCandidate other
                   (candidate-row (:id run)
                                  {:suggested_name "Other concept"
                                   :display_name "Other concept"
                                   :signature_hash (apply str (repeat 64 "9"))
                                   :sort_position 2
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
          (mt/user-http-request :crowberto :post 204
                                (str "ee/data-studio/usage-metadata/candidates/" (:id modeled-candidate) "/dismiss")
                                {})
          (is (=? {:total 1
                   :data [{:id (:id modeled-candidate)}]}
                  (mt/user-http-request :crowberto :get 200
                                        "ee/data-studio/usage-metadata/candidates?queue=used-raw")))))
      (testing "discarded suggestions have a dedicated queue"
        (mt/user-http-request :crowberto :post 204
                              (str "ee/data-studio/usage-metadata/candidates/" (:id missing-candidate) "/dismiss")
                              {})
        (is (=? {:total 1}
                (mt/user-http-request :crowberto :get 200
                                      "ee/data-studio/usage-metadata/candidates?queue=suggested")))
        (is (=? {:total 1
                 :data [{:id (:id missing-candidate), :dismissed true}]}
                (mt/user-http-request :crowberto :get 200
                                      "ee/data-studio/usage-metadata/candidates?queue=discarded")))))))

(defn- list-ids
  [path & query]
  (mapv :id (:data (apply mt/user-http-request :crowberto :get 200 path query))))

(deftest candidate-review-match-and-type-filters-are-independent-test
  (mt/with-premium-features #{:library}
    (mt/with-temp [:model/UsageMetadataCandidateRun run {:status            :succeeded
                                                         :trigger           :manual
                                                         :algorithm_version 1
                                                         :source_config     {}
                                                         :finished_at       (mi/now)}
                   :model/UsageMetadataCandidate missing-segment
                   (candidate-row (:id run) {:signature_hash (apply str (repeat 64 "1"))
                                             :sort_position  0})
                   :model/UsageMetadataCandidate modeled-measure
                   (candidate-row (:id run) {:candidate_type  :measure
                                             :modeling_status :modeled
                                             :signature_hash  (apply str (repeat 64 "2"))
                                             :sort_position   1})
                   :model/UsageMetadataCandidate discarded-segment
                   (candidate-row (:id run) {:modeling_status :partially-modeled
                                             :signature_hash  (apply str (repeat 64 "3"))
                                             :sort_position   2})]
      (mt/user-http-request :crowberto :post 204
                            (str "ee/data-studio/usage-metadata/candidates/" (:id discarded-segment) "/dismiss") {})
      (let [candidates "ee/data-studio/usage-metadata/candidates"]
        (testing "by default the list is everything still to review, matched or not"
          (is (= [(:id missing-segment) (:id modeled-measure)] (list-ids candidates))))
        (testing "both review states together show discarded candidates alongside the rest"
          (is (= [(:id missing-segment) (:id modeled-measure) (:id discarded-segment)]
                 (list-ids candidates :review "to-review" :review "discarded")))
          (is (=? {:data [{} {} {:id (:id discarded-segment), :dismissed true}]}
                  (mt/user-http-request :crowberto :get 200 candidates :review "to-review" :review "discarded"))))
        (testing "Library match narrows independently of review state"
          (is (= [(:id modeled-measure) (:id discarded-segment)]
                 (list-ids candidates :review "to-review" :review "discarded"
                           :modeling-status "modeled" :modeling-status "partially-modeled")))
          (is (= [(:id missing-segment)] (list-ids candidates :modeling-status "missing"))))
        (testing "several candidate types at once"
          (is (= [(:id missing-segment) (:id modeled-measure)]
                 (list-ids candidates :candidate-type "segment" :candidate-type "measure")))
          (is (= [(:id modeled-measure)] (list-ids candidates :candidate-type "measure"))))
        (testing "the deprecated queue still means what it did when no new filter is given"
          (is (= [(:id missing-segment)] (list-ids candidates :queue "suggested")))
          (is (= [(:id discarded-segment)] (list-ids candidates :queue "discarded"))))))))

(deftest candidate-table-and-recency-filters-test
  (mt/with-premium-features #{:library}
    (mt/with-temp-vals-in-db :model/Table (mt/id :orders) {:is_published true}
      (mt/with-temp [:model/UsageMetadataCandidateRun run {:status            :succeeded
                                                           :trigger           :manual
                                                           :algorithm_version 1
                                                           :source_config     {}
                                                           :finished_at       (mi/now)}
                     :model/UsageMetadataCandidate orders-candidate
                     (candidate-row (:id run) {:signature_hash (apply str (repeat 64 "1"))
                                               :last_used_at   #t "2026-09-10T12:00:00Z"})
                     :model/UsageMetadataCandidate people-candidate
                     (candidate-row (:id run) {:table_id       (mt/id :people)
                                               :signature_hash (apply str (repeat 64 "2"))
                                               :last_used_at   #t "2026-08-01T12:00:00Z"})
                     :model/UsageMetadataCandidate unused-candidate
                     (candidate-row (:id run) {:table_id       (mt/id :venues)
                                               :signature_hash (apply str (repeat 64 "3"))})]
        (let [candidates "ee/data-studio/usage-metadata/candidates"]
          (testing "Table library status"
            (is (= [(:id orders-candidate)] (list-ids candidates :table-published "true")))
            (is (= #{(:id people-candidate) (:id unused-candidate)}
                   (set (list-ids candidates :table-published "false")))))
          (testing "schema, as the Table is shown to users"
            (is (= 3 (count (list-ids candidates :database-id (mt/id) :schema "PUBLIC"))))
            (is (empty? (list-ids candidates :database-id (mt/id) :schema "NOPE"))))
          (testing "last used, with an inclusive start and an exclusive end; never-used candidates fall outside any range"
            (is (= [(:id orders-candidate)] (list-ids candidates :last-used-from "2026-09-01")))
            (is (= [(:id people-candidate)]
                   (list-ids candidates :last-used-from "2026-08-01T12:00:00Z" :last-used-to "2026-09-10T12:00:00Z")))))))))

(deftest candidate-and-table-lists-sort-test
  (mt/with-premium-features #{:library}
    (mt/with-temp [:model/UsageMetadataCandidateRun run {:status            :succeeded
                                                         :trigger           :manual
                                                         :algorithm_version 1
                                                         :source_config     {:usage-window-days 90}
                                                         :finished_at       (mi/now)}
                   :model/UsageMetadataCandidate quiet
                   (candidate-row (:id run) {:display_name      "Alpha"
                                             :recent_view_count 5
                                             :signature_hash    (apply str (repeat 64 "1"))
                                             :sort_position     0})
                   :model/UsageMetadataCandidate busy
                   (candidate-row (:id run) {:display_name      "Beta"
                                             :recent_view_count 50
                                             :signature_hash    (apply str (repeat 64 "2"))
                                             :sort_position     1})
                   :model/UsageMetadataCandidate people
                   (candidate-row (:id run) {:table_id          (mt/id :people)
                                             :display_name      "Gamma"
                                             :recent_view_count 30
                                             :signature_hash    (apply str (repeat 64 "3"))
                                             :sort_position     2})]
      (let [source (fn [candidate card-id views]
                     {:candidate_id (:id candidate), :card_id card-id, :card_name "Card", :card_type :question
                      :verified false, :official false, :popular true, :recent_view_count views, :joined false
                      :stage_numbers [0]})]
        ;; Card 1 feeds both Orders candidates, so it counts once towards the Orders Table.
        (t2/insert! :model/UsageMetadataCandidateSource
                    [(source quiet 1 5) (source busy 1 5) (source busy 2 45) (source people 3 30)]))
      (let [candidates "ee/data-studio/usage-metadata/candidates"
            tables     "ee/data-studio/usage-metadata/tables"]
        (testing "candidates keep family order unless asked to sort"
          (is (= [(:id quiet) (:id busy) (:id people)] (list-ids candidates)))
          (is (= [(:id busy) (:id people) (:id quiet)]
                 (list-ids candidates :sort-column "views" :sort-direction "desc")))
          (is (= [(:id quiet) (:id busy) (:id people)] (list-ids candidates :sort-column "name"))))
        (testing "list rows carry their Table"
          (is (=? {:data [{:table {:id (mt/id :orders), :database {:id (mt/id)}}}]}
                  (mt/user-http-request :crowberto :get 200 candidates :limit 1))))
        (testing "Table views count each source Card once, and Tables sort by them"
          (is (=? {:data [{:table {:id (mt/id :orders)}, :candidate_count 2, :recent_view_count 50}
                          {:table {:id (mt/id :people)}, :candidate_count 1, :recent_view_count 30}]}
                  (mt/user-http-request :crowberto :get 200 tables :sort-column "views" :sort-direction "desc")))
          (is (= [(mt/id :people) (mt/id :orders)]
                 (mapv (comp :id :table)
                       (:data (mt/user-http-request :crowberto :get 200 tables
                                                    :sort-column "views" :sort-direction "asc"))))))
        (testing "the snapshot says how many days its view counts cover"
          (is (=? {:snapshot {:usage_window_days 90}}
                  (mt/user-http-request :crowberto :get 200 candidates))))))))

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
                  published-events       (atom [])]
              (mt/with-dynamic-fn-redefs [mdb/do-after-commit #(swap! after-commit-callbacks conj %)]
                (binding [*published-candidate-create-events* published-events]
                  (doseq [[candidate model expected-name]
                          [[measure-candidate :model/Measure "Created order subtotal"]
                           [segment-candidate :model/Segment "Created large orders"]]]
                    (testing (str "creates " (name (:candidate_type candidate)) " from its persisted definition")
                      (let [path      (str "ee/data-studio/usage-metadata/candidates/" (:id candidate) "/create")
                            start     (promise)
                            requests  (mapv (fn [_]
                                              (future
                                                @start
                                                (mt/user-http-request :crowberto :post 200 path
                                                                      {:name expected-name
                                                                       :description "Admin override"})))
                                            (range 2))
                            _         (deliver start true)
                            responses (mapv deref requests)
                            response  (first responses)
                            entity   (t2/select-one model :id (:id response))]
                        (is (apply = (map :id responses)) "concurrent creation is idempotent")
                        (is (= expected-name (:name entity)))
                        (is (= "Admin override" (:description entity)))
                        (is (= (lib/normalize (:definition candidate))
                               (dissoc (lib/normalize (:definition entity)) :lib/metadata)))
                        (is (=? {:modeling_status "modeled", :matches [{:relation "exact"}]}
                                (mt/user-http-request :crowberto :get 200
                                                      (str "ee/data-studio/usage-metadata/candidates/"
                                                           (:id candidate)))))
                        (is (= (:id entity)
                               (:id (mt/user-http-request :crowberto :post 200 path {}))))
                        (is (= 1 (t2/count model :name expected-name))))))
                  (let [callbacks @after-commit-callbacks]
                    (is (every? fn? callbacks))
                    (is (empty? @published-events) "create events remain deferred until commit")
                    (run! (fn [callback]
                            (callback))
                          callbacks))
                  (is (= [{:topic :event/measure-create, :visible? true}
                          {:topic :event/segment-create, :visible? true}]
                         @published-events)
                      "creation publishes after commit once the entity is visible"))))))))))
