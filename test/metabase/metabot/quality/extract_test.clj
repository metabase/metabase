(ns metabase.metabot.quality.extract-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.quality.extract :as extract])
  (:import
   (java.time Instant)))

(set! *warn-on-reflection* true)

;; ---------------------------------------------------------------------------
;; Fixture helpers
;; ---------------------------------------------------------------------------

(defn- ts
  "Build a deterministic timestamp `nseconds` past the epoch."
  ^Instant [nseconds]
  (Instant/ofEpochSecond (long nseconds)))

(defn- tool-input
  "Build a `:tool-input` part. `key-style` controls whether `:type` is rendered
  as a keyword (in-memory) or a string (post-JSON-roundtrip) so tests cover both."
  ([fn-name] (tool-input fn-name {} "id"))
  ([fn-name args id] (tool-input fn-name args id :keyword))
  ([fn-name args id key-style]
   (case key-style
     :keyword {:type :tool-input  :function fn-name :arguments args :id id}
     :string  {:type "tool-input" :function fn-name :arguments args :id id})))

(defn- tool-output
  ([id] (tool-output id {:output "ok"} nil))
  ([id result] (tool-output id result nil))
  ([id result error]
   (cond-> {:type :tool-output :id id :result result}
     (some? error) (assoc :error error))))

(defn- text [s] {:type :text :text s})

(defn- user-msg [id created-at content]
  {:id id :role :user :created_at created-at :profile_id "internal"
   :data [{:role "user" :content content}]
   :finished true :total_tokens 0})

(defn- assistant-msg
  ([id created-at parts]
   (assistant-msg id created-at parts "internal"))
  ([id created-at parts profile-id]
   {:id id :role :assistant :created_at created-at :profile_id profile-id
    :data parts :finished true :total_tokens 100}))

;; ---------------------------------------------------------------------------
;; iter-count — direct via normalize → :messages
;; ---------------------------------------------------------------------------

(defn- iter-count-of
  "Run `normalize` on a single assistant message containing `parts` and pull
  the computed `:iter-count` back out."
  [parts]
  (-> [(assistant-msg 1 (ts 1) parts)]
      extract/normalize
      :messages
      first
      :iter-count))

(deftest iter-count-empty-test
  (testing "zero LLM groups when parts vector is empty"
    (is (= 0 (iter-count-of [])))))

(deftest iter-count-one-text-group-test
  (testing "one text part = one LLM group"
    (is (= 1 (iter-count-of [(text "hi")])))))

(deftest iter-count-consecutive-llm-parts-collapse-test
  (testing "text + tool-input back-to-back form one LLM group"
    (is (= 1 (iter-count-of [(text "thinking") (tool-input "search")])))))

(deftest iter-count-three-llm-groups-test
  (testing "two non-LLM separators split into three groups"
    (is (= 3 (iter-count-of [(text "iter 1") (tool-input "search" {} "a")
                             (tool-output "a")
                             (text "iter 2") (tool-input "list_available_fields" {} "b")
                             (tool-output "b")
                             (text "iter 3")])))))

(deftest iter-count-leading-non-llm-test
  (testing "leading tool-output (defensive case) does not count as a group"
    (is (= 1 (iter-count-of [(tool-output "x") (text "after")])))))

(deftest iter-count-string-type-test
  (testing "string :type values are recognized identically to keyword :type"
    (is (= 2 (iter-count-of [(tool-input "search" {} "a" :string)
                             (tool-output "a")
                             (tool-input "search" {} "b" :string)])))))

;; ---------------------------------------------------------------------------
;; User-turn windows — PR-74056 :id tiebreak on identical created_at
;; ---------------------------------------------------------------------------

(deftest user-turn-windows-test
  (testing "one window per user row, half-open [start, end) bounds"
    (let [;; Two user prompts; the second user row and the first assistant row
          ;; share `created_at=2` — `:id` is the tiebreaker.
          messages [(user-msg 10 (ts 1) "prompt 1")
                    (assistant-msg 11 (ts 1) [(text "answer 1")])
                    (user-msg 20 (ts 2) "prompt 2")
                    (assistant-msg 21 (ts 2) [(text "answer 2")])]
          {:keys [user-turn-windows]} (extract/normalize messages)]
      (is (= 2 (count user-turn-windows)))
      (is (= [{:user-msg-id 10 :start [(ts 1) 10] :end [(ts 2) 20]}
              {:user-msg-id 20 :start [(ts 2) 20] :end nil}]
             user-turn-windows)))))

