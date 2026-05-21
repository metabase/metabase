(ns metabase.explorations.ai-summary-test
  "Unit tests for the orchestrator-namespace helpers that don't need a DB or LLM:
  the reasoning-trace filter, the error-doc builder, and the
  append-reasoning-section no-op / append behavior. Also one end-to-end
  integration test that stubs the LLM and verifies a Document is written
  with materialized chart embeds."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.explorations.ai-summary :as ai-summary]
   [metabase.explorations.interestingness :as explorations.interestingness]
   [metabase.interestingness.core :as interestingness]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.scope]
   [metabase.metabot.self :as metabot.self]
   [metabase.metabot.self.claude]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.metabot.usage]
   [metabase.query-processor.middleware.cache.impl :as cache.impl]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

;;; ---------------------------------------------- attempt-reasonings ----------------------------------------------

(deftest attempt-reasonings-test
  (testing "Keeps attempts that produced readable reasoning"
    (let [attempts [{:attempt 1 :trace {:reasoning "step one"}}
                    {:attempt 2 :trace {}}
                    {:attempt 3 :trace {:reasoning "step three"}}]]
      (is (= [{:attempt 1 :reasoning "step one"}
              {:attempt 3 :reasoning "step three"}]
             (#'ai-summary/attempt-reasonings attempts)))))
  (testing "Empty reasoning with NO reasoning part in the raw trace → dropped"
    (is (= [] (#'ai-summary/attempt-reasonings
               [{:attempt 1 :trace {:reasoning ""}}])))
    (is (= [] (#'ai-summary/attempt-reasonings
               [{:attempt 1 :trace {:reasoning ""
                                    :all       [{:type :text :text "hi"}]}}]))))
  (testing "Empty reasoning BUT a reasoning part is present (opaque/encrypted trace) → kept as opaque"
    (is (= [{:attempt 1 :opaque? true}]
           (#'ai-summary/attempt-reasonings
            [{:attempt 1 :trace {:reasoning ""
                                 :all       [{:type :reasoning :reasoning ""}
                                             {:type :tool-input}]}}]))))
  (testing "Mixed: opaque attempt followed by a readable one"
    (is (= [{:attempt 1 :opaque? true}
            {:attempt 2 :reasoning "got it"}]
           (#'ai-summary/attempt-reasonings
            [{:attempt 1 :trace {:reasoning ""
                                 :all       [{:type :reasoning :reasoning ""}]}}
             {:attempt 2 :trace {:reasoning "got it"
                                 :all       [{:type :reasoning :reasoning "got it"}]}}]))))
  (testing "Empty input → empty vector"
    (is (= [] (#'ai-summary/attempt-reasonings [])))))

;;; ---------------------------------------------- error-doc ----------------------------------------------

(defn- find-text
  "Concatenate every text-node string in a PM doc tree (depth-first) for
  easy substring assertions."
  [node]
  (cond
    (and (map? node) (= "text" (:type node))) (:text node)
    (map? node) (apply str (map find-text (:content node)))
    (sequential? node) (apply str (map find-text node))
    :else ""))

(deftest error-doc-shape-test
  (testing "Error doc is a ProseMirror doc with the expected top-level structure"
    (let [d (#'ai-summary/error-doc {:phase        :phase-1
                                     :thread-id    42
                                     :final-errors ["something broke"]
                                     :detail       "extra context"})]
      (is (= "doc" (:type d)))
      (is (= "heading"   (-> d :content (nth 0) :type)))
      (is (= 2           (-> d :content (nth 0) :attrs :level)))
      (let [all-text (find-text d)]
        (is (str/includes? all-text "AI Summary generation failed"))
        (is (str/includes? all-text "Phase 1 — Chart curation"))
        (is (str/includes? all-text "something broke"))
        (is (str/includes? all-text "extra context"))
        (is (str/includes? all-text "(metabase.explorations.ai-summary/debug-transcript 42)"))))))

(deftest error-doc-no-detail-test
  (testing "When :detail is omitted, no Details heading is emitted"
    (let [d (#'ai-summary/error-doc {:phase :phase-2 :thread-id 7 :final-errors ["x"]})]
      (is (not (str/includes? (find-text d) "Details"))
          "Details heading should not appear when :detail is nil"))))

(deftest error-doc-empty-errors-test
  (testing "Empty final-errors → a fallback paragraph, no bulletList"
    (let [d (#'ai-summary/error-doc {:phase :phase-2 :thread-id 7 :final-errors []})]
      (is (str/includes? (find-text d) "(no specific errors captured")))))

(deftest error-doc-phase-labels-test
  (testing "Phase keyword maps to a human label"
    (is (str/includes? (find-text (#'ai-summary/error-doc
                                   {:phase :phase-2 :thread-id 1 :final-errors []}))
                       "Phase 2 — Analysis"))
    (is (str/includes? (find-text (#'ai-summary/error-doc
                                   {:phase :something-else :thread-id 1 :final-errors []}))
                       ":something-else")
        "Unknown phases fall back to (str phase)")))

;;; ---------------------------------------------- append-reasoning-section ----------------------------------------------

(def ^:private bare-doc
  {:type "doc" :content [{:type "paragraph" :content [{:type "text" :text "body"}]}]})

(deftest append-reasoning-section-noop-when-empty-test
  (testing "No rationale, no reasonings → doc returned unchanged"
    (is (= bare-doc
           (#'ai-summary/append-reasoning-section
            bare-doc
            {:phase-1 {:reasonings [] :rationale nil}
             :phase-2 {:reasonings []}
             :thread-id 7}))))
  (testing "Blank rationale + empty reasonings → still a no-op"
    (is (= bare-doc
           (#'ai-summary/append-reasoning-section
            bare-doc
            {:phase-1 {:reasonings [] :rationale ""}
             :phase-2 {:reasonings []}
             :thread-id 7})))))

(deftest append-reasoning-section-appends-test
  (testing "When there's something to show, a Reasoning section is appended at level 2"
    (let [out (#'ai-summary/append-reasoning-section
               bare-doc
               {:phase-1 {:reasonings [{:attempt 1 :reasoning "p1 thought"}]
                          :rationale  "curator picked these"}
                :phase-2 {:reasonings [{:attempt 1 :reasoning "p2 thought"}]}
                :thread-id 42})
          all-text (find-text out)]
      ;; original content is preserved at the front
      (is (= "paragraph" (-> out :content (nth 0) :type)))
      ;; the appended Reasoning heading is at level 2
      (let [headings-l2 (filter #(and (map? %)
                                      (= "heading" (:type %))
                                      (= 2 (-> % :attrs :level)))
                                (:content out))]
        (is (>= (count headings-l2) 1))
        (is (some #(= "Reasoning" (find-text %)) headings-l2)))
      ;; both phases and the rationale show up in the text
      (is (str/includes? all-text "Phase 1 — Chart curation"))
      (is (str/includes? all-text "Phase 2 — Analysis"))
      (is (str/includes? all-text "curator picked these"))
      (is (str/includes? all-text "p1 thought"))
      (is (str/includes? all-text "p2 thought"))
      ;; REPL helpers footer included
      (is (str/includes? all-text "REPL helpers"))
      (is (str/includes? all-text "(metabase.explorations.ai-summary/debug-transcript 42)")))))

(deftest append-reasoning-section-multi-attempt-headings-test
  (testing "Multi-attempt phases use level-4 'Attempt N' sub-headings"
    (let [out (#'ai-summary/append-reasoning-section
               bare-doc
               {:phase-1 {:reasonings [{:attempt 1 :reasoning "first try"}
                                       {:attempt 2 :reasoning "retry"}]
                          :rationale  nil}
                :phase-2 {:reasonings []}
                :thread-id 42})
          all-text (find-text out)
          headings-l4 (filter #(and (map? %)
                                    (= "heading" (:type %))
                                    (= 4 (-> % :attrs :level)))
                              (:content out))]
      (is (some #(str/includes? (find-text %) "Attempt 1") headings-l4))
      (is (some #(str/includes? (find-text %) "Attempt 2") headings-l4))
      (is (str/includes? all-text "first try"))
      (is (str/includes? all-text "retry")))))

(deftest append-reasoning-section-single-attempt-flat-test
  (testing "Single-attempt phase has no per-attempt heading — just the paragraphs"
    (let [out (#'ai-summary/append-reasoning-section
               bare-doc
               {:phase-1 {:reasonings [{:attempt 1 :reasoning "only thought"}]
                          :rationale  nil}
                :phase-2 {:reasonings []}
                :thread-id 1})
          headings-l4 (filter #(and (map? %)
                                    (= "heading" (:type %))
                                    (= 4 (-> % :attrs :level)))
                              (:content out))]
      (is (empty? headings-l4)
          "No 'Attempt N' heading when there's only one attempt"))))

(deftest append-reasoning-section-opaque-test
  (testing "Opaque phase (thinking ran but trace was encrypted) emits an italic stub"
    (let [out (#'ai-summary/append-reasoning-section
               bare-doc
               {:phase-1 {:reasonings [] :rationale "curator picked"}
                :phase-2 {:reasonings [{:attempt 1 :opaque? true}]}
                :thread-id 42})
          all-text (find-text out)]
      ;; The Phase 2 heading is still emitted so the user knows thinking
      ;; happened on that phase.
      (is (str/includes? all-text "Phase 2 — Analysis"))
      ;; The stub mentions encryption rather than going silent.
      (is (str/includes? all-text "encrypted"))
      ;; The stub paragraph is italic (the only italic mark applied to the
      ;; "encrypted" text — confirms the marks survive into the PM tree).
      (let [paragraphs (filter #(and (map? %) (= "paragraph" (:type %)))
                               (:content out))
            italic-encrypted? (some (fn [p]
                                      (some (fn [c]
                                              (and (= "text" (:type c))
                                                   (str/includes? (:text c) "encrypted")
                                                   (some #(= "italic" (:type %))
                                                         (:marks c))))
                                            (:content p)))
                                    paragraphs)]
        (is italic-encrypted?
            "The opaque-thinking notice should be rendered as italic text")))))

(deftest append-reasoning-section-opaque-multi-attempt-test
  (testing "Opaque entries also get an Attempt N heading when there are multiple attempts"
    (let [out (#'ai-summary/append-reasoning-section
               bare-doc
               {:phase-1 {:reasonings [{:attempt 1 :opaque?   true}
                                       {:attempt 2 :reasoning "second try worked"}]
                          :rationale  nil}
                :phase-2 {:reasonings []}
                :thread-id 1})
          headings-l4 (filter #(and (map? %)
                                    (= "heading" (:type %))
                                    (= 4 (-> % :attrs :level)))
                              (:content out))
          all-text (find-text out)]
      (is (some #(str/includes? (find-text %) "Attempt 1") headings-l4))
      (is (some #(str/includes? (find-text %) "Attempt 2") headings-l4))
      (is (str/includes? all-text "encrypted"))
      (is (str/includes? all-text "second try worked")))))

;;; ---------------------------------------------- end-to-end integration ----------------------------------------------

(defn- fixture-qp-result []
  {:status :completed
   :data   {:cols [{:name           "month"
                    :base_type      :type/DateTime
                    :effective_type :type/DateTime
                    :display_name   "Month"}
                   {:name         "revenue"
                    :base_type    :type/Integer
                    :display_name "Revenue"}]
            :rows [["2025-01-01T00:00:00Z" 100]
                   ["2025-02-01T00:00:00Z" 110]
                   ["2025-03-01T00:00:00Z" 95]
                   ["2025-04-01T00:00:00Z" 220]
                   ["2025-05-01T00:00:00Z" 240]]}
   :row_count 5})

(defn- serialize-result [qp-result]
  (cache.impl/do-with-serialization
   (fn [in result-fn] (in qp-result) (result-fn))))

;; ----- skip-no-permission / skip-usage-limit (UXW-4126) -----
;;
;; `generate-ai-summary!` consults the shared pre-flight gate
;; `metabase.metabot.core/llm-call-unavailable-reason` (UXW-4120, bound to the creator) before
;; any chart loading or LLM work and maps a closed gate to the matching `:skip-*` outcome;
;; `call-llm-structured-with-trace` still enforces the same permission/usage gates inside
;; `run-phases!` as a mid-run safety net. These threads have a prepped chart, but the gate now
;; fires before that even matters.

(defn- seed-one-prepped-chart!
  "Insert a Card + ExplorationQuery + StoredResult + ExplorationQueryResult so
  `generate-ai-summary!` finds exactly one chart in the pool. Returns the
  ids as `{:card-id :query-id}`."
  [user-id thread-id]
  (let [mp    (mt/metadata-provider)
        oq    (lib/->legacy-MBQL
               (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                   (lib/aggregate (lib/count))))
        card  (first (t2/insert-returning-instances!
                      :model/Card
                      {:name          "rev"
                       :type          :metric
                       :display       :line
                       :visualization_settings {}
                       :creator_id    user-id
                       :dataset_query oq}))
        eq    (first (t2/insert-returning-instances!
                      :model/ExplorationQuery
                      {:exploration_thread_id thread-id
                       :card_id               (:id card)
                       :dimension_id          "d1"
                       :dataset_query         oq
                       :status                "done"
                       :position              0}))
        bytes (serialize-result (fixture-qp-result))
        sr    (first (t2/insert-returning-instances!
                      :model/StoredResult
                      {:result_data   bytes
                       :creator_id    user-id
                       :database_id   (mt/id)
                       :dataset_query oq}))
        cfg   (explorations.interestingness/qp-result->chart-config eq (fixture-qp-result))
        stats (when cfg (interestingness/compute-chart-stats cfg {:deep? true}))]
    (t2/insert! :model/ExplorationQueryResult
                {:exploration_query_id  (:id eq)
                 :stored_result_id      (:id sr)
                 :chart_stats           stats
                 :interestingness_score 0.5
                 :contextual_interestingness_score 0.5
                 :metric_description    "revenue"
                 :chart_description     "revenue over time"})
    {:card-id (:id card) :query-id (:id eq)}))

(deftest ^:integration generate-ai-summary-skips-without-other-tools-permission-test
  (testing "Creator lacking :permission/metabot-other-tools → pre-flight gate returns
            :permission-denied, orchestrator skips → :skip-no-permission (UXW-4126/UXW-4120)"
    (mt/with-temp [:model/User u {:email "ai-noperm@example.com"}
                   :model/Exploration e {:name "x" :creator_id (:id u)}
                   :model/ExplorationThread t {:exploration_id (:id e)
                                               :prompt         "Does revenue grow?"
                                               :position       0}]
      (seed-one-prepped-chart! (:id u) (:id t))
      (let [adapter-calls (atom 0)]
        (mt/with-temporary-setting-values [ai-features-enabled? true
                                           metabot-enabled?     true]
          (mt/with-dynamic-fn-redefs [metabot.settings/llm-metabot-configured? (constantly true)
                                      metabase.metabot.scope/resolve-user-permissions
                                      (fn [_uid] {:permission/metabot                :yes
                                                  :permission/metabot-sql-generation :yes
                                                  :permission/metabot-nlq            :yes
                                                  :permission/metabot-other-tools    :no})
                        ;; If the real provider adapter were reached, this would
                        ;; bump — the permission check fires before that.
                                      metabase.metabot.self.claude/claude
                                      (fn [& _] (swap! adapter-calls inc) [])]
            (let [outcome (ai-summary/generate-ai-summary! (:id t))]
              (is (= :skip-no-permission outcome))
              (is (zero? @adapter-calls)
                  "LLM provider adapter must not be reached when creator lacks :permission/metabot-other-tools")
              (let [transcript (:auto_insights_transcript
                                (t2/select-one [:model/ExplorationThread :auto_insights_transcript]
                                               :id (:id t)))]
                (is (= :skip-no-permission (:outcome transcript))
                    "transcript records the skip outcome")))))))))

(deftest ^:integration generate-ai-summary-skips-when-usage-limit-reached-test
  (testing "check-usage-limits! returning a message → pre-flight gate returns
            :usage-limit, orchestrator skips → :skip-usage-limit (UXW-4126/UXW-4120)"
    (mt/with-temp [:model/User u {:email "ai-limit@example.com"}
                   :model/Exploration e {:name "x" :creator_id (:id u)}
                   :model/ExplorationThread t {:exploration_id (:id e)
                                               :prompt         "Does revenue grow?"
                                               :position       0}]
      (seed-one-prepped-chart! (:id u) (:id t))
      (let [adapter-calls (atom 0)]
        (mt/with-temporary-setting-values [ai-features-enabled? true
                                           metabot-enabled?     true]
          (mt/with-dynamic-fn-redefs [metabot.settings/llm-metabot-configured? (constantly true)
                                      metabase.metabot.usage/check-usage-limits!
                                      (fn [] "you have used all of your AI tokens")
                                      metabase.metabot.self.claude/claude
                                      (fn [& _] (swap! adapter-calls inc) [])]
            (let [outcome (ai-summary/generate-ai-summary! (:id t))]
              (is (= :skip-usage-limit outcome))
              (is (zero? @adapter-calls)
                  "LLM provider adapter must not be reached when usage limit is hit")
              (let [transcript (:auto_insights_transcript
                                (t2/select-one [:model/ExplorationThread :auto_insights_transcript]
                                               :id (:id t)))]
                (is (= :skip-usage-limit (:outcome transcript)))))))))))

(deftest ^:integration generate-ai-summary-skips-when-metabot-disabled-test
  (testing "metabot-enabled? false → orchestrator short-circuits → :skip-metabot-disabled,
            no LLM adapter call (UXW-4121)"
    (mt/with-temp [:model/User u {:email "ai-metabot-disabled@example.com"}
                   :model/Exploration e {:name "x" :creator_id (:id u)}
                   :model/ExplorationThread t {:exploration_id (:id e)
                                               :prompt         "Does revenue grow?"
                                               :position       0}]
      (seed-one-prepped-chart! (:id u) (:id t))
      (let [adapter-calls (atom 0)]
        (mt/with-temporary-setting-values [metabot-enabled? false]
          (mt/with-dynamic-fn-redefs [metabot.settings/llm-metabot-configured? (constantly true)
                                      metabase.metabot.self.claude/claude
                                      (fn [& _] (swap! adapter-calls inc) [])]
            (let [outcome (ai-summary/generate-ai-summary! (:id t))]
              (is (= :skip-metabot-disabled outcome))
              (is (zero? @adapter-calls)
                  "LLM provider adapter must not be reached when Metabot is disabled")
              (let [transcript (:auto_insights_transcript
                                (t2/select-one [:model/ExplorationThread :auto_insights_transcript]
                                               :id (:id t)))]
                (is (= :skip-metabot-disabled (:outcome transcript))
                    "transcript records the skip outcome")))))))))

(deftest ^:integration generate-ai-summary-end-to-end-test
  (testing "Happy path: stubbed LLM produces a curation and analysis; a Document is created with a materialized chart embed"
    (mt/with-temp [:model/User u {:email "ai-summary-e2e@example.com"}
                   :model/Card card {:creator_id    (:id u)
                                     :dataset_query (lib/->legacy-MBQL
                                                     (let [mp (mt/metadata-provider)]
                                                       (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                                                           (lib/aggregate (lib/count)))))}
                   :model/Exploration e {:name "x" :creator_id (:id u)}
                   :model/ExplorationThread t {:exploration_id (:id e)
                                               :prompt         "How is revenue trending?"
                                               :position       0}]
      (let [qp-result    (fixture-qp-result)
            query        (first (t2/insert-returning-instances!
                                 :model/ExplorationQuery
                                 {:exploration_thread_id (:id t)
                                  :card_id               (:id card)
                                  :name                  "Revenue by Month"
                                  :dimension_id          "d1"
                                  :dataset_query         (lib/->legacy-MBQL
                                                          (let [mp (mt/metadata-provider)]
                                                            (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
                                                                (lib/aggregate (lib/count))
                                                                (lib/breakout
                                                                 (lib/with-temporal-bucket
                                                                   (lib.metadata/field mp (mt/id :products :created_at))
                                                                   :month)))))
                                  :status                "done"
                                  :position              0}))
            chart-cfg    (explorations.interestingness/qp-result->chart-config query qp-result)
            chart-stats  (interestingness/compute-chart-stats chart-cfg {:deep? true})
            curation-call (atom 0)
            analysis-call (atom 0)
            ;; Simulate what the runner writes: a stored_result row holding the cached bytes
            ;; plus the dataset_query needed for cached-read perm gating; display + viz_settings
            ;; sit on the exploration_query_result row.
            sr-id (first
                   (t2/insert-returning-pks!
                    :model/StoredResult
                    {:result_data   (serialize-result qp-result)
                     :creator_id    (:id u)
                     :database_id   (mt/id)
                     :dataset_query (:dataset_query query)}))]
        (t2/insert! :model/ExplorationQueryResult
                    {:exploration_query_id (:id query)
                     :stored_result_id     sr-id
                     :chart_stats          chart-stats})
        (mt/with-temporary-setting-values [ai-features-enabled? true
                                           metabot-enabled?     true]
          (mt/with-dynamic-fn-redefs [metabot.settings/llm-metabot-configured? (constantly true)
                                      ;; Grant the metabot permission so the pre-flight gate opens
                                      ;; regardless of whether this instance has the :ai-controls
                                      ;; feature (otherwise a fresh creator defaults to :no).
                                      metabase.metabot.scope/resolve-user-permissions
                                      (constantly metabase.metabot.scope/all-yes-permissions)
                                      metabot.self/call-llm-structured-with-trace
                                      (fn [_model messages _schema _temp _max-tokens _opts]
                                        (let [user-msg (->> messages (filter #(= "user" (:role %))) first :content)]
                                          (if (str/includes? user-msg "CHART POOL")
                                            (do (swap! curation-call inc)
                                                {:result {:top_tier       [(:id query)]
                                                          :awareness_tier []
                                                          :rationale      "only chart in the pool"}
                                                 :parts  [{:type :reasoning :reasoning "thinking about curation"}]})
                                            (do (swap! analysis-call inc)
                                                {:result {:document
                                                          {:type "doc"
                                                           :content [{:type "heading" :attrs {:level 2}
                                                                      :content [{:type "text" :text "Abstract"}]}
                                                                     {:type "paragraph"
                                                                      :content [{:type "text" :text "Revenue trends upward in spring 2025."}]}
                                                                     {:type "cardEmbed"
                                                                      :attrs {:stored_result_id sr-id}}]}}
                                                 :parts  [{:type :reasoning :reasoning "thinking about analysis"}]}))))]
            (let [outcome (ai-summary/generate-ai-summary! (:id t))]
              (is (= :ok outcome))
              (is (= 1 @curation-call))
              (is (= 1 @analysis-call))
              (let [doc (t2/select-one :model/Document :exploration_thread_id (:id t)
                                       :name "AI Summary")]
                (is (some? doc) "AI Summary document was created")
                ;; Each cardEmbed the LLM picked materializes its own report_card attached to
                ;; the document — display/viz/dataset_query live on the card; the cardEmbed
                ;; node carries both `:id` (the new card) and `:stored_result_id` (the snapshot).
                (let [cards     (t2/select :model/Card :document_id (:id doc))
                      embed-ids (->> (tree-seq :content :content (:document doc))
                                     (filter #(= "cardEmbed" (:type %)))
                                     (map (comp :id :attrs)))]
                  (is (= 1 (count cards)) "one Card is materialized for the static cardEmbed")
                  (is (= [(:id (first cards))] embed-ids)
                      "cardEmbed.attrs.id is the materialized card id"))))))))))

(deftest append-reasoning-section-paragraph-split-test
  (testing "Reasoning blocks are split on blank lines into separate paragraphs"
    (let [out (#'ai-summary/append-reasoning-section
               bare-doc
               {:phase-1 {:reasonings [{:attempt 1
                                        :reasoning "para one\n\npara two\n\npara three"}]
                          :rationale  nil}
                :phase-2 {:reasonings []}
                :thread-id 1})
          paragraphs (filter #(and (map? %) (= "paragraph" (:type %))) (:content out))
          texts (map find-text paragraphs)]
      (is (some #(= "para one" %)   texts))
      (is (some #(= "para two" %)   texts))
      (is (some #(= "para three" %) texts)))))
