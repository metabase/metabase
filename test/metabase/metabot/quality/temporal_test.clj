(ns metabase.metabot.quality.temporal-test
  "Unit tests for the temporal derivations — pure. Each test either
  hand-builds a minimal normalized struct or feeds a synthetic message
  fixture through `extract/normalize` before exercising the temporal
  functions. No DB hits."
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
;;; instrumented? — did the conversation run the instrumented agent loop
;;; ---------------------------------------------------------------------------

(deftest instrumented-true-when-assistant-row-carries-terminal-state-part-test
  (testing "a terminal_state data part on an assistant row marks the conversation instrumented"
    (is (true? (temporal/instrumented?
                (extract/normalize
                 [(user-row 1 "x")
                  (assistant-row 2 [(text-part "done")
                                    (terminal-state-data-part :model_signaled_done)])]))))))

(deftest instrumented-false-when-no-terminal-state-part-test
  (testing "an assistant turn of only text parts is not instrumented — the
            compute-terminal-state default of :model_signaled_done is a fallback,
            not a real signal, and must not read as instrumented"
    (is (false? (temporal/instrumented?
                 (extract/normalize
                  [(user-row 1 "x")
                   (assistant-row 2 [(text-part "just chatting")])]))))))

(deftest instrumented-true-when-any-assistant-row-carries-the-part-test
  (testing "a part on an earlier turn counts even when the latest turn carries none"
    (is (true? (temporal/instrumented?
                (extract/normalize
                 [(user-row 1 "x")
                  (assistant-row 2 [(text-part "first answer")
                                    (terminal-state-data-part :model_signaled_done)])
                  (user-row 3 "follow up")
                  (assistant-row 4 [(text-part "still typing")])]))))))

;;; ---------------------------------------------------------------------------
;;; Integration shape — the full :temporal block
;;; ---------------------------------------------------------------------------

(deftest derive-attaches-temporal-block-with-all-keys-test
  (testing "the derive output's :temporal block carries every contracted key"
    (let [enriched (temporal/derive
                    (extract/normalize
                     [(user-row 1 "x")
                      (assistant-row 2 [(text-part "hi")])]))]
      (is (= #{:iterations :terminal-state}
             (set (keys (:temporal enriched))))))))

(deftest derive-end-to-end-realistic-conversation-test
  (testing "a productive conversation with one error+recovery and one authored entity"
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
      (is (= :final_response    (:terminal-state temporal-block)))
      (is (= 1 (get-in enriched [:sets :Q ["table" "100"] :t-first-used]))
          "first authoring touch on table 100 was iteration 1"))))