(deftest user-turn-windows-id-tiebreak-test
  (testing "user and assistant rows that share `created_at` sort by :id"
    (let [messages [;; Submitted out of order to ensure sort happens
                    (assistant-msg 11 (ts 1) [(text "")])
                    (user-msg 10 (ts 1) "prompt 1")]
          {:keys [messages user-turn-windows]} (extract/normalize messages)]
      (testing "messages re-sorted by [created_at id]"
        (is (= [10 11] (mapv :id messages))))
      (testing "user window starts at the user row's [ts id]"
        (is (= [{:user-msg-id 10 :start [(ts 1) 10] :end nil}]
               user-turn-windows))))))

;; ---------------------------------------------------------------------------
;; Card template regex
;; ---------------------------------------------------------------------------

(defn- author-refs-of
  "Convenience: harvest author-refs from a single create_sql_query call with `sql`."
  [sql]
  (-> [(assistant-msg 1 (ts 1)
                      [(tool-input "create_sql_query"
                                   {:database_id 1 :sql_query sql} "a")
                       (tool-output "a")])]
      extract/normalize
      :entity-refs
      :author-refs))

(deftest card-template-empty-sql-test
  (testing "empty SQL string yields no card refs"
    (is (= [] (author-refs-of "")))))

(deftest card-template-no-card-refs-test
  (testing "SQL with no template markers yields no refs"
    (is (= [] (author-refs-of "SELECT 1 FROM dual")))))

(deftest card-template-single-ref-test
  (testing "one {{#N}} → one card ref with id=N"
    (let [refs (author-refs-of "SELECT * FROM {{#42}}")]
      (is (= 1 (count refs)))
      (is (= {:ref-type :card :ref-id 42} (select-keys (first refs) [:ref-type :ref-id]))))))

