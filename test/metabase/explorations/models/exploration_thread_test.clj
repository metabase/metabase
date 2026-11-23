(ns metabase.explorations.models.exploration-thread-test
  (:require
   [clojure.test :refer :all]
   [metabase.events.test-util :as events.tu]
   [metabase.explorations.models.exploration-thread :as exploration-thread]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private transcript
  "What [[metabase.explorations.query-plan/record-outcome!]] persists. `:outcome`, `:note` and
  `:planner` are keywords — the orchestrator speaks the same ones the planner protocol does, and
  the `::exploration-thread.query-plan-transcript` schema translates them at the storage boundary."
  {:generated-at "2026-08-28T00:00:00Z"
   :thread-id    7
   :planner      :mechanical
   :outcome      :skip-empty
   :note         :no-rows-materialized
   :transcript   {:outcome :ok
                  :plan    [{:block_id 1 :metric_id 2 :dimension_id "d1" :variant "top-n-other"}]
                  :planner-notes {:strategy "mechanical" :n-items 1 :n-blocks 1}}})

(def ^:private transcript-with-full-plan-item
  "A plan item carrying every field `::transcript/plan-item` names, including the optional `:params`
  and `:rationale` an LLM planner adds."
  (assoc-in transcript [:transcript :plan]
            [{:block_id 1 :metric_id 2 :dimension_id "d1" :variant "top-n-other"
              :params {:k 5} :rationale "the tail is long"}]))

(defn- thread-with-transcript!
  [transcript]
  (let [expl (t2/insert-returning-pk! :model/Exploration {:name "t" :creator_id (mt/user->id :lucky)})]
    (t2/insert-returning-pk! :model/ExplorationThread {:exploration_id        expl
                                                       :position              0
                                                       :query_plan_transcript transcript})))

(defn- raw-transcript
  [id]
  (:query_plan_transcript (t2/query-one {:select [:query_plan_transcript]
                                         :from   [:exploration_thread]
                                         :where  [:= :id id]})))

(deftest transcript-is-stored-as-json-test
  (testing "query_plan_transcript is plain JSON at rest — the keywords it carries in memory are
            written out as strings, and a plan item's `:variant`, which is a string to begin with,
            stays one"
    (let [id (thread-with-transcript! transcript)]
      (is (= {"generated-at" "2026-08-28T00:00:00Z"
              "thread-id"    7
              "planner"      "mechanical"
              "outcome"      "skip-empty"
              "note"         "no-rows-materialized"
              "transcript"   {"outcome" "ok"
                              "plan"    [{"block_id" 1 "metric_id" 2
                                          "dimension_id" "d1" "variant" "top-n-other"}]
                              "planner-notes" {"strategy" "mechanical" "n-items" 1 "n-blocks" 1}}}
             (json/decode (raw-transcript id)))))))

(deftest transcript-round-trip-test
  (testing "the transcript reads back exactly as written: the schema-driven codec restores
            `:outcome`, `:note` and `:planner` as keywords, and leaves `:variant` a string"
    (let [id  (thread-with-transcript! transcript)
          out (t2/select-one-fn :query_plan_transcript :model/ExplorationThread :id id)]
      (is (= transcript out))
      (is (= :skip-empty (:outcome out)))
      (is (= "top-n-other" (-> out :transcript :plan first :variant))))))

(deftest transcript-unparseable-reads-as-nil-test
  (testing "an unparseable blob is logged and read as nil rather than breaking the thread read"
    (let [id (thread-with-transcript! nil)]
      (t2/query {:update :exploration_thread
                 :set    {:query_plan_transcript "{not json ]["}
                 :where  [:= :id id]})
      (is (nil? (t2/select-one-fn :query_plan_transcript :model/ExplorationThread :id id))))))

(deftest transcript-plan-items-round-trip-test
  (testing "a plan item's optional `:params` and `:rationale` survive the round trip"
    (let [id (thread-with-transcript! transcript-with-full-plan-item)]
      (is (= transcript-with-full-plan-item
             (t2/select-one-fn :query_plan_transcript :model/ExplorationThread :id id))))))

(deftest write-function-statement-counts-do-not-grow-with-rows-test
  (mt/with-temp [:model/Exploration {exploration-id :id} {}]
    (let [started-at (java.time.Instant/now)
          rows    (fn [n] (mapv (fn [i] {:exploration_id exploration-id :position i :name (mt/random-name)}) (range n)))
          fresh!  (fn [n] (mapv :id (exploration-thread/create-threads! (rows n))))
          counted (fn [f]
                    (f 1)
                    (is (= (f 2) (f 6))))
          counted-updates (fn [f]
                            (f 1)
                            (is (<= (- (f 6) (f 2)) (* 2 (- 6 2)))
                                "each more row costs its SELECT by the hook and its UPDATE"))]
      (testing "creating threads"
        (counted (fn [n] (let [rows (rows n)] (events.tu/statement-count! #(exploration-thread/create-threads! rows))))))
      (testing "updating threads, some already holding the new value"
        (counted-updates (fn [n]
                   (let [ids (fresh! n)]
                     (exploration-thread/update-threads! (mapv (fn [id] {:id id :started_at started-at}) (take-nth 2 ids)))
                     (events.tu/statement-count!
                      #(exploration-thread/update-threads! (mapv (fn [id] {:id id :started_at started-at}) ids))))))))))

(deftest thread-without-position-goes-after-the-last-one-test
  (mt/with-temp [:model/Exploration {exploration-id :id} {}
                 :model/Exploration {other-id :id}       {}]
    (let [position (fn [id] (t2/select-one-fn :position :model/ExplorationThread :id id))]
      (testing "the first thread without a position goes after position 0, the next one after it"
        (let [[a b] (repeatedly 2 #(t2/insert-returning-pk! :model/ExplorationThread {:exploration_id exploration-id}))]
          (is (= [1 2] [(position a) (position b)]))))
      (testing "a position that is given is kept, and the next thread goes after the highest one"
        (let [given (t2/insert-returning-pk! :model/ExplorationThread {:exploration_id exploration-id :position 7})
              next  (first (exploration-thread/create-threads! [{:exploration_id exploration-id}]))]
          (is (= 7 (position given)))
          (is (= 8 (:position next)))))
      (testing "the Explorations are counted apart"
        (is (= 1 (position (t2/insert-returning-pk! :model/ExplorationThread {:exploration_id other-id}))))))))
