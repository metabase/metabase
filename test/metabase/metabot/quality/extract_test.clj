(ns metabase.metabot.quality.extract-test
  "Phase 2 unit tests — pure: every test builds a synthetic message
  fixture and asserts on the normalized struct shape. No DB hits."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.quality.extract :as extract]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------
;;; Fixture builders
;;;
;;; Mirror the post-JSON-round-trip shape: `:type` values inside `:data`
;;; parts are strings (e.g. `"tool-input"`), while top-level row keys
;;; like `:role` are keywords (because `mi/transform-keyword` decodes
;;; `metabot_message.role` to a keyword).
;;; ---------------------------------------------------------------------------

(defn- user-row
  ([id text]
   (user-row id text {}))
  ([id text {:keys [user_is_viewing user_recently_viewed mentioned_refs]
             :or   {user_is_viewing      []
                    user_recently_viewed []
                    mentioned_refs       []}}]
   {:id              id
    :role            :user
    :conversation_id "conv"
    :profile_id      "internal"
    :user_id         42
    :created_at      id
    :data            [{:role :user :content text}
                      {:type                 "prompt-context"
                       :user_is_viewing      user_is_viewing
                       :user_recently_viewed user_recently_viewed
                       :mentioned_refs       mentioned_refs}]}))

(defn- assistant-row [id parts]
  {:id              id
   :role            :assistant
   :conversation_id "conv"
   :profile_id      "internal"
   :created_at      id
   :data            (vec parts)})

(defn- text-part [s]
  {:type "text" :text s})

(defn- input-part [call-id function arguments]
  {:type "tool-input" :id call-id :function function :arguments arguments})

(defn- output-part [call-id function entity-usage & {:keys [extra error duration-ms]
                                                     :or   {duration-ms 0}}]
  (cond-> {:type        "tool-output"
           :id          call-id
           :function    function
           :result      {:output            "ok"
                         :structured-output (merge extra
                                                   {:entity-usage entity-usage})}
           :duration-ms duration-ms}
    error (assoc :error error)))

;;; ---------------------------------------------------------------------------
;;; entity-key
;;; ---------------------------------------------------------------------------

(deftest entity-key-coerces-id-to-string-test
  (testing "integer and string ids dedup to the same key"
    (is (= (extract/entity-key {:type "table" :id 5})
           (extract/entity-key {:type "table" :id "5"}))
        "the [type id-str] coercion is the dedup contract every set obeys")))

;;; ---------------------------------------------------------------------------
;;; tool-type-for
;;; ---------------------------------------------------------------------------

(deftest tool-type-for-resolves-registered-tools-test
  (testing "tool-type lookup returns the declared :tool-type metadata"
    (is (= :discovery  (extract/tool-type-for "search")))
    (is (= :authoring  (extract/tool-type-for "create_sql_query")))
    (is (= :authoring  (extract/tool-type-for "construct_notebook_query")))
    (is (= :hybrid     (extract/tool-type-for "read_resource")))
    (is (= :inspection (extract/tool-type-for "list_available_fields")))
    (is (= :inspection (extract/tool-type-for "get_field_values")))
    (is (= :utility    (extract/tool-type-for "todo_write")))
    (is (= :utility    (extract/tool-type-for "ask_for_sql_clarification"))))

  (testing "unknown tool names return nil so callers can skip them safely"
    (is (nil? (extract/tool-type-for "no_such_tool")))))

;;; ---------------------------------------------------------------------------
;;; Conversation metadata
;;; ---------------------------------------------------------------------------

(deftest normalize-extracts-conversation-metadata-test
  (testing "conversation-id / profile-id / user-id are pulled from message rows"
    (let [{:keys [conversation-id profile-id user-id]}
          (extract/normalize [(user-row 1 "hi")
                              (assistant-row 2 [(text-part "hello")])])]
      (is (= "conv" conversation-id))
      (is (= "internal" profile-id))
      (is (= 42 user-id)))))

;;; ---------------------------------------------------------------------------
;;; Tool-event pairing
;;; ---------------------------------------------------------------------------

(deftest normalize-pairs-tool-input-with-tool-output-test
  (testing "tool-input and tool-output parts pair by :id into a single event"
    (let [events (:tool-events
                  (extract/normalize
                   [(user-row 1 "go")
                    (assistant-row 2
                                   [(input-part "c1" "search" {:keyword_queries ["x"]})
                                    (output-part "c1" "search"
                                                 {:input []
                                                  :output [{:type "table" :id 10 :metadata {:rank 0}}]}
                                                 :duration-ms 17)])]))]
      (is (= 1 (count events)))
      (is (= "c1"        (:call-id (first events))))
      (is (= "search"    (:function (first events))))
      (is (= :discovery  (:tool-type (first events))))
      (is (= 17          (:duration-ms (first events))))
      (is (= [{:type "table" :id 10 :metadata {:rank 0}}]
             (:output (first events))))
      (is (= [] (:input (first events))))
      (is (nil? (:error (first events))))
      (is (= 0 (:iteration-index (first events)))))))

(deftest normalize-iteration-index-advances-across-llm-calls-test
  (testing "iteration-index increments on each LLM call within an assistant row"
    (let [events (:tool-events
                  (extract/normalize
                   [(user-row 1 "go")
                    (assistant-row 2
                                   [(input-part "c1" "search" {})
                                    (output-part "c1" "search" {:input [] :output []})
                                    (text-part "considering...")
                                    (input-part "c2" "search" {})
                                    (output-part "c2" "search" {:input [] :output []})])]))]
      (is (= [0 1] (mapv :iteration-index events))
          "two LLM calls separated by tool-output → iter 0, iter 1"))))

(deftest normalize-iteration-index-advances-across-rows-test
  (testing "every new assistant row is a fresh LLM call — iter increments at row boundaries"
    (let [events (:tool-events
                  (extract/normalize
                   [(user-row 1 "first")
                    (assistant-row 2 [(input-part "c1" "search" {})
                                      (output-part "c1" "search" {:input [] :output []})])
                    (user-row 3 "second")
                    (assistant-row 4 [(input-part "c2" "search" {})
                                      (output-part "c2" "search" {:input [] :output []})])]))]
      (is (= [0 1] (mapv :iteration-index events))
          "the second row's tool call is the second LLM call overall"))))

(deftest normalize-orphan-tool-output-warned-and-dropped-test
  (testing "a tool-output with no matching tool-input is dropped, never errors out"
    (let [events (:tool-events
                  (extract/normalize
                   [(user-row 1 "go")
                    (assistant-row 2 [(output-part "ghost" "search" {:input [] :output []})])]))]
      (is (= 0 (count events))))))

;;; ---------------------------------------------------------------------------
;;; CONV_P union
;;; ---------------------------------------------------------------------------

(deftest normalize-unions-prompt-context-channels-test
  (testing "user_is_viewing + user_recently_viewed + mentioned_refs all land in :P"
    (let [{:keys [sets prompt-context]}
          (extract/normalize
           [(user-row 1 "show me"
                      {:user_is_viewing      [{:type "dashboard" :id 7  :name "x"}]
                       :user_recently_viewed [{:type "card"      :id 8  :name "y"}]
                       :mentioned_refs       [{:type "table"     :id 9}]})
            (assistant-row 2 [(text-part "ack")])])]
      (is (= #{["dashboard" "7"] ["card" "8"] ["table" "9"]}
             (set (keys (:P sets)))))
      (is (= [{:type "dashboard" :id 7}
              {:type "card"      :id 8}
              {:type "table"     :id 9}]
             (:P prompt-context))
          "prompt-context surfaces the raw refs in channel order for downstream debugging")))

  (testing "channel provenance is recorded on each :P atom"
    (let [{:keys [sets]} (extract/normalize
                          [(user-row 1 "x"
                                     {:user_is_viewing [{:type "card" :id 7}]
                                      :user_recently_viewed [{:type "card" :id 7}]})
                           (assistant-row 2 [(text-part "ok")])])
          atom-rec       (get-in sets [:P ["card" "7"]])]
      (is (= [{:set :P :call-id nil :iteration 0 :metadata {:channel :user_is_viewing}}
              {:set :P :call-id nil :iteration 0 :metadata {:channel :user_recently_viewed}}]
             (:provenance atom-rec))
          "two channels surfaced the same card → two provenance entries on one atom"))))

(deftest normalize-filters-unknown-entity-types-from-prompt-context-test
  (testing "prompt-context items whose :type is not in entity-types/closed-enum are dropped"
    (let [{:keys [sets]} (extract/normalize
                          [(user-row 1 "x"
                                     {:user_is_viewing [{:type "adhoc" :id "draft-1"}
                                                        {:type "table" :id 5}]})
                           (assistant-row 2 [(text-part "ok")])])]
      (is (= #{["table" "5"]} (set (keys (:P sets))))
          "'adhoc' isn't an entity-types/closed-enum type — dropped"))))

;;; ---------------------------------------------------------------------------
;;; Set construction across tool-types
;;; ---------------------------------------------------------------------------

(deftest normalize-discovery-outputs-go-to-D-test
  (let [{:keys [sets]} (extract/normalize
                        [(user-row 1 "go")
                         (assistant-row 2
                                        [(input-part "c1" "search" {})
                                         (output-part "c1" "search"
                                                      {:input  []
                                                       :output [{:type "table" :id 10 :metadata {:rank 0}}
                                                                {:type "model" :id 20 :metadata {:rank 1}}]})])])]
    (is (= #{["table" "10"] ["model" "20"]} (set (keys (:D sets)))))))

(deftest normalize-authoring-inputs-go-to-Q-and-filter-databases-test
  (testing "authoring tool's :input refs land in :Q with database refs filtered out"
    (let [{:keys [sets]} (extract/normalize
                          [(user-row 1 "go")
                           (assistant-row 2
                                          [(input-part "c1" "create_sql_query" {:database_id 1 :sql_query "x"})
                                           (output-part "c1" "create_sql_query"
                                                        {:input  [{:type "database" :id 1}
                                                                  {:type "table"    :id 10}]
                                                         :output []})])])]
      (is (= #{["table" "10"]} (set (keys (:Q sets))))
          "database ref dropped; table ref kept"))))

(deftest normalize-inspection-inputs-go-to-I-test
  (let [{:keys [sets]} (extract/normalize
                        [(user-row 1 "go")
                         (assistant-row 2
                                        [(input-part "c1" "list_available_fields"
                                                     {:table_id 10})
                                         (output-part "c1" "list_available_fields"
                                                      {:input  [{:type "table" :id 10}]
                                                       :output [{:type "field" :id 100}]})])])]
    (is (= #{["table" "10"]} (set (keys (:I sets))))
        ":inspection input lands in :I (and not in :Q or :D)")
    (is (= #{} (set (keys (:Q sets))))
        "inspection inputs do not pollute :Q")
    (is (= #{} (set (keys (:D sets))))
        "inspection outputs are not discovery surfacings")))

(deftest normalize-hybrid-inputs-to-I-outputs-to-D-test
  (testing "read_resource is :hybrid — its :input goes to :I, :output to :D"
    (let [{:keys [sets]} (extract/normalize
                          [(user-row 1 "go")
                           (assistant-row 2
                                          [(input-part "c1" "read_resource" {:uris ["metabase://table/10"]})
                                           (output-part "c1" "read_resource"
                                                        {:input  [{:type "table" :id 10}]
                                                         :output [{:type "field" :id 100}]})])])]
      (is (= #{["table" "10"]}  (set (keys (:I sets)))))
      (is (= #{["field" "100"]} (set (keys (:D sets))))))))

(deftest normalize-utility-tools-do-not-populate-sets-test
  (testing ":utility tools (e.g. todo_write) emit no entity-usage and contribute nothing"
    (let [{:keys [sets tool-events]}
          (extract/normalize
           [(user-row 1 "go")
            (assistant-row 2
                           [(input-part "c1" "todo_write" {:todos []})
                            (output-part "c1" "todo_write" {:input [] :output []})])])]
      (is (= 1 (count tool-events))
          "we still record the call, but with empty :input/:output")
      (is (= [] (:input  (first tool-events))))
      (is (= [] (:output (first tool-events))))
      (is (every? empty? (vals (select-keys sets [:D :Q :I :H])))))))

;;; ---------------------------------------------------------------------------
;;; CONV_H derivation
;;; ---------------------------------------------------------------------------

(deftest normalize-derives-CONV_H-from-Q-minus-P-union-D-test
  (testing "an authoring ref not in P and not in D → CONV_H"
    (let [{:keys [sets]} (extract/normalize
                          [(user-row 1 "x")
                           (assistant-row 2
                                          [(input-part "c1" "create_sql_query" {:database_id 1 :sql_query "..."})
                                           (output-part "c1" "create_sql_query"
                                                        {:input  [{:type "database" :id 1}
                                                                  {:type "table"    :id 999}]
                                                         :output []})])])]
      (is (= #{["table" "999"]} (set (keys (:H sets)))))
      (is (= "table" (:type (get-in sets [:H ["table" "999"]]))))
      (is (= 999     (:id   (get-in sets [:H ["table" "999"]]))))))

  (testing "a Q ref that's also in D is grounded → not in H"
    (let [{:keys [sets]} (extract/normalize
                          [(user-row 1 "x")
                           (assistant-row 2
                                          [(input-part "c1" "search" {})
                                           (output-part "c1" "search"
                                                        {:input  []
                                                         :output [{:type "table" :id 7 :metadata {:rank 0}}]})
                                           (text-part "found it")
                                           (input-part "c2" "create_sql_query" {:database_id 1 :sql_query "..."})
                                           (output-part "c2" "create_sql_query"
                                                        {:input  [{:type "database" :id 1}
                                                                  {:type "table"    :id 7}]
                                                         :output []})])])]
      (is (= #{["table" "7"]} (set (keys (:Q sets)))))
      (is (= #{}              (set (keys (:H sets))))
          "ground-via-D removes the ref from CONV_H")))

  (testing "a Q ref that's also in P is grounded → not in H"
    (let [{:keys [sets]} (extract/normalize
                          [(user-row 1 "look at this"
                                     {:user_is_viewing [{:type "table" :id 5}]})
                           (assistant-row 2
                                          [(input-part "c1" "create_sql_query" {:database_id 1 :sql_query "..."})
                                           (output-part "c1" "create_sql_query"
                                                        {:input  [{:type "database" :id 1}
                                                                  {:type "table"    :id 5}]
                                                         :output []})])])]
      (is (= #{["table" "5"]} (set (keys (:Q sets)))))
      (is (= #{}              (set (keys (:H sets))))
          "ground-via-P removes the ref from CONV_H"))))

;;; ---------------------------------------------------------------------------
;;; Atom record structure
;;; ---------------------------------------------------------------------------

(deftest normalize-atom-records-carry-provenance-and-t-first-seen-test
  (testing "provenance entries describe the source set + iteration + metadata"
    (let [{:keys [sets]} (extract/normalize
                          [(user-row 1 "x")
                           (assistant-row 2
                                          [(input-part "c1" "search" {})
                                           (output-part "c1" "search"
                                                        {:input  []
                                                         :output [{:type "table" :id 10 :metadata {:rank 0}}]})
                                           (text-part "consider")
                                           (input-part "c2" "search" {})
                                           (output-part "c2" "search"
                                                        {:input  []
                                                         :output [{:type "table" :id 10 :metadata {:rank 2}}]})])])
          atom-rec       (get-in sets [:D ["table" "10"]])]
      (is (= "table" (:type atom-rec)))
      (is (= 10 (:id atom-rec)))
      (is (= "10" (:id-str atom-rec)))
      (is (= 0 (:t-first-seen atom-rec))
          "first surfaced at iteration 0, even though it re-appeared at iter 1")
      (is (= 2 (count (:provenance atom-rec)))
          "two surfacings = two provenance entries"))))

(deftest normalize-mixed-int-and-string-id-dedup-test
  (testing "{:id 5} and {:id \"5\"} dedup to the same atom-record"
    (let [{:keys [sets]} (extract/normalize
                          [(user-row 1 "x"
                                     {:user_is_viewing [{:type "table" :id 5}]})
                           (assistant-row 2
                                          [(input-part "c1" "create_sql_query" {:database_id 1 :sql_query "..."})
                                           (output-part "c1" "create_sql_query"
                                                        {:input  [{:type "database" :id 1}
                                                                  {:type "table"    :id "5"}]
                                                         :output []})])])]
      (is (= #{["table" "5"]} (set (keys (:P sets)))))
      (is (= #{["table" "5"]} (set (keys (:Q sets)))))
      (is (= #{}              (set (keys (:H sets))))))))

;;; ---------------------------------------------------------------------------
;;; Pre-foundation (no entity-usage anywhere) — still safe to normalize
;;; ---------------------------------------------------------------------------

(deftest normalize-pre-foundation-conversation-test
  (testing "rows missing entity-usage and prompt-context still normalize to empty sets"
    (let [{:keys [sets tool-events]}
          (extract/normalize
           ;; deliberately omit the prompt-context block & entity-usage —
           ;; mirrors a pre-BOT-1569 conversation row
           [{:id 1 :role :user :conversation_id "c" :profile_id "internal" :user_id 1 :created_at 1
             :data [{:role :user :content "hi"}]}
            {:id 2 :role :assistant :conversation_id "c" :profile_id "internal" :created_at 1
             :data [(text-part "hello")]}])]
      (is (empty? tool-events))
      (is (every? empty? (vals sets))
          "all five sets empty when there's no entity activity"))))

;;; ---------------------------------------------------------------------------
;;; Representative profile-shaped fixtures
;;; ---------------------------------------------------------------------------

(deftest normalize-internal-profile-flow-test
  (testing "internal-profile shape — search → construct → chart → ground via D"
    (let [{:keys [sets tool-events]}
          (extract/normalize
           [(user-row 1 "show orders" {:user_recently_viewed [{:type "dashboard" :id 1}]})
            (assistant-row 2
                           [(input-part "c1" "search" {:keyword_queries ["orders"]})
                            (output-part "c1" "search"
                                         {:input  []
                                          :output [{:type "table" :id 100 :metadata {:rank 0}}]})
                            (input-part "c2" "construct_notebook_query"
                                        {:tables [{:table_id 100}]})
                            (output-part "c2" "construct_notebook_query"
                                         {:input  [{:type "table" :id 100}]
                                          :output []})
                            (input-part "c3" "create_chart" {:query_id "q1"})
                            (output-part "c3" "create_chart"
                                         {:input  []
                                          :output []})])])]
      (is (= [:discovery :authoring :authoring]
             (mapv :tool-type tool-events)))
      (is (= #{["dashboard" "1"]} (set (keys (:P sets)))))
      (is (= #{["table" "100"]}   (set (keys (:D sets)))))
      (is (= #{["table" "100"]}   (set (keys (:Q sets)))))
      (is (= #{}                  (set (keys (:H sets))))
          "no hallucinated refs in this flow"))))

(deftest normalize-sql-profile-with-clarification-flow-test
  (testing "sql-profile shape — sql_search → create_sql_query → edit_sql_query → ask_for_sql_clarification"
    (let [{:keys [sets tool-events]}
          (extract/normalize
           [(user-row 1 "broken query, please fix")
            (assistant-row 2
                           [(input-part "c1" "search" {})  ; sql_search registers under "search"
                            (output-part "c1" "search"
                                         {:input  []
                                          :output [{:type "table" :id 33 :metadata {:rank 0}}]})
                            (input-part "c2" "create_sql_query" {:database_id 1 :sql_query "..."})
                            (output-part "c2" "create_sql_query"
                                         {:input  [{:type "database" :id 1}
                                                   {:type "table"    :id 33}]
                                          :output []})
                            (input-part "c3" "edit_sql_query" {:query_id "q" :sql_query "..."})
                            (output-part "c3" "edit_sql_query"
                                         {:input  [{:type "database" :id 1}
                                                   {:type "table"    :id 33}]
                                          :output []})
                            (input-part "c4" "ask_for_sql_clarification" {:message "ok"})
                            (output-part "c4" "ask_for_sql_clarification" {:input [] :output []})])])]
      (is (= [:discovery :authoring :authoring :utility]
             (mapv :tool-type tool-events)))
      (is (= #{["table" "33"]} (set (keys (:Q sets)))))
      (is (= #{} (set (keys (:H sets)))) "table-33 was grounded via D"))))

(deftest normalize-transforms-codegen-flow-test
  (testing "transforms_codegen-profile shape — transform_search → details → fields → write"
    (let [{:keys [sets tool-events]}
          (extract/normalize
           [(user-row 1 "build a python transform")
            (assistant-row 2
                           [(input-part "c1" "search" {})  ; transform_search registers under "search"
                            (output-part "c1" "search"
                                         {:input  []
                                          :output [{:type "transform" :id 5 :metadata {:rank 0}}]})
                            (input-part "c2" "get_transform_details" {:transform_id 5})
                            (output-part "c2" "get_transform_details"
                                         {:input  [{:type "transform" :id 5}]
                                          :output []})
                            (input-part "c3" "list_available_fields" {:table_id 10})
                            (output-part "c3" "list_available_fields"
                                         {:input  [{:type "table" :id 10}]
                                          :output [{:type "field" :id 100}]})
                            (input-part "c4" "write_transform_python" {:source "df"})
                            (output-part "c4" "write_transform_python"
                                         {:input  [{:type "transform" :id 5}]
                                          :output []})])])]
      (is (= [:discovery :inspection :inspection :authoring]
             (mapv :tool-type tool-events)))
      (is (= #{["transform" "5"]}              (set (keys (:D sets)))))
      (is (= #{["transform" "5"] ["table" "10"]} (set (keys (:I sets)))))
      (is (= #{["transform" "5"]}              (set (keys (:Q sets))))
          "the write_transform_python input is the transform itself")
      (is (= #{} (set (keys (:H sets))))))))

(deftest normalize-structural-overlap-field-in-Q-table-in-D-test
  (testing "field in CONV_Q is not grounded by its parent table in CONV_D (entities are independent)"
    (let [{:keys [sets]}
          (extract/normalize
           [(user-row 1 "use that field")
            (assistant-row 2
                           [(input-part "c1" "search" {})
                            (output-part "c1" "search"
                                         {:input  []
                                          :output [{:type "table" :id 10 :metadata {:rank 0}}]})
                            (input-part "c2" "construct_notebook_query" {})
                            (output-part "c2" "construct_notebook_query"
                                         {:input  [{:type "field" :id 100}]
                                          :output []})])])]
      (is (= #{["table" "10"]}  (set (keys (:D sets)))))
      (is (= #{["field" "100"]} (set (keys (:Q sets)))))
      (is (= #{["field" "100"]} (set (keys (:H sets))))
          "the field wasn't surfaced — only its parent table was. Field lands in H."))))