(deftest card-template-multiple-refs-test
  (testing "multiple {{#N}} refs in one string yield refs in source order"
    (let [refs (author-refs-of "SELECT a FROM {{#1}} JOIN {{#22}} JOIN {{#333}}")]
      (is (= [{:ref-type :card :ref-id 1}
              {:ref-type :card :ref-id 22}
              {:ref-type :card :ref-id 333}]
             (mapv #(select-keys % [:ref-type :ref-id]) refs))))))

;; ---------------------------------------------------------------------------
;; Author-ref harvest — one example per AUTHORING tool
;; ---------------------------------------------------------------------------

(defn- author-refs-from-message
  [parts]
  (-> [(assistant-msg 1 (ts 1) parts)]
      extract/normalize
      :entity-refs
      :author-refs
      (->> (mapv #(select-keys % [:ref-type :ref-id])))))

(deftest author-refs-construct-notebook-query-test
  (testing "construct_notebook_query: source_entity + referenced_entities"
    (is (= [{:ref-type :table :ref-id 10}
            {:ref-type :model :ref-id 20}
            {:ref-type :metric :ref-id 30}]
           (author-refs-from-message
            [(tool-input "construct_notebook_query"
                         {:source_entity {:type "table" :id 10}
                          :referenced_entities [{:type "model" :id 20}
                                                {:type "metric" :id 30}]
                          :program {:source {:type "table" :id 10}
                                    :operations []}} "a")
             (tool-output "a")])))))

(deftest author-refs-create-sql-query-test
  (testing "create_sql_query: {{#N}} in sql_query"
    (is (= [{:ref-type :card :ref-id 7}]
           (author-refs-from-message
            [(tool-input "create_sql_query"
                         {:database_id 1 :sql_query "SELECT * FROM {{#7}}"} "a")
             (tool-output "a")])))))

(deftest author-refs-edit-sql-query-test
  (testing "edit_sql_query: {{#N}} in each :edits[*].new_string"
    (is (= [{:ref-type :card :ref-id 11}
            {:ref-type :card :ref-id 22}]
           (author-refs-from-message
            [(tool-input "edit_sql_query"
                         {:query_id "q1"
                          :checklist "c"
                          :edits [{:old_string "a" :new_string "FROM {{#11}}"}
                                  {:old_string "b" :new_string "JOIN {{#22}}"}]} "a")
             (tool-output "a")])))))

(deftest author-refs-replace-sql-query-test
  (testing "replace_sql_query: {{#N}} in :new_query"
    (is (= [{:ref-type :card :ref-id 99}]
           (author-refs-from-message
            [(tool-input "replace_sql_query"
                         {:query_id "q1" :checklist "c"
                          :new_query "SELECT * FROM {{#99}}"} "a")
             (tool-output "a")])))))

(deftest author-refs-write-transform-sql-test
  (testing "write_transform_sql: :source_tables + edit_action edits/new_content"
    (let [refs (author-refs-from-message
                [(tool-input "write_transform_sql"
                             {:source_tables [{:type "table" :id 5}
                                              {:type "model" :id 6}]
                              :edit_action {:mode "edit"
                                            :edits [{:old_string "x"
                                                     :new_string "FROM {{#100}}"}]
                                            :new_content "SELECT * FROM {{#200}}"}}
                             "a")
                 (tool-output "a")])]
      (is (= #{{:ref-type :table :ref-id 5}
               {:ref-type :model :ref-id 6}
               {:ref-type :card :ref-id 100}
               {:ref-type :card :ref-id 200}}
             (set refs))))))

(deftest author-refs-write-transform-python-test
  (testing "write_transform_python: {{#N}} in edit_action edits/new_content (no source_tables)"
    (is (= [{:ref-type :card :ref-id 555}]
           (author-refs-from-message
            [(tool-input "write_transform_python"
                         {:edit_action {:mode "replace"
                                        :new_content "df = pd.read_sql('SELECT * FROM {{#555}}')"}}
                         "a")
             (tool-output "a")])))))

(deftest author-refs-document-construct-sql-chart-test
  (testing "document_construct_sql_chart: {{#N}} in :sql"
    (is (= [{:ref-type :card :ref-id 1234}]
           (author-refs-from-message
            [(tool-input "document_construct_sql_chart"
                         {:database_id 1 :name "n" :description "d"
                          :analysis "a" :approach "ap"
                          :sql "SELECT * FROM {{#1234}}"
                          :viz_settings {:chart_type "bar"}} "a")
             (tool-output "a")])))))

(deftest author-refs-document-construct-model-chart-test
  (testing "document_construct_model_chart: :source_entity"
    (is (= [{:ref-type :model :ref-id 77}]
           (author-refs-from-message
            [(tool-input "document_construct_model_chart"
                         {:name "n" :description "d"
                          :source_entity {:type "model" :id 77}
                          :program {} :viz_settings {:chart_type "bar"}} "a")
             (tool-output "a")])))))

(deftest author-refs-non-authoring-tool-ignored-test
  (testing "search and navigate_user calls do not produce author-refs"
    (is (= []
           (author-refs-from-message
            [(tool-input "search" {} "a")    (tool-output "a")
             (tool-input "navigate_user"
                         {:destination {:entity_type "table" :entity_id 1}} "b")
             (tool-output "b")])))))

;; ---------------------------------------------------------------------------
;; Inspect-ref harvest
;; ---------------------------------------------------------------------------

(defn- inspect-refs-from-message
  [parts]
  (-> [(assistant-msg 1 (ts 1) parts)]
      extract/normalize
      :entity-refs
      :inspect-refs
      (->> (mapv #(select-keys % [:ref-type :ref-id])))))

(deftest inspect-refs-read-resource-test
  (testing "read_resource: parse metabase://<type>/<id> URIs"
    (is (= [{:ref-type :table :ref-id 5}
            {:ref-type :model :ref-id 12}
            {:ref-type :metric :ref-id 33}]
           (inspect-refs-from-message
            [(tool-input "read_resource"
                         {:uris ["metabase://table/5/fields"
                                 "metabase://model/12"
                                 "metabase://metric/33/dimensions/x"]} "a")
             (tool-output "a")])))))

(deftest inspect-refs-list-available-fields-test
  (testing "list_available_fields: refs across the three id lists"
    (is (= #{{:ref-type :table :ref-id 1}
             {:ref-type :table :ref-id 2}
             {:ref-type :model :ref-id 10}
             {:ref-type :metric :ref-id 100}}
           (set (inspect-refs-from-message
                 [(tool-input "list_available_fields"
                              {:table_ids [1 2]
                               :model_ids [10]
                               :metric_ids [100]} "a")
                  (tool-output "a")]))))))

(deftest inspect-refs-get-field-values-test
  (testing "get_field_values: :data_source becomes :ref-type"
    (is (= [{:ref-type :model :ref-id 9}]
           (inspect-refs-from-message
            [(tool-input "get_field_values"
                         {:data_source "model" :source_id 9 :field_id 1} "a")
             (tool-output "a")])))))

;; ---------------------------------------------------------------------------
;; Navigate-ref harvest
;; ---------------------------------------------------------------------------

(deftest navigate-refs-entity-destination-test
  (testing "navigate_user with entity destination yields a ref"
    (is (= [{:ref-type :dashboard :ref-id 7}]
           (-> [(assistant-msg 1 (ts 1)
                               [(tool-input "navigate_user"
                                            {:destination {:entity_type "dashboard"
                                                           :entity_id 7}} "a")
                                (tool-output "a")])]
               extract/normalize
               :entity-refs
               :navigate-refs
               (->> (mapv #(select-keys % [:ref-type :ref-id]))))))))

(deftest navigate-refs-page-destination-test
  (testing "navigate_user with page destination yields no refs (no entity)"
    (is (= []
           (-> [(assistant-msg 1 (ts 1)
                               [(tool-input "navigate_user"
                                            {:destination {:page "notebook_editor"}} "a")
                                (tool-output "a")])]
               extract/normalize
               :entity-refs
               :navigate-refs)))))

;; ---------------------------------------------------------------------------
;; Search-hit harvest (search tool :structured-output survives persistence)
;; ---------------------------------------------------------------------------

(deftest search-hits-test
  (testing "search hits harvested from :result.structured-output.data when present"
    (let [hits (-> [(assistant-msg 1 (ts 1)
                                   [(tool-input "search"
                                                {:keyword_queries ["sales"]} "a")
                                    (tool-output "a"
                                                 {:output "..."
                                                  :structured-output
                                                  {:result-type :search
                                                   :data [{:model "table" :id 1 :name "Orders"}
                                                          {:model "model" :id 2 :name "Customer LTV"}]
                                                   :total_count 2}})])]
                   extract/normalize
                   :entity-refs
                   :search-hits)]
      (is (= [{:ref-type :table :ref-id 1}
              {:ref-type :model :ref-id 2}]
             (mapv #(select-keys % [:ref-type :ref-id]) hits)))
      (testing "the source entity payload is preserved on the ref"
        (is (= "Orders" (get-in (first hits) [:entity :name])))))))

(deftest search-hits-from-persisted-shape-test
  (testing "search-tool :structured-output bypasses strip-tool-output-bloat, so the persisted shape still yields :search-hits"
    ;; Mirrors the post-`strip-tool-output-bloat` shape for a search call:
    ;; `:result-type :search` results pass through untouched, so the entity
    ;; payload under `:data` is fully recoverable from the appdb.
    (let [hits (-> [(assistant-msg 1 (ts 1)
                                   [(tool-input "search" {} "a")
                                    (tool-output "a"
                                                 {:output "formatted text"
                                                  :structured-output
                                                  {:result-type :search
                                                   :data [{:model "table" :id 7 :name "Products"}]
                                                   :total_count 1}})])]
                   extract/normalize
                   :entity-refs
                   :search-hits)]
      (is (= [{:ref-type :table :ref-id 7}]
             (mapv #(select-keys % [:ref-type :ref-id]) hits)))
      (is (= "Products" (get-in (first hits) [:entity :name]))))))

;; ---------------------------------------------------------------------------
;; Tool-output pairing & sibling errors
;; ---------------------------------------------------------------------------

(deftest tool-output-error-decoded-test
  (testing "tool-output sibling :error is preserved on the paired tool-call"
    (let [{:keys [tool-events]}
          (extract/normalize
           [(assistant-msg 1 (ts 1)
                           [(tool-input "create_sql_query"
                                        {:database_id 1 :sql_query "..."} "a")
                            {:type :tool-output :id "a" :result nil
                             :error {:type "exception" :message "boom"}}])])]
      (is (= 1 (count tool-events)))
      (is (= {:type "exception" :message "boom"}
             (:output-error (first tool-events)))))))

(deftest tool-input-without-output-test
  (testing "an unpaired tool-input still emits an event with nil result/error"
    (let [{:keys [tool-events]}
          (extract/normalize
           [(assistant-msg 1 (ts 1) [(tool-input "search" {} "a")])])]
      (is (= 1 (count tool-events)))
      (is (nil? (:result (first tool-events))))
      (is (nil? (:output-error (first tool-events)))))))

;; ---------------------------------------------------------------------------
;; Modal profile id
;; ---------------------------------------------------------------------------

(deftest modal-profile-id-test
  (testing "modal profile id picks the most-common; tiebreak by profile-id asc"
    (let [{:keys [profile-id]} (extract/normalize
                                [(assistant-msg 1 (ts 1) [(text "")] "internal")
                                 (assistant-msg 2 (ts 2) [(text "")] "internal")
                                 (assistant-msg 3 (ts 3) [(text "")] "sql")])]
      (is (= "internal" profile-id))))
  (testing "tie → alphabetically-smallest profile id wins"
    (let [{:keys [profile-id]} (extract/normalize
                                [(assistant-msg 1 (ts 1) [(text "")] "sql")
                                 (assistant-msg 2 (ts 2) [(text "")] "internal")])]
      (is (= "internal" profile-id)))))

(deftest modal-profile-nil-when-no-profile-ids-test
  (testing "nil when no messages carry a profile id"
    (let [{:keys [profile-id]} (extract/normalize
                                [(assoc (user-msg 1 (ts 1) "p") :profile_id nil)])]
      (is (nil? profile-id)))))

;; ---------------------------------------------------------------------------
;; Row-level :error decoding
;; ---------------------------------------------------------------------------

(deftest row-error-json-decoded-test
  (testing "metabot_message.error stored as JSON string is decoded into a map"
    (let [{:keys [messages]} (extract/normalize
                              [(assoc (assistant-msg 1 (ts 1) [])
                                      :error "{\"type\":\"E\",\"message\":\"boom\"}")])]
      (is (= {:type "E" :message "boom"} (:error (first messages)))))))

(deftest row-error-already-decoded-passthrough-test
  (testing "an already-decoded :error map is preserved unchanged"
    (let [{:keys [messages]} (extract/normalize
                              [(assoc (assistant-msg 1 (ts 1) [])
                                      :error {:type "E" :message "boom"})])]
      (is (= {:type "E" :message "boom"} (:error (first messages)))))))

;; ---------------------------------------------------------------------------
;; Tool-events conversation-ordering
;; ---------------------------------------------------------------------------

(deftest tool-events-ordered-test
  (testing "tool-events flatten across assistant rows in conversation order"
    (let [messages [(assistant-msg 11 (ts 1)
                                   [(tool-input "search" {} "a")  (tool-output "a")
                                    (tool-input "search" {} "b")  (tool-output "b")])
                    (assistant-msg 12 (ts 2)
                                   [(tool-input "create_sql_query" {} "c")
                                    (tool-output "c")])]
          events (-> messages extract/normalize :tool-events)]
      (is (= ["search" "search" "create_sql_query"] (mapv :function events)))
      (is (= [11 11 12] (mapv :assistant-msg-id events)))
      (is (= [[(ts 1) 11 0] [(ts 1) 11 2] [(ts 2) 12 0]]
             (mapv :order-key events))))))
