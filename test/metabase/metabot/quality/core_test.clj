(ns metabase.metabot.quality.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.quality.constants :as constants]
   [metabase.metabot.quality.core :as quality.core]
   [metabase.metabot.quality.corpus-stats :as corpus-stats]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2])
  (:import
   (java.time Instant OffsetDateTime)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :test-users))

;; ---------------------------------------------------------------------------
;; Fixture helpers
;; ---------------------------------------------------------------------------

(defn- ts ^Instant [nseconds] (Instant/ofEpochSecond (long nseconds)))

(defn- tool-input
  ([fn-name] (tool-input fn-name {} (str "id-" (random-uuid))))
  ([fn-name args id] {:type :tool-input :function fn-name :arguments args :id id}))

(defn- tool-output
  ([id] (tool-output id {:output "ok"}))
  ([id result] {:type :tool-output :id id :result result}))

(defn- user-msg
  ([id created-at] (user-msg id created-at "internal"))
  ([id created-at profile-id]
   {:id id :role :user :created_at created-at :profile_id profile-id
    :data [{:role "user" :content "..."}]
    :finished true :total_tokens 0}))

(defn- assistant-msg
  ([id created-at parts] (assistant-msg id created-at parts "internal"))
  ([id created-at parts profile-id]
   {:id id :role :assistant :created_at created-at :profile_id profile-id
    :data parts :finished true :total_tokens 100}))

(defn- iter-parts
  "Build N iteration groups of `[tool-input, tool-output]` pairs — each pair
  counts as one LLM-emission group, so the row's iter-count equals N."
  [n]
  (into []
        (mapcat (fn [i]
                  [(tool-input "search" {} (str "t" i))
                   (tool-output (str "t" i))]))
        (range n)))

(defn- close-to?
  "Three-decimal agreement on doubles."
  [a b]
  (< (Math/abs (- (double a) (double b))) 5e-4))

