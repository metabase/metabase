(ns metabase.metabot.quality.attribution-test
  "Phase 7 unit tests — pure. Each test hand-builds a minimal conversation
  message-list, runs it through `extract/normalize → temporal/derive`,
  and feeds the result into [[metabase.metabot.quality.attribution/project]].

  No DB hits — `governance` is a literal `{[type id-str] facts}` map and
  `ancestry-of` is `(constantly [])` or a fixed stub closure.

  The fixtures intentionally use realistic message shapes (post
  `mi/transform-json` form: keyword map keys, string `:type` values)
  rather than synthetic short-circuits, so the tests exercise the full
  extract → attribution path."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.quality.attribution :as attribution]
   [metabase.metabot.quality.concern-signals :as concern-signals]
   [metabase.metabot.quality.constants :as constants]
   [metabase.metabot.quality.extract :as extract]
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
  `governance` (default `{}`) and `ancestry-of` (default `(constantly [])`)."
  [messages & {:keys [governance ancestry-of]
               :or   {governance {} ancestry-of (constantly [])}}]
  (attribution/project (normalize-and-derive messages) governance ancestry-of))

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
          (is (= constants/composite-version (:version a)))
          (is (vector? (:observables a)))
          (is (map?    (:prefix_subscores a))))))))

(deftest project-empty-conversation-yields-empty-map-test
  (testing "no assistant rows → no attribution entries"
    (is (= {} (attribution-for [(user-row {:id 1})])))))

;;; ---------------------------------------------------------------------------
;;; canonical-bypass
;;; ---------------------------------------------------------------------------

