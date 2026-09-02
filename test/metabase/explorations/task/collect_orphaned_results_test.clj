(ns metabase.explorations.task.collect-orphaned-results-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.documents.prose-mirror :as prose-mirror]
   [metabase.explorations.task.collect-orphaned-results :as collect]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- venues-count-query
  "A valid metric query. These rows are inserted raw (no `with-temp` cleanup) and so outlive the test,
  and `metabase.health-inspector` scores every non-archived card in the app DB against the query
  schema — an invalid `dataset_query` here would drag that score down for the whole run."
  []
  (let [mp (mt/metadata-provider)]
    (lib/->legacy-MBQL (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                           (lib/aggregate (lib/count))))))

(defn- blob!
  "A `stored_result`, back-dated past the sweep's grace period unless `:fresh?`."
  [& {:keys [fresh?]}]
  (let [id (t2/insert-returning-pk! :model/StoredResult
                                    {:result_data       (byte-array [7 7 7])
                                     :creator_id        (mt/user->id :lucky)
                                     :database_id       (mt/id)
                                     :dataset_query     {}
                                     :row_count         1
                                     :data_access_token {}})]
    (when-not fresh?
      (t2/query-one {:update 'stored_result
                     :set    {:created_at (t/minus (t/offset-date-time) (t/hours 6))}
                     :where  ['= 'id id]}))
    id))

(defn- exploration-with-query!
  "An exploration whose one query row is ready to hang an `exploration_query_result` off.
  Returns `{:exploration-id :query-id}`."
  []
  (let [creator (mt/user->id :lucky)
        card    (t2/insert-returning-pk! :model/Card
                                         {:name "m" :type :metric :creator_id creator
                                          :database_id (mt/id) :dataset_query (venues-count-query)
                                          :display "table" :visualization_settings {}})
        expl    (t2/insert-returning-pk! :model/Exploration {:name "sweep" :creator_id creator})
        thread  (t2/insert-returning-pk! :model/ExplorationThread {:exploration_id expl :position 0})
        block   (t2/insert-returning-pk! :model/ExplorationBlock {:exploration_thread_id thread})
        page    (t2/insert-returning-pk! :model/ExplorationPage
                                         {:exploration_block_id block :card_id card
                                          :dimension_id "d1" :query_type "default"})
        eq      (t2/insert-returning-pk! :model/ExplorationQuery
                                         {:exploration_thread_id thread :card_id card :page_id page
                                          :database_id (mt/id) :dimension_id "d1"
                                          :status "done" :position 0})]
    {:exploration-id expl :query-id eq}))

