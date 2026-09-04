(ns metabase.explorations.models.exploration-thread-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private transcript
  "What [[metabase.explorations.query-plan/record-outcome!]] persists. `:outcome`, `:note` and
  `:planner` are keywords — the orchestrator speaks the same ones the planner protocol does, and
  [[metabase.explorations.query-plan.transcript]] translates them at the storage boundary."
  {:generated-at "2026-08-28T00:00:00Z"
   :thread-id    7
   :planner      :mechanical
   :outcome      :skip-empty
   :note         :no-rows-materialized
   :transcript   {:outcome :ok
                  :plan    [{:block_id 1 :metric_id 2 :dimension_id "d1" :variant "top-n-other"}]
                  :planner {:strategy "mechanical" :n-items 1 :n-blocks 1}}})

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
                              "planner" {"strategy" "mechanical" "n-items" 1 "n-blocks" 1}}}
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