(deftest canonical-bypass-lands-on-bypass-turn-with-back-reference-test
  (testing "Y in CONV_Q with a verified-similar X in CONV_D fires a canonical-bypass
            observable on the turn where Y was authored, with the canonical surface
            in :canonical-entity and the surfacing iteration in :canonical-surfacing-turn.

            Y is also in CONV_P (user_is_viewing) so the substitution rule fires
            without dragging in a hallucinated-ref observable — keeps this test
            focused on canonical-bypass."
    (let [messages   [(user-row {:id 1 :created-at 0
                                 :pc {:user_is_viewing [{:type "card" :id 99}]}})
                      (assistant-row
                       {:id         100
                        :created-at 1
                        :tool-calls [{:call-id "s1" :function "search"
                                      :arguments {:keyword_queries ["orders"]}
                                      :output    [{:type "card" :id 42}]}]
                        :terminal-state "final_response"})
                      (assistant-row
                       {:id         200
                        :created-at 2
                        :tool-calls [{:call-id "a1" :function "construct_notebook_query"
                                      :input  [{:type "card" :id 99}]}]
                        :terminal-state "final_response"})]
          governance {["card" "42"] {:verified? true  :db-id 5
                                     :name "orders fact" :lives-in-personal? false}
                      ["card" "99"] {:verified? false :db-id 5
                                     :name "orders facts" :lives-in-personal? false}}
          out        (attribution-for messages :governance governance)
          obs        (observables-for-row out 200)
          bypasses   (filter #(= "canonical-bypass" (:kind %)) obs)]
      (is (= 1 (count bypasses)))
      (let [o (first bypasses)]
        (is (= "selection-quality" (:concern_signal o)))
        (is (= {:type "card" :id 99} (:entity o)))
        (is (= {:type "card" :id 42} (get-in o [:context :canonical-entity])))
        (is (= "a1" (get-in o [:context :tool-call])))
        (is (number? (get-in o [:context :canonical-surfacing-turn]))
            "back-reference to the surfacing iteration (an integer iteration-index)"))
      (testing "Y in P keeps it out of CONV_H — no spurious hallucinated-ref"
        (is (empty? (filter #(= "hallucinated-ref" (:kind %)) obs)))))))

(deftest canonical-bypass-self-match-excluded-test
  (testing "a table surfaced by discovery in turn N and authored against in turn N+1 does
            not fire a canonical-bypass observable — the entity sits in both CONV_D and
            CONV_Q but its D-atom and Q-atom share the same governance row, which would
            otherwise self-substitute under the table substitution rule
            (db-id + schema + name-similarity)"
    (let [messages   [(user-row {:id 1 :created-at 0})
                      (assistant-row
                       {:id         100
                        :created-at 1
                        :tool-calls [{:call-id "d1" :function "read_resource"
                                      :arguments {:uris ["metabase://databases"]}
                                      :output    [{:type "table" :id 8}]}]
                        :terminal-state "final_response"})
                      (user-row {:id 2 :created-at 2})
                      (assistant-row
                       {:id         200
                        :created-at 3
                        :tool-calls [{:call-id "a1" :function "construct_notebook_query"
                                      :input  [{:type "table" :id 8}]}]
                        :terminal-state "final_response"})]
          governance {["table" "8"] {:name "INVOICES" :db-id 1 :schema "PUBLIC"}}
          out        (attribution-for messages :governance governance)]
      (is (empty? (filter #(= "canonical-bypass" (:kind %))
                          (observables-for-row out 200)))
          "table 8 in both D (turn 1) and Q (turn 2) must not self-match"))))

;;; ---------------------------------------------------------------------------
;;; personal-collection-pick
;;; ---------------------------------------------------------------------------

(deftest personal-collection-pick-lands-on-authoring-turn-test
  (testing "Y in CONV_Q card-type with lives-in-personal? = true fires the observable"
    (let [messages   [(user-row {:id 1 :created-at 0})
                      (assistant-row
                       {:id         100
                        :created-at 1
                        :tool-calls [{:call-id "a1" :function "construct_notebook_query"
                                      :input  [{:type "card" :id 77}]}]
                        :terminal-state "final_response"})]
          governance {["card" "77"] {:verified? false :db-id 1 :name "in personal"
                                     :lives-in-personal? true}}
          out        (attribution-for messages :governance governance)
          obs        (observables-for-row out 100)]
      (is (some (fn [o]
                  (and (= "personal-collection-pick" (:kind o))
                       (= {:type "card" :id 77} (:entity o))
                       (= "a1" (get-in o [:context :tool-call]))))
                obs)))))

(deftest personal-collection-pick-skips-tables-and-non-personal-cards-test
  (testing "tables (no personal-collection concept) and non-personal cards do not fire"
    (let [messages   [(user-row {:id 1 :created-at 0})
                      (assistant-row
                       {:id         100
                        :created-at 1
                        :tool-calls [{:call-id "a1" :function "construct_notebook_query"
                                      :input  [{:type "table" :id 1}
                                               {:type "card"  :id 88}]}]
                        :terminal-state "final_response"})]
          governance {["table" "1"]  {:name "orders"        :db-id 1 :schema "public"}
                      ["card"  "88"] {:lives-in-personal? false :verified? false :db-id 1}}
          out        (attribution-for messages :governance governance)]
      (is (empty? (filter #(= "personal-collection-pick" (:kind %))
                          (observables-for-row out 100)))))))

;;; ---------------------------------------------------------------------------
;;; hallucinated-ref
;;; ---------------------------------------------------------------------------

(deftest hallucinated-ref-lands-on-q-entry-turn-test
  (testing "an authoring tool's input ref that is not in P or D lands as hallucinated"
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
                  (and (= "grounding" (:concern_signal o))
                       (= "hallucinated-ref" (:kind o))
                       (= {:type "card" :id 999} (:entity o))
                       (= "a1" (get-in o [:context :tool-call]))))
                obs)))))

;;; ---------------------------------------------------------------------------
;;; unused-surfacing
;;; ---------------------------------------------------------------------------

(deftest unused-surfacing-lands-on-discovery-turn-test
  (testing "a non-field atom in CONV_D that the agent never authored against fires
            unused-surfacing on the discovery call's turn"
    (let [messages [(user-row {:id 1 :created-at 0})
                    (assistant-row
                     {:id         100
                      :created-at 1
                      :tool-calls [{:call-id "s1" :function "search"
                                    :arguments {:keyword_queries ["orders"]}
                                    :output    [{:type "card" :id 11}
                                                {:type "card" :id 22}]}]
                      :terminal-state "final_response"})
                    (assistant-row
                     {:id         200
                      :created-at 2
                      :tool-calls [{:call-id "a1" :function "construct_notebook_query"
                                    :input  [{:type "card" :id 11}]}]
                      :terminal-state "final_response"})]
          out      (attribution-for messages)
          obs      (observables-for-row out 100)]
      (is (some (fn [o]
                  (and (= "discovery-efficiency" (:concern_signal o))
                       (= "unused-surfacing" (:kind o))
                       (= {:type "card" :id 22} (:entity o))
                       (= "s1" (get-in o [:context :tool-call]))))
                obs)
          "card 22 was surfaced but never authored against")
      (is (not (some (fn [o]
                       (and (= "unused-surfacing" (:kind o))
                            (= {:type "card" :id 11} (:entity o))))
                     obs))
          "card 11 was both surfaced and authored against; not unused"))))

(deftest unused-surfacing-skips-fields-test
  (testing "field atoms surfaced under a parent table do not fire unused-surfacing"
    (let [messages [(user-row {:id 1 :created-at 0})
                    (assistant-row
                     {:id         100
                      :created-at 1
                      :tool-calls [{:call-id "f1" :function "list_available_fields"
                                    :arguments {}
                                    :input  [{:type "table" :id 1}]
                                    :output [{:type "field" :id 101}
                                             {:type "field" :id 102}]}]
                      :terminal-state "final_response"})]
          out      (attribution-for messages)]
      (is (empty? (filter #(= "unused-surfacing" (:kind %))
                          (observables-for-row out 100)))))))

;;; ---------------------------------------------------------------------------
;;; rediscovery
;;; ---------------------------------------------------------------------------

(deftest rediscovery-lands-on-duplicate-search-turn-test
  (testing "two identical search calls in different assistant turns → rediscovery
            observable lands on the second"
    (let [messages [(user-row {:id 1 :created-at 0})
                    (assistant-row
                     {:id         100
                      :created-at 1
                      :tool-calls [{:call-id "s1" :function "search"
                                    :arguments {:keyword_queries ["orders 2023"]}
                                    :output    [{:type "card" :id 1}]}]
                      :terminal-state "final_response"})
                    (assistant-row
                     {:id         200
                      :created-at 2
                      :tool-calls [{:call-id "s2" :function "search"
                                    :arguments {:keyword_queries ["orders 2023"]}
                                    :output    [{:type "card" :id 1}]}]
                      :terminal-state "final_response"})]
          out      (attribution-for messages)
          row100   (observables-for-row out 100)
          row200   (observables-for-row out 200)]
      (is (empty? (filter #(= "rediscovery" (:kind %)) row100))
          "the originating search is not itself a rediscovery")
      (let [o (first (filter #(= "rediscovery" (:kind %)) row200))]
        (is o)
        (is (= "discovery-efficiency" (:concern_signal o)))
        (is (= "s2" (get-in o [:context :tool-call])))
        (is (= "s1" (get-in o [:context :originating-call])))))))

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
          o        (first (filter #(= "tool-error" (:kind %)) obs))]
      (is o)
      (is (= "execution-health" (:concern_signal o)))
      (is (= "c1" (get-in o [:context :tool-call])))
      (is (= "edit_sql_query" (get-in o [:context :function])))
      (is (= {:msg "syntax error"} (get-in o [:context :error]))))))

;;; ---------------------------------------------------------------------------
;;; thrash-event
;;; ---------------------------------------------------------------------------

(deftest thrash-event-lands-on-second-in-pair-test
  (testing "two adjacent same-function calls with near-identical args → thrash-event
            on the second-in-pair (the visibility moment)"
    (let [messages [(user-row {:id 1 :created-at 0})
                    (assistant-row
                     {:id         100
                      :created-at 1
                      :tool-calls [{:call-id "c1" :function "edit_sql_query"
                                    :arguments {:query "SELECT a, b FROM t"}
                                    :input  [{:type "card" :id 1}]}
                                   {:call-id "c2" :function "edit_sql_query"
                                    :arguments {:query "SELECT a, b FROM t"}
                                    :input  [{:type "card" :id 1}]}]
                      :terminal-state "final_response"})]
          out      (attribution-for messages)
          obs      (observables-for-row out 100)
          thrashes (filter #(= "thrash-event" (:kind %)) obs)]
      (is (= 1 (count thrashes)))
      (let [o (first thrashes)]
        (is (= "conversational-economy" (:concern_signal o)))
        (is (= "c2" (get-in o [:context :tool-call])))
        (is (= "c1" (get-in o [:context :prior-tool-call])))
        (is (= "edit_sql_query" (get-in o [:context :function])))))))

;;; ---------------------------------------------------------------------------
;;; termination — iter-cap / error-termination
;;; ---------------------------------------------------------------------------

(deftest iter-cap-lands-on-last-assistant-turn-test
  (testing "terminal_state = iter_cap → iter-cap observable on the last assistant turn"
    (let [messages [(user-row {:id 1 :created-at 0})
                    (assistant-row {:id 100 :created-at 1 :terminal-state "iter_cap"})]
          out      (attribution-for messages)
          obs      (observables-for-row out 100)
          o        (first (filter #(= "iter-cap" (:kind %)) obs))]
      (is o)
      (is (= "termination" (:concern_signal o)))
      (is (= "iter_cap" (get-in o [:context :terminal-state]))))))

(deftest error-termination-fires-on-error-and-aborted-test
  (testing "terminal_state = error → error-termination"
    (let [messages [(user-row {:id 1 :created-at 0})
                    (assistant-row {:id 100 :created-at 1 :terminal-state "error"})]
          out      (attribution-for messages)
          o        (first (filter #(= "error-termination" (:kind %))
                                  (observables-for-row out 100)))]
      (is o)
      (is (= "error" (get-in o [:context :terminal-state]))))))

(deftest aborted-collapses-to-error-termination-test
  (testing "an aborted conversation (finished=false, no terminal_state part) fires
            error-termination with :terminal-state \"aborted\" — Phase 4 carry-forward
            collapse"
    (let [messages [(user-row {:id 1 :created-at 0})
                    (assoc (assistant-row {:id 100 :created-at 1 :terminal-state nil})
                           :finished false)]
          out      (attribution-for messages)
          o        (first (filter #(= "error-termination" (:kind %))
                                  (observables-for-row out 100)))]
      (is o)
      (is (= "aborted" (get-in o [:context :terminal-state]))))))

(deftest clean-termination-emits-no-termination-observable-test
  (testing "final_response / model_signaled_done leave no termination observable"
    (let [messages [(user-row {:id 1 :created-at 0})
                    (assistant-row {:id 100 :created-at 1 :terminal-state "final_response"})]
          out      (attribution-for messages)]
      (is (empty? (filter #(contains? #{"iter-cap" "error-termination"} (:kind %))
                          (observables-for-row out 100)))))))

;;; ---------------------------------------------------------------------------
;;; prefix_subscores
;;; ---------------------------------------------------------------------------

(deftest last-turn-prefix-subscores-matches-conversation-level-test
  (testing "the last assistant turn's :prefix_subscores equals the
            conversation-level subscores computed independently"
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
          governance {["table" "1"]  {:name "orders" :db-id 1 :schema "public"}
                      ["card"  "10"] {:verified? false :db-id 1
                                      :name "orders dashboard" :lives-in-personal? false}}
          normalized (normalize-and-derive messages)
          signals    (concern-signals/compute normalized governance (constantly []))
          conv-subs  (subscores/compose normalized signals)
          out        (attribution/project normalized governance (constantly []))
          last-pref  (get-in out [200 :prefix_subscores])]
      (is (= (select-keys conv-subs [:A :B :C :D :composite])
             last-pref)))))

(deftest prefix-subscores-tighten-as-conversation-progresses-test
  (testing "an early-turn prefix sees fewer events than the conversation-level
            view; the prefix subscores are computed against that smaller view"
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
          pref-100 (get-in out [100 :prefix_subscores])
          pref-200 (get-in out [200 :prefix_subscores])]
      (is (every? #(contains? pref-100 %) [:A :B :C :D :composite]))
      (is (every? #(contains? pref-200 %) [:A :B :C :D :composite]))
      (is (number? (:composite pref-100)))
      (is (number? (:composite pref-200))))))

;;; ---------------------------------------------------------------------------
;;; Multi-turn smoke
;;; ---------------------------------------------------------------------------

(deftest multi-turn-fixture-produces-per-turn-attribution-blocks-test
  (testing "a multi-turn conversation produces one attribution block per assistant
            turn, each with the version stamp and a prefix_subscores map"
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
                        :terminal-state (if (= i (dec n-turns)) "final_response" "final_response")})))
          out      (attribution-for messages)]
      (is (= n-turns (count out)))
      (doseq [i (range n-turns)]
        (let [a (get out (+ 100 i))]
          (is (some? a))
          (is (= constants/composite-version (:version a)))
          (is (map?    (:prefix_subscores a)))
          (is (vector? (:observables a))))))))