(deftest collects-blobs-left-behind-by-a-deleted-exploration-test
  (testing "deleting an exploration cascades away every row that referenced its result blobs — the
            `exploration_query_result` rows through thread → query, and the `stored_result_use` rows
            through their own FK — but cannot touch the blobs themselves, because every FK points
            *at* `stored_result`. The sweep is what collects them."
    (let [{:keys [exploration-id query-id]} (exploration-with-query!)
          orphan (blob!)]
      (t2/insert! :model/ExplorationQueryResult
                  {:exploration_query_id query-id :stored_result_id orphan})
      (t2/insert! :model/StoredResultUse
                  {:stored_result_id orphan :exploration_id exploration-id})
      (testing "control: while the exploration lives, the blob is reachable and kept"
        (collect/collect-orphaned-results!)
        (is (true? (t2/exists? :model/StoredResult 'id orphan))))
      (t2/delete! :model/Exploration 'id exploration-id)
      (is (true? (t2/exists? :model/StoredResult 'id orphan))
          "sanity: the delete itself leaves the blob behind — that is the bug being swept up")
      (collect/collect-orphaned-results!)
      (is (false? (t2/exists? :model/StoredResult 'id orphan))))))

(deftest collects-blobs-stranded-by-a-restart-test
  (testing "restarting a thread deletes its query rows, taking the `exploration_query_result` rows
            with them while leaving `stored_result_use` behind — the exploration still exists. The
            blob is unreachable from that moment, so keying the sweep on reachability rather than on
            `stored_result_use` is what stops a blob leaking on every restart."
    (let [{:keys [exploration-id query-id]} (exploration-with-query!)
          orphan (blob!)]
      (t2/insert! :model/ExplorationQueryResult
                  {:exploration_query_id query-id :stored_result_id orphan})
      (t2/insert! :model/StoredResultUse
                  {:stored_result_id orphan :exploration_id exploration-id})
      ;; what `reset-thread-for-rerun!` does
      (t2/delete! :model/ExplorationQuery 'id query-id)
      (is (= 1 (t2/count :model/StoredResultUse 'stored_result_id orphan))
          "sanity: the use row survives a restart, so it cannot be the keep-alive signal")
      (collect/collect-orphaned-results!)
      (is (false? (t2/exists? :model/StoredResult 'id orphan))))))

(deftest keeps-reachable-and-too-recent-blobs-test
  (testing "a blob an `exploration_query_result` still points at is reachable and must be kept"
    (let [{:keys [query-id]} (exploration-with-query!)
          live               (blob!)]
      (t2/insert! :model/ExplorationQueryResult
                  {:exploration_query_id query-id :stored_result_id live})
      (collect/collect-orphaned-results!)
      (is (true? (t2/exists? :model/StoredResult 'id live)))))
  (testing "an unreferenced blob inside the grace period is left alone, so a writer that links its
            result row in a later transaction can never have it collected mid-flight"
    (let [fresh (blob! :fresh? true)]
      (collect/collect-orphaned-results!)
      (is (true? (t2/exists? :model/StoredResult 'id fresh))))))

(deftest collecting-a-blob-cascades-its-use-rows-test
  (testing "deleting the blob takes its `stored_result_use` bookkeeping with it, so the sweep leaves
            no dangling rows behind"
    (let [{:keys [exploration-id]} (exploration-with-query!)
          orphan                   (blob!)]
      (t2/insert! :model/StoredResultUse
                  {:stored_result_id orphan :exploration_id exploration-id})
      (collect/collect-orphaned-results!)
      (is (false? (t2/exists? :model/StoredResult 'id orphan)))
      (is (zero? (t2/count :model/StoredResultUse 'stored_result_id orphan))))))

(defn- summary-embed-card!
  "The ephemeral `report_card` a Summary `cardEmbed` renders through, scoped to an exploration's
  Summary `document`. Returns its id."
  [exploration-id]
  (let [creator (mt/user->id :lucky)
        doc     (t2/insert-returning-pk! :model/Document
                                         {:name           "Summary"
                                          :document       {:type "doc" :content []}
                                          :content_type   prose-mirror/prose-mirror-content-type
                                          :creator_id     creator
                                          :exploration_id exploration-id})]
    (t2/insert-returning-pk! :model/Card
                             {:name "embed" :type :question :creator_id creator
                              :database_id (mt/id) :dataset_query (venues-count-query)
                              :display "table" :visualization_settings {}
                              :document_id doc})))

(deftest keeps-composite-blobs-a-summary-card-renders-from-test
  (testing "a composite blob is built by combining source snapshots and has no
            `exploration_query_result` of its own — a Summary `cardEmbed`'s Card is its only
            referent. That reference is durable (unlike an `exploration_id` use row, which
            outlives a restart), so it has to keep the blob alive."
    (let [{:keys [exploration-id]} (exploration-with-query!)
          card                     (summary-embed-card! exploration-id)
          composite                (blob!)]
      (t2/insert! :model/StoredResultUse
                  {:stored_result_id composite :card_id card})
      (collect/collect-orphaned-results!)
      (is (true? (t2/exists? :model/StoredResult 'id composite))))))

(deftest keeps-single-query-embed-blobs-past-a-restart-test
  (testing "a single-query embed reuses the source snapshot rather than copying it, so after a
            restart drops the `exploration_query_result` the Card use row is all that is left
            standing between the Summary embed and a sweep."
    (let [{:keys [exploration-id query-id]} (exploration-with-query!)
          card                              (summary-embed-card! exploration-id)
          shared                            (blob!)]
      (t2/insert! :model/ExplorationQueryResult
                  {:exploration_query_id query-id :stored_result_id shared})
      (t2/insert! :model/StoredResultUse
                  {:stored_result_id shared :card_id card})
      (t2/delete! :model/ExplorationQuery 'id query-id)
      (collect/collect-orphaned-results!)
      (is (true? (t2/exists? :model/StoredResult 'id shared))))))

(deftest collects-composite-blobs-once-the-summary-card-is-gone-test
  (testing "deleting the embed's Card cascades its use row away, and with the last referent gone
            the blob becomes collectable — the reference keeps the blob alive, it does not pin it
            forever"
    (let [{:keys [exploration-id]} (exploration-with-query!)
          card                     (summary-embed-card! exploration-id)
          composite                (blob!)]
      (t2/insert! :model/StoredResultUse
                  {:stored_result_id composite :card_id card})
      (t2/delete! :model/Card 'id card)
      (is (zero? (t2/count :model/StoredResultUse 'stored_result_id composite))
          "sanity: the card_id FK cascade takes the use row with the Card")
      (collect/collect-orphaned-results!)
      (is (false? (t2/exists? :model/StoredResult 'id composite))))))