(defmacro ^:private with-nil-outlier-threshold
  "Stub `corpus-stats/outlier-threshold` to nil so `n-expensive-turn` stays
  silent regardless of test-DB state. Tests that need a specific threshold use
  `with-redefs` directly."
  [& body]
  `(with-redefs [corpus-stats/outlier-threshold (constantly nil)]
     ~@body))

;; ---------------------------------------------------------------------------
;; Format-era guard
;; ---------------------------------------------------------------------------

(deftest compute-old-format-assistant-row-disqualifies-conversation-test
  (testing "any assistant row whose parts lack :type → pair of nils (format-era guard)"
    (with-nil-outlier-threshold
      (let [old-format-asst (assistant-msg 2 (ts 2)
                                           [{:role "assistant" :content "legacy"}])
            result          (quality.core/compute-conversation-score
                             [(user-msg 1 (ts 1)) old-format-asst])]
        (is (= {:quality_score nil :quality_breakdown nil} result))))))

(deftest compute-old-format-on-user-row-is-not-checked-test
  (testing "the guard is assistant-only — a user row's :data shape never disqualifies"
    (with-nil-outlier-threshold
      (let [{:keys [quality_breakdown]}
            (quality.core/compute-conversation-score [(user-msg 1 (ts 1))])]
        (is (some? quality_breakdown))))))

(deftest compute-empty-data-assistant-row-is-new-format-test
  (testing "an assistant row with empty :data is treated as new-format (no parts to type-check)"
    (with-nil-outlier-threshold
      (let [{:keys [quality_breakdown]}
            (quality.core/compute-conversation-score
             [(user-msg 1 (ts 1))
              (assistant-msg 2 (ts 2) [])])]
        (is (some? quality_breakdown)
            "scored, not format-disqualified")))))

;; ---------------------------------------------------------------------------
;; §9.6 edge cases
;; ---------------------------------------------------------------------------

(deftest compute-edge-case-empty-content-with-error-test
  (testing "empty assistant content + non-nil :error → turn-broken = 1, score ≈ -0.231"
    (with-nil-outlier-threshold
      (let [errored-asst (-> (assistant-msg 2 (ts 2) [])
                             (assoc :error "{\"type\":\"exception\",\"message\":\"boom\"}"))
            {:keys [quality_score quality_breakdown]}
            (quality.core/compute-conversation-score
             [(user-msg 1 (ts 1)) errored-asst])]
        (is (close-to? -0.231 quality_score))
        (is (close-to? 3.0 (:raw quality_breakdown)))
        (is (= 1 (get-in quality_breakdown [:signals :turn-broken])))
        (testing "every other signal contributes 0"
          (doseq [k (disj (set constants/signal-keys) :turn-broken)]
            (is (= 0.0 (get-in quality_breakdown [:contributions k]))
                (str k " contributes 0"))))))))

(deftest compute-edge-case-user-row-only-conversation-test
  (testing "a conversation with only a user prompt → exactly 0.0 with a populated breakdown"
    (with-nil-outlier-threshold
      (let [{:keys [quality_score quality_breakdown]}
            (quality.core/compute-conversation-score [(user-msg 1 (ts 1))])]
        (is (= 0.0 quality_score)
            "positive zero, distinct from the format-era nil")
        (is (some? quality_breakdown))
        (is (= 0.0 (:raw quality_breakdown)))
        (is (= 0.0 (:concern quality_breakdown)))
        (testing "every signal key is present at zero"
          (is (= (set constants/signal-keys)
                 (set (keys (:contributions quality_breakdown)))))
          (is (every? zero? (vals (:contributions quality_breakdown)))))
        (testing ":context reflects the empty conversation"
          (is (= 1     (get-in quality_breakdown [:context :n_messages])))
          (is (= 0     (get-in quality_breakdown [:context :n_tool_calls])))
          (is (false?  (get-in quality_breakdown [:context :had_artifact]))))))))

;; ---------------------------------------------------------------------------
;; safe-message coercion (defensive normalization)
;; ---------------------------------------------------------------------------

(deftest compute-non-sequential-data-degrades-to-zero-test
  (testing "a row whose :data is not a sequential collection scores 0.0 without throwing"
    (with-nil-outlier-threshold
      (doseq [[label bad-data] [["nil :data"     nil]
                                ["map :data"     {:wrong "shape"}]
                                ["string :data"  "not a parts vector"]
                                ["scalar :data"  42]]]
        (testing label
          (let [busted (-> (assistant-msg 2 (ts 2) [{:type :text :text "ok"}])
                           (assoc :data bad-data))
                {:keys [quality_score quality_breakdown]}
                (quality.core/compute-conversation-score
                 [(user-msg 1 (ts 1)) busted])]
            (is (= 0.0 quality_score))
            (is (some? quality_breakdown))))))))

;; ---------------------------------------------------------------------------
;; Modal :context.profile_id
;; ---------------------------------------------------------------------------

(deftest compute-context-profile-id-is-modal-test
  (testing "mixed-profile conversation: :context.profile_id is the most-frequent value"
    (with-nil-outlier-threshold
      (let [messages [(user-msg 1 (ts 1) "internal")
                      (assistant-msg 2 (ts 2) [] "internal")
                      (user-msg 3 (ts 3) "internal")
                      (assistant-msg 4 (ts 4) [] "internal")
                      (user-msg 5 (ts 5) "transforms_codegen")
                      (assistant-msg 6 (ts 6) [] "transforms_codegen")]
            {:keys [quality_breakdown]} (quality.core/compute-conversation-score messages)]
        (is (= "internal" (get-in quality_breakdown [:context :profile_id])))))))

(deftest compute-context-profile-id-tiebreak-asc-test
  (testing "tied counts → tiebreak by profile-id ascending (alphabetical)"
    (with-nil-outlier-threshold
      (let [messages [(user-msg 1 (ts 1) "sql")
                      (assistant-msg 2 (ts 2) [] "sql")
                      (user-msg 3 (ts 3) "internal")
                      (assistant-msg 4 (ts 4) [] "internal")]
            {:keys [quality_breakdown]} (quality.core/compute-conversation-score messages)]
        (is (= "internal" (get-in quality_breakdown [:context :profile_id])))))))

;; ---------------------------------------------------------------------------
;; Per-message iter-cap-burned (impl-plan §9.7 deviation — each row vs its own cap)
;; ---------------------------------------------------------------------------

(deftest compute-iter-cap-burned-uses-per-row-profile-cap-test
  (testing "each assistant row is judged against its OWN profile's cap, not the modal cap"
    (with-nil-outlier-threshold
      (testing "both rows exactly at their own caps → magnitude 2"
        ;; transforms_codegen cap = 30 → 30 iters fires; internal cap = 10 → 10 iters fires
        (let [messages [(user-msg 1 (ts 1) "transforms_codegen")
                        (assistant-msg 2 (ts 2) (iter-parts 30) "transforms_codegen")
                        (user-msg 3 (ts 3) "internal")
                        (assistant-msg 4 (ts 4) (iter-parts 10) "internal")]
              {:keys [quality_breakdown]} (quality.core/compute-conversation-score messages)]
          (is (= 2 (get-in quality_breakdown [:signals :iter-cap-burned])))))
      (testing "11 iters fires for internal (cap 10) but not for transforms_codegen (cap 30)"
        (let [messages [(user-msg 1 (ts 1) "transforms_codegen")
                        (assistant-msg 2 (ts 2) (iter-parts 11) "transforms_codegen")
                        (user-msg 3 (ts 3) "internal")
                        (assistant-msg 4 (ts 4) (iter-parts 11) "internal")]
              {:keys [quality_breakdown]} (quality.core/compute-conversation-score messages)]
          (is (= 1 (get-in quality_breakdown [:signals :iter-cap-burned]))
              "only the internal row exceeds its cap"))))))

;; ---------------------------------------------------------------------------
;; outlier-threshold pinned to breakdown :context
;; ---------------------------------------------------------------------------

(deftest compute-outlier-threshold-pinned-to-context-test
  (testing "the threshold + corpus-size in effect at compute-time are persisted to :context"
    (testing "non-nil threshold flows through verbatim"
      (with-redefs [corpus-stats/outlier-threshold
                    (constantly {:threshold 250000 :corpus-size 800})]
        (let [{:keys [quality_breakdown]}
              (quality.core/compute-conversation-score
               [(user-msg 1 (ts 1)) (assistant-msg 2 (ts 2) [])])]
          (is (= 250000 (get-in quality_breakdown [:context :outlier_threshold])))
          (is (= 800    (get-in quality_breakdown [:context :outlier_threshold_corpus_size]))))))
    (testing "nil threshold (corpus below min-size) → both context fields nil"
      (with-redefs [corpus-stats/outlier-threshold (constantly nil)]
        (let [{:keys [quality_breakdown]}
              (quality.core/compute-conversation-score
               [(user-msg 1 (ts 1)) (assistant-msg 2 (ts 2) [])])]
          (is (nil? (get-in quality_breakdown [:context :outlier_threshold])))
          (is (nil? (get-in quality_breakdown [:context :outlier_threshold_corpus_size]))))))))

(deftest compute-conversation-score-2-arity-injects-threshold-test
  (testing "the 2-arity threads the injected threshold-info into the breakdown
            and does not consult corpus-stats — required for batch consumers
            like the backfill job to amortize the corpus fetch"
    (let [threshold-calls (atom 0)
          injected        {:threshold 333000 :corpus-size 1234}]
      (with-redefs [corpus-stats/outlier-threshold
                    (fn [] (swap! threshold-calls inc) nil)]
        (let [{:keys [quality_breakdown]}
              (quality.core/compute-conversation-score
               [(user-msg 1 (ts 1)) (assistant-msg 2 (ts 2) [])]
               injected)]
          (is (zero? @threshold-calls)
              "the 2-arity must not consult corpus-stats")
          (is (= 333000 (get-in quality_breakdown [:context :outlier_threshold])))
          (is (= 1234   (get-in quality_breakdown [:context :outlier_threshold_corpus_size]))))))))

;; ---------------------------------------------------------------------------
;; Breakdown shape — every signal key present, version pinned
;; ---------------------------------------------------------------------------

(deftest compute-breakdown-shape-stable-across-conversations-test
  (testing ":signals + :contributions always carry every signal key, version is pinned"
    (with-nil-outlier-threshold
      (let [{:keys [quality_breakdown]}
            (quality.core/compute-conversation-score [(user-msg 1 (ts 1))])
            signal-set (set constants/signal-keys)]
        (is (= signal-set (set (keys (:signals quality_breakdown)))))
        (is (= signal-set (set (keys (:contributions quality_breakdown)))))
        (is (= quality.core/composite-version (:composite_version quality_breakdown)))
        (is (string? (:computed_at quality_breakdown)))
        (is (= constants/turn-broken-available-from
               (:turn_broken_available_from quality_breakdown)))))))

;; ---------------------------------------------------------------------------
;; Idempotence — score-conversation! (DB integration)
;; ---------------------------------------------------------------------------

(defn- insert-conversation-with-one-turn!
  "Insert a conversation row + a (user, assistant) pair so `score-conversation!`
  has something to read back. Defaults to a typed assistant part so the row
  passes the new-format guard. Pass `:format-era? true` to insert a part
  lacking `:type`, which disqualifies the whole conversation from scoring."
  [& {:keys [format-era?]}]
  (let [conversation-id (str (random-uuid))
        user-id         (mt/user->id :rasta)
        now             (OffsetDateTime/now)
        asst-parts      (if format-era?
                          [{:role "assistant" :content "legacy"}]
                          [{:type "text" :text "hello"}])]
    (t2/insert! :model/MetabotConversation {:id conversation-id :user_id user-id})
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
                 :data            asst-parts
                 :created_at      (.plusSeconds now 1)
                 :finished        true})
    conversation-id))

(deftest score-conversation-idempotent-test
  (testing "two consecutive score-conversation! calls produce identical scores
            and breakdowns modulo :computed_at"
    (t2/with-transaction [_conn nil {:rollback-only true}]
      (let [conversation-id (insert-conversation-with-one-turn!)]
        (with-nil-outlier-threshold
          (quality.core/score-conversation! conversation-id)
          (let [first-pass  (t2/select-one [:model/MetabotConversation
                                            :quality_score :quality_breakdown]
                                           :id conversation-id)
                _           (quality.core/score-conversation! conversation-id)
                second-pass (t2/select-one [:model/MetabotConversation
                                            :quality_score :quality_breakdown]
                                           :id conversation-id)
                drop-ts     (fn [row] (update row :quality_breakdown dissoc :computed_at))]
            (is (= (drop-ts first-pass) (drop-ts second-pass))
                "bit-identical modulo :computed_at")))))))

;; ---------------------------------------------------------------------------
;; Catch boundary — score-conversation! swallows throws into the counter
;; ---------------------------------------------------------------------------

(deftest score-conversation-catch-boundary-test
  (testing "a throw inside compute-conversation-score is caught, logged, counted;
            the wrapper still returns nil"
    (mt/with-prometheus-system! [_ system]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [conversation-id (insert-conversation-with-one-turn!)]
          (mt/with-log-level [metabase.metabot.quality.core :fatal]
            (with-redefs [quality.core/compute-conversation-score
                          (fn [& _] (throw (ex-info "simulated compute failure" {})))]
              (is (nil? (quality.core/score-conversation! conversation-id))
                  "returns nil instead of propagating the throw")))))
      (is (== 1 (mt/metric-value system :metabase-metabot/quality-score-errors))
          "Prometheus counter is incremented on the catch path"))))

;; ---------------------------------------------------------------------------
;; Format-era sentinel — score-conversation! writes a marker breakdown so the
;; backfill's `quality_breakdown IS NULL` discovery cannot re-discover the row
;; on every run.
;; ---------------------------------------------------------------------------

(deftest score-conversation-format-era-writes-sentinel-test
  (testing "a format-era conversation (assistant part lacks :type) gets a
            sentinel breakdown written so the discovery query stops re-finding
            it; the score-conversation! return distinguishes :sentinel from
            the catch path so the backfill log can categorize correctly"
    (with-nil-outlier-threshold
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [conversation-id (insert-conversation-with-one-turn! :format-era? true)
              return-val      (quality.core/score-conversation! conversation-id)
              row             (t2/select-one [:model/MetabotConversation
                                              :quality_score :quality_breakdown]
                                             :id conversation-id)]
          (is (= :sentinel return-val)
              "format-era path returns the :sentinel keyword, distinct from nil")
          (is (nil? (:quality_score row))
              "quality_score stays NULL — format-era is uncomputable, not zero")
          (is (map? (:quality_breakdown row))
              "quality_breakdown is the sentinel map, not NULL")
          (is (= "old-format" (:unscored_reason (:quality_breakdown row)))
              "the sentinel records why the row was not scored")
          (is (= quality.core/composite-version
                 (:composite_version (:quality_breakdown row)))
              "the sentinel is pinned to the version that decided not to score")
          (testing "a second call is idempotent: still :sentinel, breakdown still
                    present, no error counter ticks (separate from the catch path)"
            (is (= :sentinel (quality.core/score-conversation! conversation-id)))))))))
