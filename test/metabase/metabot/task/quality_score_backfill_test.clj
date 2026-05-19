(ns metabase.metabot.task.quality-score-backfill-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.metabot.quality.constants :as quality.constants]
   [metabase.metabot.quality.core :as quality.core]
   [metabase.metabot.quality.corpus-stats :as quality.corpus-stats]
   [metabase.metabot.task.quality-score-backfill :as quality.backfill]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2])
  (:import
   (java.time OffsetDateTime)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :test-users))

;; ---------------------------------------------------------------------------
;; Fixture helpers
;; ---------------------------------------------------------------------------

(defn- insert-conversation!
  "Insert a `MetabotConversation` plus a (user, assistant) `MetabotMessage`
  pair so the backfill has something readable to score. `quality-seed` lets a
  caller pre-populate the score columns to model the already-scored case."
  ([] (insert-conversation! nil))
  ([{:keys [quality_score quality_breakdown]}]
   (let [conversation-id (str (random-uuid))
         user-id         (mt/user->id :rasta)
         now             (OffsetDateTime/now)]
     (t2/insert! :model/MetabotConversation
                 (cond-> {:id conversation-id :user_id user-id}
                   (some? quality_score)     (assoc :quality_score     quality_score)
                   (some? quality_breakdown) (assoc :quality_breakdown quality_breakdown)))
     (t2/insert! :model/MetabotMessage
                 {:conversation_id conversation-id
                  :role            :user
                  :profile_id      "internal"
                  :external_id     (str (random-uuid))
                  :total_tokens    0
                  :data            [{:role "user" :content "hi"}]
                  :created_at      now
                  :finished        true})
     (t2/insert! :model/MetabotMessage
                 {:conversation_id conversation-id
                  :role            :assistant
                  :profile_id      "internal"
                  :external_id     (str (random-uuid))
                  :total_tokens    100
                  :data            [{:type "text" :text "hello"}]
                  :created_at      (.plusSeconds now 1)
                  :finished        true})
     conversation-id)))

;; ---------------------------------------------------------------------------
;; Discovery query — real SQL, proves WHERE quality_breakdown IS NULL is honored
;; ---------------------------------------------------------------------------

