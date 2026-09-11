(ns metabase-enterprise.osi-generation.candidates-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.osi-generation.candidates :as candidates]
   [metabase.entity-retrieval.spec :as spec]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private t0 (java.time.OffsetDateTime/parse "2026-01-01T00:00:00Z"))
(def ^:private t1 (java.time.OffsetDateTime/parse "2026-01-02T00:00:00Z"))

(deftest row-tier-state-machine-test
  (let [tier @#'candidates/tier]
    (is (nil? (tier {:data_source :human})))
    (is (nil? (tier {:data_source :human, :generated_at t1, :rewrite_requested_at t0})))
    (is (nil? (tier {:data_source :human, :generated_at t1, :rewrite_requested_at t1})))
    (is (nil? (tier {:data_source :future-owner, :basis nil})))
    (is (nil? (tier {:data_source :future-owner, :generated_at t0, :rewrite_requested_at t1})))
    (is (= 1 (tier nil)))
    (is (= 1 (tier {:data_source :metabot, :basis nil})))
    (is (= 1 (tier {:data_source :metabot, :basis {}, :generated_at t0, :rewrite_requested_at t1})))
    (is (= 1 (tier {:data_source :human, :basis {}, :generated_at t0, :rewrite_requested_at t1})))
    (is (= 2 (tier {:data_source :metabot, :basis {}, :basis_invalidated_at t0, :invalidated_at t1})))
    (is (= 3 (tier {:data_source :metabot, :basis {}, :basis_invalidated_at t1, :invalidated_at t1})))))

(deftest timestamp-comparison-is-by-instant-not-offset-test
  (let [tier @#'candidates/tier
        same-instant (java.time.OffsetDateTime/parse "2026-01-02T02:00:00+02:00")]
    (is (= 3 (tier {:data_source :metabot, :basis {}, :basis_invalidated_at t1, :invalidated_at same-instant})))))

(defn- select-candidates
  ([limit]
   (select-candidates limit 0 (fn [_ entity] {:entity-type "table", :name (:name entity)})))
  ([limit project-fn]
   (select-candidates limit 0 project-fn))
  ([limit offset project-fn]
   (let [entities [{:entity_type "table", :entity_local_id 1, :name "New"}
                   {:entity_type "table", :entity_local_id 2, :name "Fresh"}
                   {:entity_type "table", :entity_local_id 3, :name "Same"}
                   {:entity_type "table", :entity_local_id 4, :name "Human"}
                   {:entity_type "table", :entity_local_id 5, :name "Converged"}]
         rows [{:entity_type          "table"
                :entity_local_id      1
                :data_source          :metabot
                :ai_context           {}
                :basis                {:name "Old"}
                :generated_at         t0
                :basis_invalidated_at t1
                :invalidated_at       t1}
               {:entity_type          "table"
                :entity_local_id      3
                :data_source          :metabot
                :ai_context           {}
                :basis                {:name "Same"}
                :generated_at         t0
                :basis_invalidated_at t0
                :invalidated_at       t1}
               {:entity_type          "table"
                :entity_local_id      5
                :data_source          :metabot
                :ai_context           {}
                :basis                {:name "Converged"}
                :generated_at         (.minusDays ^java.time.OffsetDateTime t0 1)
                :basis_invalidated_at t1
                :invalidated_at       t1}
               {:entity_type "table", :entity_local_id 4, :data_source :human, :ai_context {}, :basis nil}]]
     (mt/with-dynamic-fn-redefs [spec/member-entities (fn [_] entities)
                                 spec/hydrate (fn [_ xs] xs)
                                 spec/entity-basis (fn [_ entity] (select-keys entity [:name]))
                                 spec/project project-fn
                                 spec/basis-diff (fn [old fresh]
                                                   (when (not= old fresh)
                                                     {:changed [:name], :from old, :to fresh}))
                                 t2/query (fn [& _] rows)]
       (candidates/candidates limit offset)))))

(deftest candidates-are-tier-ordered-and-human-rows-are-excluded-test
  (let [selected (select-candidates nil)]
    (is (= [[2 1] [3 2] [1 3]]
           (mapv (juxt (comp :entity_local_id :entity) :tier) selected)))
    (is (= [1 2 4] (mapv :cursor-advance selected))
        "the cursor includes the converged tier-3 row filtered before the emitted tier-3 candidate")
    (is (nil? (:diff (first selected))))
    (is (= {:entity-type "table", :name "Fresh"} (:llm-input (first selected))))))

(deftest limit-applies-after-tier-ordering-test
  (is (= [2 3]
         (mapv (comp :entity_local_id :entity) (select-candidates 2)))))

(deftest offset-rotates-within-and-across-tiers-test
  (is (= [:b :c :a] (#'candidates/rotate [:a :b :c] 1)))
  (is (= [:a :b :c] (#'candidates/rotate [:a :b :c] 3)))
  (is (= [] (#'candidates/rotate [] 99)))
  (is (= [[3 2] [1 3] [2 1]]
         (mapv (juxt (comp :entity_local_id :entity) :tier)
               (select-candidates 3 1 (fn [_ entity]
                                        {:entity-type "table", :name (:name entity)}))))
      "the next run starts at tier 2, so an all-error tier 1 cannot starve lower tiers"))

(deftest flattened-tier-cursor-does-not-cycle-over-fixed-slices-test
  (let [ordered (#'candidates/interleave-tiers [[:a1 :a2 :a3 :a4]
                                                [:b1 :b2 :b3 :b4]
                                                [:c1 :c2 :c3 :c4]])
        ;; Model six consecutive error-capped runs that each examine two candidates and advance by two.
        examined (mapcat #(take 2 (#'candidates/rotate ordered %)) (range 0 12 2))]
    (is (= [:a1 :b1 :c1 :a2 :b2 :c2 :a3 :b3 :c3 :a4 :b4 :c4] ordered))
    (is (= (set ordered) (set examined))
        "advancing the flattened cursor eventually examines every position in every tier")))

(deftest projection-failure-becomes-an-isolated-candidate-error-test
  (let [selected (select-candidates nil (fn [_ entity]
                                          (if (= 3 (:entity_local_id entity))
                                            (throw (ex-info "bad projection" {}))
                                            {:entity-type "table", :name (:name entity)})))
        failed   (second selected)]
    (is (= 3 (get-in failed [:entity :entity_local_id])))
    (is (= "bad projection" (ex-message (:candidate-error failed))))
    (is (= [2 3 1] (mapv (comp :entity_local_id :entity) selected)))))

(deftest invalid-stored-ai-context-becomes-an-isolated-candidate-error-test
  (doseq [bad-value ["{not-json" "null"]]
    (let [entities [{:entity_type "table", :entity_local_id 1, :name "Bad"}
                    {:entity_type "table", :entity_local_id 2, :name "Good"}]
          rows     [{:entity_type "table", :entity_local_id 1, :data_source "metabot"
                     :ai_context bad-value, :basis nil}
                    {:entity_type "table", :entity_local_id 2, :data_source "metabot"
                     :ai_context "{}", :basis nil}]
          selected (mt/with-dynamic-fn-redefs
                     [spec/member-entities (fn [_] entities)
                      spec/hydrate (fn [_ xs] xs)
                      spec/entity-basis (fn [_ entity] (select-keys entity [:name]))
                      spec/project (fn [_ entity] {:entity-type "table", :name (:name entity)})
                      t2/query (fn [& _] rows)]
                     (candidates/candidates nil))]
      (is (= [1 2] (mapv (comp :entity_local_id :entity) selected)))
      (is (instance? Throwable (:candidate-error (first selected))))
      (is (nil? (:candidate-error (second selected)))))))

(deftest corrupt-human-row-remains-excluded-test
  (let [entities [{:entity_type "table", :entity_local_id 1, :name "Human"}
                  {:entity_type "table", :entity_local_id 2, :name "Generated"}]
        rows     [{:entity_type "table", :entity_local_id 1, :data_source "human"
                   :ai_context "null", :basis nil}]
        selected (mt/with-dynamic-fn-redefs
                   [spec/member-entities (fn [_] entities)
                    spec/hydrate (fn [_ xs] xs)
                    spec/entity-basis (fn [_ entity] (select-keys entity [:name]))
                    spec/project (fn [_ entity] {:entity-type "table", :name (:name entity)})
                    t2/query (fn [& _] rows)]
                   (candidates/candidates nil))]
    (is (= [2] (mapv (comp :entity_local_id :entity) selected)))
    (is (nil? (:candidate-error (first selected))))))

(deftest card-flavor-queries-canonical-stored-row-test
  (let [query    (atom nil)
        entity   {:entity_type "metric", :entity_local_id 7, :name "Revenue"}
        row      {:entity_type "card", :entity_local_id 7, :data_source "metabot"
                  :ai_context "{}", :basis nil}
        selected (mt/with-dynamic-fn-redefs
                   [spec/member-entities (fn [_] [entity])
                    spec/hydrate (fn [_ xs] xs)
                    spec/entity-basis (fn [_ _] {:name "Revenue"})
                    spec/project (fn [_ _] {:entity-type "metric", :name "Revenue"})
                    t2/query (fn [q] (reset! query q) [row])]
                   (candidates/candidates nil))]
    (is (= [:and [:= :entity_type "card"] [:in :entity_local_id [7]]]
           (:where @query)))
    (is (= "card" (get-in selected [0 :existing-context :entity_type])))))

(deftest explicit-human-rewrite-is-selected-and-carried-onto-the-candidate-test
  (let [row {:entity_type "table", :entity_local_id 1, :data_source :human
             :ai_context {}, :basis {:name "Same"}
             :generated_at t0, :rewrite_requested_at t1}
        selected (mt/with-dynamic-fn-redefs
                   [spec/member-entities (fn [_] [{:entity_type "table", :entity_local_id 1, :name "Same"}])
                    spec/hydrate (fn [_ xs] xs)
                    spec/entity-basis (fn [_ entity] (select-keys entity [:name]))
                    spec/project (fn [_ entity] {:entity-type "table", :name (:name entity)})
                    spec/basis-diff (fn [_ _] nil)
                    t2/query (fn [& _] [row])]
                   (candidates/candidates nil))]
    (is (true? (:rewrite-requested? (first selected))))))
