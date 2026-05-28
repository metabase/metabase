(ns metabase.metabot.quality.attribution-test
  "Pure unit tests. Each test hand-builds a minimal conversation
  message-list, runs it through `extract/normalize → temporal/derive`,
  and feeds the result into [[metabase.metabot.quality.attribution/project]].

  No DB hits — `governance` is a literal `{[type id-str] facts}` map.

  The fixtures intentionally use realistic message shapes (post
  `mi/transform-json` form: keyword map keys, string `:type` values)
  rather than synthetic short-circuits, so the tests exercise the full
  extract → attribution path."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.quality.attribution :as attribution]
   [metabase.metabot.quality.constants :as constants]
   [metabase.metabot.quality.extract :as extract]
   [metabase.metabot.quality.metrics :as metrics]
   [metabase.metabot.quality.subscores :as subscores]
   [metabase.metabot.quality.temporal :as temporal]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------
;;; Builders
;;; ---------------------------------------------------------------------------

(defn- user-row
  "Build a user row with an optional prompt-context block. `pc` should be
  a map with `:user_is_viewing` / `:user_recently_viewed` /
  `:mentioned_refs` entry vectors (any omitted defaults to `[]`)."
  [{:keys [id created-at content pc]
    :or   {id 1 created-at 0 content "hi" pc nil}}]
  (let [base-data [{:role "user" :content content}]
        data      (if pc
                    (conj base-data (merge {:type                 "prompt-context"
                                            :user_is_viewing      []
                                            :user_recently_viewed []
                                            :mentioned_refs       []}
                                           pc))
                    base-data)]
    {:id              id
     :role            :user
     :created_at      created-at
     :conversation_id "conv-1"
     :profile_id      "internal"
     :user_id         1
     :data            data}))

(defn- tool-input-part
  [call-id function arguments]
  {:type      "tool-input"
   :id        call-id
   :function  function
   :arguments arguments})

(defn- tool-output-part
  ([call-id function entity-usage]
   (tool-output-part call-id function entity-usage nil))
  ([call-id function entity-usage error]
   (cond-> {:type     "tool-output"
            :id       call-id
            :function function
            :result   {:structured-output {:entity-usage entity-usage}}}
     error (assoc :error error))))

(defn- terminal-state-part
  [reason]
  {:type "data" :data-type "terminal_state" :version 1 :data {:reason reason}})

(defn- assistant-row
  "Build an assistant row from a list of tool calls plus an optional
  terminal-state reason. `tool-calls` is a vector of maps each carrying
  `:call-id :function :arguments :input :output :error`."
  [{:keys [id created-at tool-calls terminal-state]
    :or   {id 100 created-at 1 tool-calls [] terminal-state "final_response"}}]
  (let [parts (vec (mapcat (fn [{:keys [call-id function arguments input output error]
                                 :or   {arguments {} input [] output []}}]
                             [(tool-input-part call-id function arguments)
                              (tool-output-part call-id function
                                                {:input input :output output}
                                                error)])
                           tool-calls))
        data  (cond-> parts
                terminal-state (conj (terminal-state-part terminal-state)))]
    {:id              id
     :role            :assistant
     :created_at      created-at
     :conversation_id "conv-1"
     :profile_id      "internal"
     :user_id         1
     :finished        true
     :data            data}))

(defn- normalize-and-derive
  "Convenience: run a fixture's messages through extract+temporal."
  [messages]
  (-> messages extract/normalize temporal/derive))

(defn- attribution-for
  "Run `attribution/project` against a fixture's messages with optional
  `governance` (default `{}`)."
  [messages & {:keys [governance] :or {governance {}}}]
  (attribution/project (normalize-and-derive messages) governance))

(defn- observables-for-row
  [attribution row-id]
  (get-in attribution [row-id :observables]))

;;; ---------------------------------------------------------------------------
;;; Shape contract
;;; ---------------------------------------------------------------------------

(deftest project-keys-result-by-assistant-message-id-test
  (testing "every assistant row gets exactly one attribution entry; user rows are absent"
    (let [messages [(user-row {:id 1 :created-at 0})
                    (assistant-row {:id 100 :created-at 1 :terminal-state "final_response"})
                    (user-row {:id 2 :created-at 2})
                    (assistant-row {:id 200 :created-at 3 :terminal-state "final_response"})]
          out      (attribution-for messages)]
      (is (= #{100 200} (set (keys out))))
      (doseq [row-id [100 200]]
        (let [a (get out row-id)]
          (is (= constants/quality-score-version (:version a)))
          (is (vector? (:observables a)))
          (is (number? (:quality_score a)))
          (is (map?    (:subscores a))))))))

(deftest project-empty-conversation-yields-empty-map-test
  (testing "no assistant rows → no attribution entries"
    (is (= {} (attribution-for [(user-row {:id 1})])))))

;;; ---------------------------------------------------------------------------
;;; hallucinated-ref
;;; ---------------------------------------------------------------------------

(deftest hallucinated-ref-lands-on-q-entry-turn-test
  (testing "an authoring tool's input ref that is not in prompt-context or discovery
            lands as hallucinated on the turn it was authored"
    (let [messages [(user-row {:id 1 :created-at 0})
                    (assistant-row
                     {:id         100
                      :created-at 1
                      :tool-calls [{:call-id "a1" :function "construct_notebook_query"
                                    :input  [{:type "card" :id 999}]}]
                      :terminal-state "final_response"})]
          out      (attribution-for messages)
          obs      (observables-for-row out 100)]
      (is (some (fn [o]
                  (and (= "grounded_source_share" (:concern_signal o))
                       (= "hallucinated_ref" (:kind o))
                       (= {:type "card" :id 999} (:entity o))
                       (= "a1" (get-in o [:context :tool_call]))))
                obs)))))

;;; ---------------------------------------------------------------------------
;;; unproductive-search
;;; ---------------------------------------------------------------------------

(deftest unproductive-search-fires-on-rediscovering-call-test
  (testing "a search call that rediscovers a prior call's results fires
            unproductive-search on its own turn, back-referencing the prior call"
    (let [messages [(user-row {:id 1 :created-at 0})
                    (assistant-row
                     {:id         100
                      :created-at 1
                      :tool-calls [{:call-id "s1" :function "search"
                                    :output [{:type "card" :id 10} {:type "card" :id 11}]}]
                      :terminal-state "final_response"})
                    (assistant-row
                     {:id         200
                      :created-at 2
                      :tool-calls [{:call-id "s2" :function "search"
                                    :output [{:type "card" :id 10} {:type "card" :id 11}]}]
                      :terminal-state "final_response"})]
          out      (attribution-for messages)
          o        (first (filter #(= "unproductive_search" (:kind %))
                                  (observables-for-row out 200)))]
      (is o)
      (is (= "search_efficiency" (:concern_signal o)))
      (is (= "s2" (get-in o [:context :tool_call])))
      (is (= ["s1"] (get-in o [:context :overlapping_calls])))
      (testing "the first call has no prior to overlap and never fires"
        (is (empty? (filter #(= "unproductive_search" (:kind %))
                            (observables-for-row out 100))))))))

(deftest disjoint-searches-do-not-fire-unproductive-search-test
  (testing "searches with no overlapping results fire no unproductive-search"
    (let [messages [(user-row {:id 1 :created-at 0})
                    (assistant-row
                     {:id         100
                      :created-at 1
                      :tool-calls [{:call-id "s1" :function "search"
                                    :output [{:type "card" :id 10}]}]
                      :terminal-state "final_response"})
                    (assistant-row
                     {:id         200
                      :created-at 2
                      :tool-calls [{:call-id "s2" :function "search"
                                    :output [{:type "card" :id 20}]}]
                      :terminal-state "final_response"})]
          out      (attribution-for messages)]
      (is (empty? (mapcat (fn [row-id]
                            (filter #(= "unproductive_search" (:kind %))
                                    (observables-for-row out row-id)))
                          [100 200]))))))

;;; ---------------------------------------------------------------------------
;;; tool-error
;;; ---------------------------------------------------------------------------

(deftest tool-error-lands-on-errored-turn-test
  (testing "an errored tool-event fires tool-error on the errored turn"
    (let [messages [(user-row {:id 1 :created-at 0})
                    (assistant-row
                     {:id         100
                      :created-at 1
                      :tool-calls [{:call-id "c1" :function "edit_sql_query"
                                    :arguments {:query "SELECT 1"}
                                    :input  [{:type "card" :id 1}]
                                    :error  {:msg "syntax error"}}]
                      :terminal-state "final_response"})]
          out      (attribution-for messages)
          obs      (observables-for-row out 100)
          o        (first (filter #(= "tool_error" (:kind %)) obs))]
      (is o)
      (is (= "execution_health" (:concern_signal o)))
      (is (= "c1" (get-in o [:context :tool_call])))
      (is (= "edit_sql_query" (get-in o [:context :function])))
      (is (= {:msg "syntax error"} (get-in o [:context :error]))))))

;;; ---------------------------------------------------------------------------
;;; termination — iter-cap / error-termination
;;; ---------------------------------------------------------------------------

(deftest iter-cap-lands-on-last-assistant-turn-test
  (testing "terminal_state = iter_cap → iter-cap observable on the last assistant turn"
    (let [messages [(user-row {:id 1 :created-at 0})
                    (assistant-row {:id 100 :created-at 1 :terminal-state "iter_cap"})]
          out      (attribution-for messages)
          obs      (observables-for-row out 100)
          o        (first (filter #(= "iter_cap" (:kind %)) obs))]
      (is o)
      (is (= "execution_health" (:concern_signal o)))
      (is (= "iter_cap" (get-in o [:context :terminal_state]))))))

(deftest error-termination-fires-on-error-test
  (testing "terminal_state = error → error-termination"
    (let [messages [(user-row {:id 1 :created-at 0})
                    (assistant-row {:id 100 :created-at 1 :terminal-state "error"})]
          out      (attribution-for messages)
          o        (first (filter #(= "error_termination" (:kind %))
                                  (observables-for-row out 100)))]
      (is o)
      (is (= "execution_health" (:concern_signal o)))
      (is (= "error" (get-in o [:context :terminal_state]))))))

(deftest aborted-collapses-to-error-termination-test
  (testing "an aborted conversation (finished=false, no terminal_state part) fires
            error_termination with :terminal_state \"aborted\""
    (let [messages [(user-row {:id 1 :created-at 0})
                    (assoc (assistant-row {:id 100 :created-at 1 :terminal-state nil})
                           :finished false)]
          out      (attribution-for messages)
          o        (first (filter #(= "error_termination" (:kind %))
                                  (observables-for-row out 100)))]
      (is o)
      (is (= "execution_health" (:concern_signal o)))
      (is (= "aborted" (get-in o [:context :terminal_state]))))))

(deftest clean-termination-emits-no-termination-observable-test
  (testing "final_response / model_signaled_done leave no termination observable"
    (let [messages [(user-row {:id 1 :created-at 0})
                    (assistant-row {:id 100 :created-at 1 :terminal-state "final_response"})]
          out      (attribution-for messages)]
      (is (empty? (filter #(contains? #{"iter_cap" "error_termination"} (:kind %))
                          (observables-for-row out 100)))))))

;;; ---------------------------------------------------------------------------
;;; prefix score (quality_score + subscores)
;;; ---------------------------------------------------------------------------

(deftest last-turn-prefix-score-matches-conversation-level-test
  (testing "the last assistant turn's score equals the conversation-level
            score computed independently"
    (let [messages   [(user-row {:id 1 :created-at 0 :pc {:user_is_viewing [{:type "table" :id 1}]}})
                      (assistant-row
                       {:id         100
                        :created-at 1
                        :tool-calls [{:call-id "s1" :function "search"
                                      :arguments {:keyword_queries ["orders"]}
                                      :output    [{:type "card" :id 10}]}]
                        :terminal-state "final_response"})
                      (assistant-row
                       {:id         200
                        :created-at 2
                        :tool-calls [{:call-id "a1" :function "construct_notebook_query"
                                      :input  [{:type "table" :id 1}]}]
                        :terminal-state "final_response"})]
          governance {["table" "1"]  {:kind :table :name "orders" :data-authority :authoritative}
                      ["card"  "10"] {:kind :card :name "orders model" :moderation-status "verified"}}
          normalized (normalize-and-derive messages)
          metrics    (metrics/compute normalized governance)
          conv-subs  (subscores/compose metrics)
          out        (attribution/project normalized governance)
          last-pref  (select-keys (get out 200) [:quality_score :subscores])]
      (is (= (subscores/project-json conv-subs)
             last-pref)))))

(deftest prefix-score-tightens-as-conversation-progresses-test
  (testing "each assistant turn carries a score computed against the message
            prefix ending at that turn"
    (let [messages [(user-row {:id 1 :created-at 0})
                    (assistant-row
                     {:id         100
                      :created-at 1
                      :tool-calls [{:call-id "c1" :function "edit_sql_query"
                                    :arguments {:query "x"}
                                    :input  [{:type "card" :id 1}]
                                    :error  {:msg "boom"}}]
                      :terminal-state "final_response"})
                    (assistant-row
                     {:id         200
                      :created-at 2
                      :tool-calls [{:call-id "c2" :function "edit_sql_query"
                                    :arguments {:query "y"}
                                    :input  [{:type "card" :id 1}]}]
                      :terminal-state "final_response"})]
          out      (attribution-for messages)
          pref-100 (get out 100)
          pref-200 (get out 200)]
      (is (every? #(contains? (:subscores pref-100) %) [:data_source_quality :execution_health]))
      (is (every? #(contains? (:subscores pref-200) %) [:data_source_quality :execution_health]))
      (is (number? (:quality_score pref-100)))
      (is (number? (:quality_score pref-200))))))

;;; ---------------------------------------------------------------------------
;;; Multi-turn smoke
;;; ---------------------------------------------------------------------------

(deftest multi-turn-fixture-produces-per-turn-attribution-blocks-test
  (testing "a multi-turn conversation produces one attribution block per assistant
            turn, each with the version stamp and a subscores map"
    (let [n-turns  5
          messages (concat
                    [(user-row {:id 0 :created-at 0})]
                    (for [i (range n-turns)]
                      (assistant-row
                       {:id         (+ 100 i)
                        :created-at (inc i)
                        :tool-calls [{:call-id  (str "s" i)
                                      :function "search"
                                      :arguments {:keyword_queries [(str "q" i)]}
                                      :output [{:type "card" :id (+ 10 i)}]}]
                        :terminal-state "final_response"})))
          out      (attribution-for messages)]
      (is (= n-turns (count out)))
      (doseq [i (range n-turns)]
        (let [a (get out (+ 100 i))]
          (is (some? a))
          (is (= constants/quality-score-version (:version a)))
          (is (map?    (:subscores a)))
          (is (vector? (:observables a))))))))