(deftest unprocessed-conversation-ids-returns-only-null-breakdown-rows-test
  (testing "the discovery query returns NULL-quality_breakdown rows and excludes
            rows that already carry any breakdown (real score or sentinel)"
    (t2/with-transaction [_conn nil {:rollback-only true}]
      (let [unprocessed-id (insert-conversation!)
            scored-id      (insert-conversation! {:quality_score     -0.42
                                                  :quality_breakdown {:tag "pre"}})
            sentinel-id    (insert-conversation! {:quality_breakdown {:unscored_reason "old-format"}})
            discovered     (set (#'quality.backfill/unprocessed-conversation-ids))]
        (is (contains? discovered unprocessed-id)
            "a never-attempted conversation must be discoverable")
        (is (not (contains? discovered scored-id))
            "an already-scored conversation must not be discoverable")
        (is (not (contains? discovered sentinel-id))
            "a sentinel-marked (format-era) conversation must not be re-discovered")))))

;; ---------------------------------------------------------------------------
;; Drain-to-empty loop — pure unit test of the loop semantics
;; ---------------------------------------------------------------------------

(deftest backfill-drains-across-multiple-batches-test
  (testing "the job loops batches until the discovery query returns empty,
            not stopping at batch-size — bounded by data, not by an arbitrary
            per-invocation cap"
    (let [;; Discovery returns ids in three batches: 2, 2, 0.
          batches (atom [["id-1" "id-2"] ["id-3" "id-4"] []])
          scored  (atom [])]
      (with-redefs [quality.backfill/unprocessed-conversation-ids
                    (fn []
                      (let [batch (first @batches)]
                        (swap! batches rest)
                        batch))
                    quality.core/score-conversation!
                    (fn [id _threshold]
                      (swap! scored conj id)
                      -0.1)]
        (#'quality.backfill/backfill-quality-scores!))
      (is (= ["id-1" "id-2" "id-3" "id-4"] @scored)
          "every id across every batch must be dispatched to score-conversation!"))))

(deftest backfill-drain-terminates-when-batch-is-all-sentinel-test
  (testing "when every score-conversation! returns :sentinel (format-era), the
            drain still terminates — sentinels write a non-NULL breakdown so
            the discovery query no longer offers them. The first version of
            this loop kept re-discovering format-era rows because the UPDATE
            wrote NULL/NULL and the WHERE quality_score IS NULL discovery
            re-found the same rows forever."
    (let [batches (atom [["id-1" "id-2" "id-3"] []])
          calls   (atom 0)]
      (with-redefs [quality.corpus-stats/outlier-threshold (constantly nil)
                    quality.backfill/unprocessed-conversation-ids
                    (fn []
                      (let [b (first @batches)]
                        (swap! batches rest)
                        b))
                    quality.core/score-conversation!
                    (fn [_id _threshold]
                      (swap! calls inc)
                      :sentinel)]
        (#'quality.backfill/backfill-quality-scores!))
      (is (= 3 @calls)
          "every discovered id was dispatched exactly once — no re-iteration")
      (is (empty? @batches)
          "discovery was drained to the empty terminator, not stuck in a loop"))))

(deftest backfill-attempted-set-skips-errored-row-within-same-run-test
  (testing "a row whose score-conversation! returns nil (caught throw — no
            UPDATE fires, breakdown stays NULL) joins the in-run attempted-set
            so the next discovery iteration does not re-dispatch it. Without
            this, a poisoned row would loop within a single run since its
            breakdown stays NULL across attempts."
    (let [;; Discovery keeps offering the same id; only the attempted-set
          ;; can stop the loop.
          calls (atom [])]
      (with-redefs [quality.corpus-stats/outlier-threshold (constantly nil)
                    quality.backfill/unprocessed-conversation-ids
                    (constantly ["poison-id"])
                    quality.core/score-conversation!
                    (fn [id _threshold]
                      (swap! calls conj id)
                      nil)]
        (#'quality.backfill/backfill-quality-scores!))
      (is (= ["poison-id"] @calls)
          "the poisoned id is dispatched exactly once even though discovery
           keeps offering it — the attempted-set is the loop's escape hatch
           for the errored-and-still-NULL case"))))

(deftest backfill-fetches-corpus-threshold-once-per-run-test
  (testing "outlier-threshold is fetched exactly once per backfill invocation
            and threaded through to every per-row score call — dev mode
            bypasses the corpus-stats memoization, so per-row lookups would
            otherwise dominate the run"
    (let [batches         (atom [["id-1" "id-2" "id-3"] []])
          threshold-calls (atom 0)
          threshold-info  {:threshold 250000 :corpus-size 800}
          score-calls     (atom [])]
      (with-redefs [quality.backfill/unprocessed-conversation-ids
                    (fn []
                      (let [batch (first @batches)]
                        (swap! batches rest)
                        batch))
                    quality.corpus-stats/outlier-threshold
                    (fn []
                      (swap! threshold-calls inc)
                      threshold-info)
                    quality.core/score-conversation!
                    (fn [id threshold]
                      (swap! score-calls conj [id threshold])
                      -0.1)]
        (#'quality.backfill/backfill-quality-scores!))
      (is (= 1 @threshold-calls)
          "outlier-threshold must be fetched exactly once per backfill invocation")
      (is (= [["id-1" threshold-info]
              ["id-2" threshold-info]
              ["id-3" threshold-info]]
             @score-calls)
          "the pre-fetched threshold-info must be passed verbatim to every score call"))))

;; ---------------------------------------------------------------------------
;; Integration — real DB writes, real score-conversation!
;; ---------------------------------------------------------------------------

(deftest backfill-populates-unscored-rows-test
  (testing "the daily job populates quality_score on rows where it is NULL
            and leaves already-scored rows untouched"
    (mt/with-prometheus-system! [_ system]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (with-redefs [quality.corpus-stats/outlier-threshold (constantly nil)]
          (let [unscored-1 (insert-conversation!)
                unscored-2 (insert-conversation!)
                pre-tag    {:tag "pre-existing"}
                scored-1   (insert-conversation! {:quality_score     -0.42
                                                  :quality_breakdown pre-tag})
                ;; Scope the discovery to our test ids — the dev appdb may
                ;; hold thousands of pre-existing NULL rows that the
                ;; drain-to-empty loop would otherwise iterate. The discovery
                ;; query itself is exercised by
                ;; `unprocessed-conversation-ids-returns-only-null-breakdown-rows-test`.
                queue      (atom [[unscored-1 unscored-2] []])
                fetch      (fn [id]
                             (t2/select-one [:model/MetabotConversation
                                             :quality_score :quality_breakdown]
                                            :id id))]
            (with-redefs [quality.backfill/unprocessed-conversation-ids
                          (fn []
                            (let [batch (first @queue)]
                              (swap! queue rest)
                              batch))]
              (#'quality.backfill/backfill-quality-scores!))
            (testing "previously NULL rows acquire scores"
              (doseq [id [unscored-1 unscored-2]]
                (let [row (fetch id)]
                  (is (some? (:quality_score row))
                      (str "quality_score should be populated for " id))
                  (is (map? (:quality_breakdown row))
                      (str "quality_breakdown should be populated for " id)))))
            (testing "already-scored rows are not re-scored"
              (let [row (fetch scored-1)]
                (is (= -0.42 (:quality_score row)))
                (is (= pre-tag (:quality_breakdown row))))))))
      (testing "Prometheus error counter is not incremented on a clean run"
        (is (== 0 (mt/metric-value system :metabase-metabot/quality-score-errors)))))))

;; ---------------------------------------------------------------------------
;; Self-defeat regression — the corpus-stats query must not filter by score
;; ---------------------------------------------------------------------------

(deftest corpus-stats-does-not-self-defeat-on-unscored-rows-test
  (testing "corpus-stats/outlier-threshold's corpus query does NOT filter by
            quality_score IS NOT NULL — were it to, every backfill pass would
            see a starved corpus and n-expensive-turn would never fire"
    (t2/with-transaction [_conn nil {:rollback-only true}]
      (with-redefs [quality.constants/min-corpus-size 1]
        (let [before-size     (or (:corpus-size (quality.corpus-stats/outlier-threshold)) 0)
              conversation-id (str (random-uuid))
              user-id         (mt/user->id :rasta)
              now             (OffsetDateTime/now)]
          (t2/insert! :model/MetabotConversation
                      {:id conversation-id :user_id user-id})
          (doseq [i (range 3)]
            (t2/insert! :model/MetabotMessage
                        {:conversation_id conversation-id
                         :role            :assistant
                         :profile_id      "internal"
                         :external_id     (str (random-uuid))
                         :total_tokens    (+ 100000 (* i 1000))
                         :data            [{:type "text" :text "x"}]
                         :created_at      (.plusSeconds now (long i))
                         :finished        true}))
          (let [{:keys [threshold corpus-size]} (quality.corpus-stats/outlier-threshold)]
            (is (= (+ before-size 3) corpus-size)
                "all three new assistant turns must be counted, even though their conversation's quality_score is still NULL")
            (is (number? threshold))))))))
