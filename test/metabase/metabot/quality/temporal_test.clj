(ns metabase.metabot.quality.temporal-test
  "Phase 4 unit tests — pure. Each test either hand-builds a minimal
  normalized struct or feeds a synthetic message fixture through
  `extract/normalize` before calling `derive`. No DB hits."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.agent.streaming :as streaming]
   [metabase.metabot.quality.extract :as extract]
   [metabase.metabot.quality.temporal :as temporal]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------
;;; Message fixture builders (mirror the extract-test shapes, including the
;;; post-JSON-round-trip string `:type` values inside `:data` parts).
;;; ---------------------------------------------------------------------------

(defn- user-row [id text]
  {:id id :role :user :conversation_id "conv" :profile_id "internal" :user_id 1
   :created_at id
   :data [{:role :user :content text}
          {:type "prompt-context"
           :user_is_viewing []
           :user_recently_viewed []
           :mentioned_refs []}]})

(defn- assistant-row
  ([id parts]
   (assistant-row id parts {}))
  ([id parts {:keys [error finished] :or {finished true}}]
   {:id              id
    :role            :assistant
    :conversation_id "conv"
    :profile_id      "internal"
    :created_at      id
    :finished        finished
    :error           error
    :data            (vec parts)}))

(defn- text-part [s] {:type "text" :text s})

(defn- input-part [call-id function arguments]
  {:type "tool-input" :id call-id :function function :arguments arguments})

(defn- output-part [call-id function entity-usage & {:keys [error]}]
  (cond-> {:type     "tool-output"
           :id       call-id
           :function function
           :result   {:output            "ok"
                      :structured-output {:entity-usage entity-usage}}}
    error (assoc :error error)))

(defn- terminal-state-data-part
  "Construct a `terminal_state` data part as it appears AFTER JSON round-trip:
  top-level `:type` is the string `\"data\"` (originally `:data` keyword)
  and the inner `:reason` is a string."
  [reason]
  {:type      "data"
   :data-type streaming/terminal-state-type
   :version   1
   :data      {:reason (name reason)}})

;;; ---------------------------------------------------------------------------
;;; String similarity
;;; ---------------------------------------------------------------------------

(deftest similarity-edge-cases-test
  (testing "identical strings → 1.0"
    (is (= 1.0 (temporal/similarity "orders" "orders"))))

  (testing "two empty strings collapse to identical (no divide-by-zero)"
    (is (= 1.0 (temporal/similarity "" ""))))

  (testing "nil and empty string behave the same"
    (is (= 1.0 (temporal/similarity nil nil)))
    (is (= 1.0 (temporal/similarity nil ""))))

  (testing "completely different strings have similarity below threshold"
    (is (< (temporal/similarity "orders" "products") 0.5))))

;;; ---------------------------------------------------------------------------
;;; t-first-used population
;;; ---------------------------------------------------------------------------

(deftest derive-populates-t-first-used-on-Q-atoms-test
  (testing ":t-first-used is set to the min iteration across the atom's :Q provenance entries"
    (let [normalized
          (extract/normalize
           [(user-row 1 "go")
            (assistant-row 2
                           [;; iter 0 — first authoring touch
                            (input-part "c1" "create_sql_query" {:database_id 1 :sql_query "..."})
                            (output-part "c1" "create_sql_query"
                                         {:input  [{:type "table" :id 99}]
                                          :output []})
                            (text-part "let me revise")
                            ;; iter 1 — second authoring touch on the same entity
                            (input-part "c2" "edit_sql_query" {:query_id "q" :sql_query "..."})
                            (output-part "c2" "edit_sql_query"
                                         {:input  [{:type "table" :id 99}]
                                          :output []})])])
          enriched   (temporal/derive normalized)]
      (is (= 0 (get-in enriched [:sets :Q ["table" "99"] :t-first-used]))
          "first authoring touch was iteration 0, so :t-first-used = 0"))))

(deftest derive-leaves-non-Q-sets-untouched-test
  (testing "atoms in :P/:D/:I do not get :t-first-used set"
    (let [enriched (temporal/derive
                    (extract/normalize
                     [(user-row 1 "x")
                      (assistant-row 2
                                     [(input-part "c1" "search" {})
                                      (output-part "c1" "search"
                                                   {:input  []
                                                    :output [{:type "table" :id 50}]})])]))]
      (is (nil? (get-in enriched [:sets :D ["table" "50"] :t-first-used]))
          ":D atoms keep :t-first-used = nil — they were surfaced, not authored against"))))

;;; ---------------------------------------------------------------------------
;;; :iterations
;;; ---------------------------------------------------------------------------

(deftest derive-iterations-empty-tool-events-test
  (is (= 0 (get-in (temporal/derive
                    (extract/normalize
                     [(user-row 1 "hi") (assistant-row 2 [(text-part "hello")])]))
                   [:temporal :iterations]))
      "no tool calls → 0 iterations (not nil, not negative)"))

(deftest derive-iterations-counts-llm-emissions-test
  (testing "iterations = inc(max iteration-index across tool-events)"
    (let [enriched
          (temporal/derive
           (extract/normalize
            [(user-row 1 "go")
             (assistant-row 2
                            [;; iter 0
                             (input-part "c1" "search" {})
                             (output-part "c1" "search" {:input [] :output []})
                             (text-part "ok")
                             ;; iter 1
                             (input-part "c2" "search" {})
                             (output-part "c2" "search" {:input [] :output []})])]))]
      (is (= 2 (get-in enriched [:temporal :iterations]))))))

;;; ---------------------------------------------------------------------------
;;; :thrash-events
;;; ---------------------------------------------------------------------------

(deftest derive-thrash-events-counts-adjacent-same-function-similar-args-test
  (testing "two adjacent identical search calls register as one thrash pair"
    (let [enriched
          (temporal/derive
           (extract/normalize
            [(user-row 1 "go")
             (assistant-row 2
                            [(input-part "c1" "search" {:keyword_queries ["orders"]})
                             (output-part "c1" "search" {:input [] :output []})
                             (text-part "let me try again")
                             (input-part "c2" "search" {:keyword_queries ["orders"]})
                             (output-part "c2" "search" {:input [] :output []})])]))]
      (is (= 1 (get-in enriched [:temporal :thrash-events])))))

  (testing "two adjacent calls of different functions don't thrash"
    (let [enriched
          (temporal/derive
           (extract/normalize
            [(user-row 1 "go")
             (assistant-row 2
                            [(input-part "c1" "search" {:keyword_queries ["x"]})
                             (output-part "c1" "search" {:input [] :output []})
                             (input-part "c2" "list_available_fields" {:table_id 10})
                             (output-part "c2" "list_available_fields"
                                          {:input [{:type "table" :id 10}] :output []})])]))]
      (is (= 0 (get-in enriched [:temporal :thrash-events])))))

  (testing "two adjacent same-function calls with very different args don't thrash"
    (let [enriched
          (temporal/derive
           (extract/normalize
            [(user-row 1 "go")
             (assistant-row 2
                            [(input-part "c1" "search" {:keyword_queries ["orders"]})
                             (output-part "c1" "search" {:input [] :output []})
                             (input-part "c2" "search" {:keyword_queries ["customer-lifetime-value-cohort-analysis"]})
                             (output-part "c2" "search" {:input [] :output []})])]))]
      (is (= 0 (get-in enriched [:temporal :thrash-events]))))))

;;; ---------------------------------------------------------------------------
;;; :rediscovery-r
;;; ---------------------------------------------------------------------------

(deftest derive-rediscovery-r-zero-on-single-search-test
  (let [enriched (temporal/derive
                  (extract/normalize
                   [(user-row 1 "go")
                    (assistant-row 2
                                   [(input-part "c1" "search" {:keyword_queries ["x"]})
                                    (output-part "c1" "search" {:input [] :output []})])]))]
    (is (= 0 (get-in enriched [:temporal :rediscovery-r]))
        "one search call = no possibility of re-discovery")))

(deftest derive-rediscovery-r-counts-duplicates-test
  (testing "five identical search calls → r = 4 (one cluster covering all five)"
    (let [searches (mapcat (fn [i]
                             [(input-part (str "c" i) "search" {:keyword_queries ["orders"]})
                              (output-part (str "c" i) "search" {:input [] :output []})])
                           (range 5))
          enriched (temporal/derive
                    (extract/normalize
                     [(user-row 1 "go")
                      (assistant-row 2 searches)]))]
      (is (= 4 (get-in enriched [:temporal :rediscovery-r])))))

  (testing "three distinct queries (no two pairwise-similar) → r = 0"
    (let [enriched
          (temporal/derive
           (extract/normalize
            [(user-row 1 "go")
             (assistant-row 2
                            [(input-part "c1" "search" {:keyword_queries ["orders"]})
                             (output-part "c1" "search" {:input [] :output []})
                             (input-part "c2" "search" {:keyword_queries ["customer-lifetime-cohorts"]})
                             (output-part "c2" "search" {:input [] :output []})
                             (input-part "c3" "search" {:keyword_queries ["marketing-attribution"]})
                             (output-part "c3" "search" {:input [] :output []})])]))]
      (is (= 0 (get-in enriched [:temporal :rediscovery-r]))))))

(deftest derive-rediscovery-r-transitive-clustering-test
  (testing "clustering is transitive — three near-identical queries land in one cluster"
    (let [enriched
          (temporal/derive
           (extract/normalize
            [(user-row 1 "go")
             (assistant-row 2
                            [(input-part "c1" "search" {:keyword_queries ["orders"]})
                             (output-part "c1" "search" {:input [] :output []})
                             (input-part "c2" "search" {:keyword_queries ["orders"]})
                             (output-part "c2" "search" {:input [] :output []})
                             (input-part "c3" "search" {:keyword_queries ["orders"]})
                             (output-part "c3" "search" {:input [] :output []})])]))]
      (is (= 2 (get-in enriched [:temporal :rediscovery-r]))
          "3 searches, 1 cluster → r = 2"))))

;;; ---------------------------------------------------------------------------
;;; :errors-resolved-rate
;;; ---------------------------------------------------------------------------

(deftest derive-errors-resolved-rate-nil-when-no-errors-test
  (let [enriched (temporal/derive
                  (extract/normalize
                   [(user-row 1 "go")
                    (assistant-row 2
                                   [(input-part "c1" "search" {})
                                    (output-part "c1" "search" {:input [] :output []})])]))]
    (is (nil? (get-in enriched [:temporal :errors-resolved-rate]))
        "no errored tool-events → no signal → nil")))

(deftest derive-errors-resolved-rate-productive-test
  (testing "errored edit followed by a successful edit → rate = 1.0"
    (let [enriched
          (temporal/derive
           (extract/normalize
            [(user-row 1 "fix this")
             (assistant-row 2
                            [(input-part "c1" "edit_sql_query" {:query_id "q" :sql_query "..."})
                             (output-part "c1" "edit_sql_query"
                                          {:input [] :output []}
                                          :error {:message "syntax err"})
                             (text-part "trying again")
                             (input-part "c2" "edit_sql_query" {:query_id "q" :sql_query "..."})
                             (output-part "c2" "edit_sql_query" {:input [] :output []})])]))]
      (is (= 1.0 (get-in enriched [:temporal :errors-resolved-rate]))))))

(deftest derive-errors-resolved-rate-thrash-test
  (testing "errored edit followed by another errored edit → rate = 0.0"
    (let [enriched
          (temporal/derive
           (extract/normalize
            [(user-row 1 "fix this")
             (assistant-row 2
                            [(input-part "c1" "edit_sql_query" {:query_id "q" :sql_query "..."})
                             (output-part "c1" "edit_sql_query"
                                          {:input [] :output []}
                                          :error {:message "syntax err 1"})
                             (input-part "c2" "edit_sql_query" {:query_id "q" :sql_query "..."})
                             (output-part "c2" "edit_sql_query"
                                          {:input [] :output []}
                                          :error {:message "syntax err 2"})])]))]
      (is (= 0.0 (get-in enriched [:temporal :errors-resolved-rate]))))))

(deftest derive-errors-resolved-rate-mixed-test
  (testing "1 of 2 errors resolved → rate = 0.5"
    (let [enriched
          (temporal/derive
           (extract/normalize
            [(user-row 1 "x")
             (assistant-row 2
                            [(input-part "c1" "edit_sql_query" {:query_id "q"})
                             (output-part "c1" "edit_sql_query" {:input [] :output []}
                                          :error {:message "e1"})
                             (input-part "c2" "edit_sql_query" {:query_id "q"})
                             (output-part "c2" "edit_sql_query" {:input [] :output []})
                             (input-part "c3" "search" {})
                             (output-part "c3" "search" {:input [] :output []}
                                          :error {:message "e2"})])]))]
      (is (= 0.5 (get-in enriched [:temporal :errors-resolved-rate]))
          "c1's error resolved by c2; c3's error has no follow-up search → unresolved"))))

(deftest derive-errors-resolved-rate-no-follow-up-test
  (testing "errored call with no later same-function call → unresolved"
    (let [enriched
          (temporal/derive
           (extract/normalize
            [(user-row 1 "x")
             (assistant-row 2
                            [(input-part "c1" "edit_sql_query" {:query_id "q"})
                             (output-part "c1" "edit_sql_query"
                                          {:input [] :output []}
                                          :error {:message "boom"})])]))]
      (is (= 0.0 (get-in enriched [:temporal :errors-resolved-rate]))))))

;;; ---------------------------------------------------------------------------
;;; :terminal-state — priority chain
;;; ---------------------------------------------------------------------------

(deftest derive-terminal-state-from-data-part-test
  (testing "each known reason on the terminal_state data part round-trips through derive"
    (doseq [reason [:model_signaled_done :final_response :iter_cap :error]]
      (let [enriched (temporal/derive
                      (extract/normalize
                       [(user-row 1 "x")
                        (assistant-row 2
                                       [(text-part "done")
                                        (terminal-state-data-part reason)])]))]
        (is (= reason (get-in enriched [:temporal :terminal-state]))
            (str "data-part with :reason " (name reason) " projects through"))))))

(deftest derive-terminal-state-unknown-reason-falls-through-to-error-test
  (testing "an unknown :reason in the data part is conservatively treated as :error"
    (let [enriched (temporal/derive
                    (extract/normalize
                     [(user-row 1 "x")
                      (assistant-row 2
                                     [(text-part "done")
                                      {:type "data" :data-type "terminal_state"
                                       :data {:reason "future_reason_we_dont_know"}}])]))]
      (is (= :error (get-in enriched [:temporal :terminal-state]))))))

(deftest derive-terminal-state-error-col-fallback-test
  (testing "no data-part + non-nil :error column → :error"
    (let [enriched (temporal/derive
                    (extract/normalize
                     [(user-row 1 "x")
                      (assistant-row 2 [(text-part "boom")]
                                     {:error "stack trace here"})]))]
      (is (= :error (get-in enriched [:temporal :terminal-state]))))))

(deftest derive-terminal-state-aborted-fallback-test
  (testing "no data-part, no :error col, :finished = false → :aborted"
    (let [enriched (temporal/derive
                    (extract/normalize
                     [(user-row 1 "x")
                      (assistant-row 2 [(text-part "interrupted")]
                                     {:finished false})]))]
      (is (= :aborted (get-in enriched [:temporal :terminal-state]))))))

(deftest derive-terminal-state-default-model-signaled-done-test
  (testing "no data-part, no :error, :finished = true (default) → :model_signaled_done"
    (let [enriched (temporal/derive
                    (extract/normalize
                     [(user-row 1 "x")
                      (assistant-row 2 [(text-part "all done")])]))]
      (is (= :model_signaled_done (get-in enriched [:temporal :terminal-state]))))))

(deftest derive-terminal-state-data-part-wins-over-error-col-test
  (testing "data-part takes priority over a non-nil :error column"
    (let [enriched (temporal/derive
                    (extract/normalize
                     [(user-row 1 "x")
                      (assistant-row 2
                                     [(text-part "done")
                                      (terminal-state-data-part :final_response)]
                                     ;; an :error string from a streamed :error part
                                     ;; can coexist with a successful loop exit
                                     {:error "non-fatal stream error"})]))]
      (is (= :final_response (get-in enriched [:temporal :terminal-state]))
          "the loop reached :done cleanly even though a tool errored along the way"))))

(deftest derive-terminal-state-empty-conversation-test
  (testing "no assistant rows at all → defensive :model_signaled_done (degenerate but harmless)"
    (let [enriched (temporal/derive
                    (extract/normalize
                     [(user-row 1 "no response")]))]
      (is (= :model_signaled_done (get-in enriched [:temporal :terminal-state]))))))

;;; ---------------------------------------------------------------------------
;;; Integration shape — the full :temporal block
;;; ---------------------------------------------------------------------------

(deftest derive-attaches-temporal-block-with-all-keys-test
  (testing "the derive output's :temporal block carries every contracted key"
    (let [enriched (temporal/derive
                    (extract/normalize
                     [(user-row 1 "x")
                      (assistant-row 2 [(text-part "hi")])]))]
      (is (= #{:iterations :thrash-events :rediscovery-r :errors-resolved-rate :terminal-state}
             (set (keys (:temporal enriched))))))))

(deftest derive-end-to-end-realistic-conversation-test
  (testing "a productive conversation with one error+recovery and one CONV_Q entity"
    (let [enriched
          (temporal/derive
           (extract/normalize
            [(user-row 1 "show orders")
             (assistant-row 2
                            [;; iter 0 — discover
                             (input-part "c1" "search" {:keyword_queries ["orders"]})
                             (output-part "c1" "search"
                                          {:input  []
                                           :output [{:type "table" :id 100}]})
                             ;; iter 1 — first authoring attempt errors
                             (text-part "let me build the query")
                             (input-part "c2" "create_sql_query" {:database_id 1 :sql_query "SELCT * FROM orders"})
                             (output-part "c2" "create_sql_query"
                                          {:input  [{:type "database" :id 1}
                                                    {:type "table"    :id 100}]
                                           :output []}
                                          :error {:message "SQL syntax"})
                             ;; iter 2 — fix the typo
                             (text-part "fixing the typo")
                             (input-part "c3" "create_sql_query" {:database_id 1 :sql_query "SELECT * FROM orders"})
                             (output-part "c3" "create_sql_query"
                                          {:input  [{:type "database" :id 1}
                                                    {:type "table"    :id 100}]
                                           :output []})
                             (terminal-state-data-part :final_response)])]))
          temporal-block (:temporal enriched)]
      (is (= 3                  (:iterations temporal-block)))
      (is (= 1.0                (:errors-resolved-rate temporal-block))
          "the errored create_sql_query was followed by a successful one")
      (is (= 0                  (:rediscovery-r temporal-block))
          "one search call only — no rediscovery")
      (is (= :final_response    (:terminal-state temporal-block)))
      (is (= 1 (get-in enriched [:sets :Q ["table" "100"] :t-first-used]))
          "first authoring touch on table 100 was iteration 1"))))
