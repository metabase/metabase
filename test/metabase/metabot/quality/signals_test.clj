(ns metabase.metabot.quality.signals-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.quality.extract :as extract]
   [metabase.metabot.quality.signals :as signals])
  (:import
   (java.time Instant)))

(set! *warn-on-reflection* true)

;; ---------------------------------------------------------------------------
;; Fixture helpers (mirrors extract-test patterns)
;; ---------------------------------------------------------------------------

(defn- ts ^Instant [nseconds] (Instant/ofEpochSecond (long nseconds)))

(defn- tool-input
  ([fn-name] (tool-input fn-name {} (str "id-" (random-uuid))))
  ([fn-name args id] {:type :tool-input :function fn-name :arguments args :id id}))

(defn- tool-output
  ([id] (tool-output id {:output "ok"}))
  ([id result] {:type :tool-output :id id :result result}))

(defn- search-output
  "Tool-output for a search call with the given entity hits."
  [id entities]
  (tool-output id {:output "..."
                   :structured-output {:result-type :search
                                       :data        entities
                                       :total_count (count entities)}}))

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

(defn- normalize [messages] (extract/normalize messages))

;; ---------------------------------------------------------------------------
;; Family 1, Signal 1 — canonical-bypass
;; ---------------------------------------------------------------------------

(deftest canonical-bypass-zero-when-no-canonical-visible-test
  (testing "no canonical search hit → magnitude 0 even when author refs are non-canonical"
    (let [normalized (normalize
                      [(user-msg 1 (ts 1))
                       (assistant-msg 2 (ts 2)
                                      [(tool-input "search" {} "s1")
                                       (search-output "s1" [{:model "table" :id 10 :name "Orders"}])
                                       (tool-input "create_sql_query"
                                                   {:database_id 1 :sql_query "SELECT * FROM {{#99}}"}
                                                   "c1")
                                       (tool-output "c1")])])
          canon-map  {[:table 10] :non-canonical
                      [:card  99] :non-canonical}]
      (is (= 0 (signals/canonical-bypass-magnitude normalized canon-map))))))

(deftest canonical-bypass-one-event-test
  (testing "1 canonical hit + 1 later non-canonical author → magnitude 1"
    (let [normalized (normalize
                      [(user-msg 1 (ts 1))
                       (assistant-msg 2 (ts 2)
                                      [(tool-input "search" {} "s1")
                                       (search-output "s1" [{:model "table" :id 10 :name "GovTbl"}
                                                            {:model "table" :id 20 :name "Sandbox"}])
                                       (tool-input "construct_notebook_query"
                                                   {:source_entity {:type "table" :id 20}
                                                    :referenced_entities []}
                                                   "c1")
                                       (tool-output "c1")])])
          canon-map  {[:table 10] :canonical
                      [:table 20] :non-canonical}]
      (is (= 1 (signals/canonical-bypass-magnitude normalized canon-map))))))

(deftest canonical-bypass-three-events-test
  (testing "1 canonical hit + 3 subsequent non-canonical authors → magnitude 3"
    (let [normalized (normalize
                      [(user-msg 1 (ts 1))
                       (assistant-msg 2 (ts 2)
                                      [(tool-input "search" {} "s1")
                                       (search-output "s1" [{:model "table" :id 10}])
                                       (tool-input "create_sql_query"
                                                   {:database_id 1 :sql_query "SELECT * FROM {{#101}}"}
                                                   "c1")
                                       (tool-output "c1")
                                       (tool-input "create_sql_query"
                                                   {:database_id 1 :sql_query "SELECT * FROM {{#102}}"}
                                                   "c2")
                                       (tool-output "c2")
                                       (tool-input "create_sql_query"
                                                   {:database_id 1 :sql_query "SELECT * FROM {{#103}}"}
                                                   "c3")
                                       (tool-output "c3")])])
          canon-map  {[:table 10] :canonical
                      [:card 101] :non-canonical
                      [:card 102] :non-canonical
                      [:card 103] :non-canonical}]
      (is (= 3 (signals/canonical-bypass-magnitude normalized canon-map))))))

(deftest canonical-bypass-author-before-canonical-test
  (testing "author ref that precedes the canonical search hit does not count"
    (let [normalized (normalize
                      [(user-msg 1 (ts 1))
                       (assistant-msg 2 (ts 2)
                                      [(tool-input "create_sql_query"
                                                   {:database_id 1 :sql_query "SELECT * FROM {{#50}}"}
                                                   "c1")
                                       (tool-output "c1")
                                       (tool-input "search" {} "s1")
                                       (search-output "s1" [{:model "table" :id 10}])])])
          canon-map  {[:card 50]  :non-canonical
                      [:table 10] :canonical}]
      (is (= 0 (signals/canonical-bypass-magnitude normalized canon-map))))))

(deftest canonical-bypass-unknown-ref-types-excluded-test
  (testing "dashboard/database/transform author refs resolve to :unknown and are excluded"
    (let [normalized (normalize
                      [(user-msg 1 (ts 1))
                       (assistant-msg 2 (ts 2)
                                      [(tool-input "search" {} "s1")
                                       (search-output "s1" [{:model "table" :id 10}])
                                       (tool-input "construct_notebook_query"
                                                   {:source_entity {:type "table" :id 99}
                                                    :referenced_entities []}
                                                   "c1")
                                       (tool-output "c1")])])
          canon-map  {[:table 10] :canonical
                      [:table 99] :unknown}]
      (is (= 0 (signals/canonical-bypass-magnitude normalized canon-map))))))

;; ---------------------------------------------------------------------------
;; Family 1, Signal 2 — canonical-ignored
;; ---------------------------------------------------------------------------

(deftest canonical-ignored-zero-when-no-canonical-hits-test
  (testing "no canonical hits → magnitude 0"
    (let [normalized (normalize
                      [(user-msg 1 (ts 1))
                       (assistant-msg 2 (ts 2)
                                      [(tool-input "search" {} "s1")
                                       (search-output "s1" [{:model "table" :id 10}])])])
          canon-map  {[:table 10] :non-canonical}]
      (is (= 0 (signals/canonical-ignored-magnitude normalized canon-map))))))

(deftest canonical-ignored-one-entity-test
  (testing "1 canonical hit with no engagement → magnitude 1"
    (let [normalized (normalize
                      [(user-msg 1 (ts 1))
                       (assistant-msg 2 (ts 2)
                                      [(tool-input "search" {} "s1")
                                       (search-output "s1" [{:model "table" :id 10}])])])
          canon-map  {[:table 10] :canonical}]
      (is (= 1 (signals/canonical-ignored-magnitude normalized canon-map))))))

(deftest canonical-ignored-dedups-by-entity-test
  (testing "the same canonical (type, id) appearing in multiple search hits counts once"
    (let [normalized (normalize
                      [(user-msg 1 (ts 1))
                       (assistant-msg 2 (ts 2)
                                      [(tool-input "search" {} "s1")
                                       (search-output "s1" [{:model "table" :id 10}])
                                       (tool-input "search" {} "s2")
                                       (search-output "s2" [{:model "table" :id 10}])])])
          canon-map  {[:table 10] :canonical}]
      (is (= 1 (signals/canonical-ignored-magnitude normalized canon-map))))))

(deftest canonical-ignored-engagement-via-inspect-test
  (testing "a later read_resource on the canonical entity counts as engagement"
    (let [normalized (normalize
                      [(user-msg 1 (ts 1))
                       (assistant-msg 2 (ts 2)
                                      [(tool-input "search" {} "s1")
                                       (search-output "s1" [{:model "table" :id 10}])
                                       (tool-input "read_resource"
                                                   {:uris ["metabase://table/10/fields"]}
                                                   "r1")
                                       (tool-output "r1")])])
          canon-map  {[:table 10] :canonical}]
      (is (= 0 (signals/canonical-ignored-magnitude normalized canon-map))))))

(deftest canonical-ignored-engagement-via-author-test
  (testing "a later authoring against the canonical entity counts as engagement"
    (let [normalized (normalize
                      [(user-msg 1 (ts 1))
                       (assistant-msg 2 (ts 2)
                                      [(tool-input "search" {} "s1")
                                       (search-output "s1" [{:model "model" :id 7}])
                                       (tool-input "construct_notebook_query"
                                                   {:source_entity {:type "model" :id 7}
                                                    :referenced_entities []}
                                                   "c1")
                                       (tool-output "c1")])])
          canon-map  {[:model 7] :canonical}]
      (is (= 0 (signals/canonical-ignored-magnitude normalized canon-map))))))

(deftest canonical-ignored-engagement-via-navigate-test
  (testing "a later navigate_user to the canonical entity counts as engagement"
    (let [normalized (normalize
                      [(user-msg 1 (ts 1))
                       (assistant-msg 2 (ts 2)
                                      [(tool-input "search" {} "s1")
                                       (search-output "s1" [{:model "question" :id 4}])
                                       (tool-input "navigate_user"
                                                   {:destination {:entity_type "question"
                                                                  :entity_id 4}}
                                                   "n1")
                                       (tool-output "n1")])])
          canon-map  {[:question 4] :canonical}]
      (is (= 0 (signals/canonical-ignored-magnitude normalized canon-map))))))

(deftest canonical-ignored-card-bridge-engagement-test
  (testing "{{#N}} ref-type :card engagement bridges to a canonical :question search hit"
    (let [normalized (normalize
                      [(user-msg 1 (ts 1))
                       (assistant-msg 2 (ts 2)
                                      [(tool-input "search" {} "s1")
                                       (search-output "s1" [{:model "question" :id 42}])
                                       (tool-input "create_sql_query"
                                                   {:database_id 1
                                                    :sql_query "SELECT * FROM {{#42}}"}
                                                   "c1")
                                       (tool-output "c1")])])
          canon-map  {[:question 42] :canonical}]
      (is (= 0 (signals/canonical-ignored-magnitude normalized canon-map))))))

(deftest canonical-ignored-prior-engagement-does-not-count-test
  (testing "engagement that occurs BEFORE the search hit does not count as engagement"
    (let [normalized (normalize
                      [(user-msg 1 (ts 1))
                       (assistant-msg 2 (ts 2)
                                      [(tool-input "read_resource"
                                                   {:uris ["metabase://table/10"]} "r1")
                                       (tool-output "r1")
                                       (tool-input "search" {} "s1")
                                       (search-output "s1" [{:model "table" :id 10}])])])
          canon-map  {[:table 10] :canonical}]
      (is (= 1 (signals/canonical-ignored-magnitude normalized canon-map))))))

;; ---------------------------------------------------------------------------
;; Family 1, Signal 3 — search-ignored
;; ---------------------------------------------------------------------------

(deftest search-ignored-zero-when-engaged-test
  (testing "a search whose returned entity is later engaged → magnitude 0"
    (let [normalized (normalize
                      [(user-msg 1 (ts 1))
                       (assistant-msg 2 (ts 2)
                                      [(tool-input "search" {} "s1")
                                       (search-output "s1" [{:model "table" :id 10}])
                                       (tool-input "read_resource"
                                                   {:uris ["metabase://table/10"]} "r1")
                                       (tool-output "r1")])])]
      (is (= 0 (signals/search-ignored-magnitude normalized {}))))))

(deftest search-ignored-one-wasted-call-test
  (testing "a search whose returned entities have no engagement → magnitude 1"
    (let [normalized (normalize
                      [(user-msg 1 (ts 1))
                       (assistant-msg 2 (ts 2)
                                      [(tool-input "search" {} "s1")
                                       (search-output "s1" [{:model "table" :id 10}])])])]
      (is (= 1 (signals/search-ignored-magnitude normalized {}))))))

(deftest search-ignored-rollup-per-call-test
  (testing "two search calls, one engaged and one not → magnitude 1 (per-call rollup)"
    (let [normalized (normalize
                      [(user-msg 1 (ts 1))
                       (assistant-msg 2 (ts 2)
                                      [(tool-input "search" {} "s1")
                                       (search-output "s1" [{:model "table" :id 10}])
                                       (tool-input "search" {} "s2")
                                       (search-output "s2" [{:model "table" :id 20}])
                                       (tool-input "read_resource"
                                                   {:uris ["metabase://table/10"]} "r1")
                                       (tool-output "r1")])])]
      (is (= 1 (signals/search-ignored-magnitude normalized {}))))))

(deftest search-ignored-partial-engagement-test
  (testing "if ANY entity from a search is later engaged, the call is not counted"
    (let [normalized (normalize
                      [(user-msg 1 (ts 1))
                       (assistant-msg 2 (ts 2)
                                      [(tool-input "search" {} "s1")
                                       (search-output "s1" [{:model "table" :id 10}
                                                            {:model "table" :id 20}])
                                       (tool-input "read_resource"
                                                   {:uris ["metabase://table/20"]} "r1")
                                       (tool-output "r1")])])]
      (is (= 0 (signals/search-ignored-magnitude normalized {}))))))

(deftest search-ignored-zero-result-search-not-counted-test
  (testing "a search that returned zero entities is not counted (no entries in :search-hits)"
    (let [normalized (normalize
                      [(user-msg 1 (ts 1))
                       (assistant-msg 2 (ts 2)
                                      [(tool-input "search" {} "s1")
                                       (search-output "s1" [])])])]
      (is (= 0 (signals/search-ignored-magnitude normalized {}))))))

;; ---------------------------------------------------------------------------
;; Family 1, Signal 4 — author-without-inspect
;; ---------------------------------------------------------------------------

(deftest author-without-inspect-zero-when-no-author-test
  (testing "no authoring → magnitude 0"
    (let [normalized (normalize
                      [(user-msg 1 (ts 1))
                       (assistant-msg 2 (ts 2)
                                      [(tool-input "read_resource"
                                                   {:uris ["metabase://table/10"]} "r1")
                                       (tool-output "r1")])])]
      (is (= 0 (signals/author-without-inspect-magnitude normalized {}))))))

(deftest author-without-inspect-fires-test
  (testing "an authoring with no prior inspect of the target → magnitude 1"
    (let [normalized (normalize
                      [(user-msg 1 (ts 1))
                       (assistant-msg 2 (ts 2)
                                      [(tool-input "construct_notebook_query"
                                                   {:source_entity {:type "table" :id 10}
                                                    :referenced_entities []}
                                                   "c1")
                                       (tool-output "c1")])])]
      (is (= 1 (signals/author-without-inspect-magnitude normalized {}))))))

(deftest author-without-inspect-prior-inspect-clears-fire-test
  (testing "a prior inspect of the target → magnitude 0"
    (let [normalized (normalize
                      [(user-msg 1 (ts 1))
                       (assistant-msg 2 (ts 2)
                                      [(tool-input "list_available_fields"
                                                   {:table_ids [10]} "l1")
                                       (tool-output "l1")
                                       (tool-input "construct_notebook_query"
                                                   {:source_entity {:type "table" :id 10}
                                                    :referenced_entities []}
                                                   "c1")
                                       (tool-output "c1")])])]
      (is (= 0 (signals/author-without-inspect-magnitude normalized {}))))))

(deftest author-without-inspect-card-bridge-test
  (testing "card-bridge: a prior inspect of :model 7 clears a {{#7}} :card author"
    (let [normalized (normalize
                      [(user-msg 1 (ts 1))
                       (assistant-msg 2 (ts 2)
                                      [(tool-input "list_available_fields"
                                                   {:model_ids [7]} "l1")
                                       (tool-output "l1")
                                       (tool-input "create_sql_query"
                                                   {:database_id 1
                                                    :sql_query "SELECT * FROM {{#7}}"}
                                                   "c1")
                                       (tool-output "c1")])])]
      (is (= 0 (signals/author-without-inspect-magnitude normalized {}))))))

(deftest author-without-inspect-card-bridge-reverse-test
  (testing "card-bridge reverse: a prior inspect via metabase://card/9 clears a :model 9 author"
    (let [normalized (normalize
                      [(user-msg 1 (ts 1))
                       (assistant-msg 2 (ts 2)
                                      [(tool-input "read_resource"
                                                   {:uris ["metabase://card/9"]} "r1")
                                       (tool-output "r1")
                                       (tool-input "construct_notebook_query"
                                                   {:source_entity {:type "model" :id 9}
                                                    :referenced_entities []}
                                                   "c1")
                                       (tool-output "c1")])])]
      (is (= 0 (signals/author-without-inspect-magnitude normalized {}))))))

(deftest author-without-inspect-excludes-database-test
  (testing "database/dashboard/transform author refs are not classifiable and don't contribute"
    (let [normalized (normalize
                      [(user-msg 1 (ts 1))
                       ;; construct_notebook_query with :referenced_entities containing
                       ;; non-classifiable types should not trigger fires
                       (assistant-msg 2 (ts 2)
                                      [(tool-input "construct_notebook_query"
                                                   {:source_entity {:type "table" :id 10}
                                                    :referenced_entities [{:type "dashboard" :id 1}
                                                                          {:type "database"  :id 2}
                                                                          {:type "transform" :id 3}]}
                                                   "c1")
                                       (tool-output "c1")
                                       ;; ensure the only fire is from :table 10
                                       ])])]
      (is (= 1 (signals/author-without-inspect-magnitude normalized {}))))))

(deftest author-without-inspect-three-events-test
  (testing "three distinct unverified authoring events → magnitude 3"
    (let [normalized (normalize
                      [(user-msg 1 (ts 1))
                       (assistant-msg 2 (ts 2)
                                      [(tool-input "create_sql_query"
                                                   {:database_id 1
                                                    :sql_query "SELECT * FROM {{#1}} JOIN {{#2}} JOIN {{#3}}"}
                                                   "c1")
                                       (tool-output "c1")])])]
      (is (= 3 (signals/author-without-inspect-magnitude normalized {}))))))

;; ---------------------------------------------------------------------------
;; Family 2 — iter-cap-burned
;; ---------------------------------------------------------------------------

(defn- iter-msg
  "Build an assistant message with `n-iters` LLM-emission groups under `profile`.
  Each iteration emits one tool-input then a tool-output (the most common shape)
  except the last, which is bare text to terminate cleanly."
  [id ts-val profile n-iters]
  (let [parts (into []
                    (mapcat (fn [i]
                              [(tool-input "search" {} (str "t" i))
                               (tool-output (str "t" i))]))
                    (range n-iters))]
    (assistant-msg id ts-val parts profile)))

(deftest iter-cap-burned-zero-when-below-cap-test
  (testing "an assistant turn under the cap → magnitude 0"
    (let [normalized (normalize
                      [(user-msg 1 (ts 1))
                       (iter-msg 2 (ts 2) "internal" 5)])]
      (is (= 0 (signals/iter-cap-burned-magnitude normalized))))))

(deftest iter-cap-burned-one-fire-at-cap-test
  (testing "iter_count == cap fires (>= cap)"
    (let [normalized (normalize
                      [(user-msg 1 (ts 1))
                       (iter-msg 2 (ts 2) "internal" 10)])]
      (is (= 1 (signals/iter-cap-burned-magnitude normalized))))))

(deftest iter-cap-burned-one-fire-above-cap-test
  (testing "iter_count > cap fires"
    (let [normalized (normalize
                      [(user-msg 1 (ts 1))
                       (iter-msg 2 (ts 2) "internal" 11)])]
      (is (= 1 (signals/iter-cap-burned-magnitude normalized))))))

(deftest iter-cap-burned-mixed-profile-per-row-test
  (testing "mixed-profile conversation: each row judged against its own cap"
    ;; Row 1: transforms_codegen at 20 iterations (cap 30) → does NOT fire
    ;; Row 2: internal at 10 iterations (cap 10) → fires
    ;; Row 3: transforms_codegen at 31 iterations (cap 30) → fires
    (let [normalized (normalize
                      [(user-msg 1 (ts 1))
                       (iter-msg 2 (ts 2) "transforms_codegen" 20)
                       (user-msg 3 (ts 3))
                       (iter-msg 4 (ts 4) "internal" 10)
                       (user-msg 5 (ts 5))
                       (iter-msg 6 (ts 6) "transforms_codegen" 31)])]
      (is (= 2 (signals/iter-cap-burned-magnitude normalized))))))

(deftest iter-cap-burned-missing-profile-falls-back-to-zero-test
  (testing "row whose profile_id is missing from profile-max-iterations contributes 0"
    (let [normalized (normalize
                      [(user-msg 1 (ts 1))
                       (iter-msg 2 (ts 2) "ghost-profile" 50)])]
      (is (= 0 (signals/iter-cap-burned-magnitude normalized))))))

(deftest iter-cap-burned-zero-iter-not-counted-test
  (testing "an assistant turn with iter_count = 0 (no LLM parts) does not fire"
    (let [normalized (normalize
                      [(user-msg 1 (ts 1))
                       ;; No LLM parts at all — only a stray tool-output (non-LLM)
                       (assistant-msg 2 (ts 2)
                                      [(tool-output "orphan")]
                                      "internal")])]
      (is (= 0 (signals/iter-cap-burned-magnitude normalized))))))

(deftest iter-cap-burned-user-rows-ignored-test
  (testing "user rows are never evaluated against the cap"
    (let [normalized (normalize
                      [(user-msg 1 (ts 1))
                       (user-msg 2 (ts 2))])]
      (is (= 0 (signals/iter-cap-burned-magnitude normalized))))))

;; ---------------------------------------------------------------------------
;; Family 3, Signal 6 — turn-thrash
;; ---------------------------------------------------------------------------

(defn- retrieval-turn
  "Build an assistant message whose parts are `n` data-retrieval tool calls.
  Each call is `read_resource` (a data-retrieval tool) so all `n` count."
  [id ts-val n]
  (let [parts (into []
                    (mapcat (fn [i]
                              [(tool-input "read_resource"
                                           {:uris [(str "metabase://table/" i)]}
                                           (str "r" i))
                               (tool-output (str "r" i))]))
                    (range n))]
    (assistant-msg id ts-val parts)))

(deftest turn-thrash-zero-below-baseline-test
  (testing "a turn at the baseline (5 retrievals) contributes 0"
    (let [normalized (normalize [(user-msg 1 (ts 1))
                                 (retrieval-turn 2 (ts 2) 5)])]
      (is (= 0 (signals/turn-thrash-magnitude normalized))))))

(deftest turn-thrash-single-turn-excess-test
  (testing "a turn with 15 retrievals contributes 10 (per-turn excess)"
    (let [normalized (normalize [(user-msg 1 (ts 1))
                                 (retrieval-turn 2 (ts 2) 15)])]
      (is (= 10 (signals/turn-thrash-magnitude normalized))))))

(deftest turn-thrash-sums-across-turns-test
  (testing "multiple thrashy turns sum (not max): two 15-retrieval turns → 20"
    (let [normalized (normalize [(user-msg 1 (ts 1))
                                 (retrieval-turn 2 (ts 2) 15)
                                 (user-msg 3 (ts 3))
                                 (retrieval-turn 4 (ts 4) 15)])]
      (is (= 20 (signals/turn-thrash-magnitude normalized))))))

(deftest turn-thrash-mixed-tool-families-test
  (testing "only data-retrieval tools count; authoring/error/text parts don't"
    ;; 3 search + 3 read_resource = 6 retrieval → excess 1
    ;; Plus 4 create_sql_query (authoring, not retrieval) — ignored
    (let [parts (concat
                 (mapcat (fn [i]
                           [(tool-input "search" {} (str "s" i))
                            (search-output (str "s" i) [{:model "table" :id i}])])
                         (range 3))
                 (mapcat (fn [i]
                           [(tool-input "read_resource"
                                        {:uris [(str "metabase://table/" (+ 10 i))]}
                                        (str "r" i))
                            (tool-output (str "r" i))])
                         (range 3))
                 (mapcat (fn [i]
                           [(tool-input "create_sql_query"
                                        {:database_id 1 :sql_query "SELECT 1"}
                                        (str "c" i))
                            (tool-output (str "c" i))])
                         (range 4)))
          normalized (normalize [(user-msg 1 (ts 1))
                                 (assistant-msg 2 (ts 2) (vec parts))])]
      (is (= 1 (signals/turn-thrash-magnitude normalized))))))

(deftest turn-thrash-user-rows-ignored-test
  (testing "user rows don't contribute (no :tool-calls field)"
    (let [normalized (normalize [(user-msg 1 (ts 1))
                                 (user-msg 2 (ts 2))])]
      (is (= 0 (signals/turn-thrash-magnitude normalized))))))

;; ---------------------------------------------------------------------------
;; Family 3, Signal 7 — expensive-search-turn
;; ---------------------------------------------------------------------------

(defn- assistant-tokens
  "Build an assistant message with the given total_tokens value and `parts`."
  [id ts-val tokens parts]
  (assoc (assistant-msg id ts-val parts) :total_tokens tokens))

(deftest expensive-search-turn-zero-when-no-search-dominant-test
  (testing "no search-dominant turn → magnitude 0 even with high token counts"
    (let [normalized (normalize
                      [(user-msg 1 (ts 1))
                       ;; 3 authoring calls — non-search-dominant
                       (assistant-tokens 2 (ts 2) 100000
                                         [(tool-input "create_sql_query"
                                                      {:database_id 1 :sql_query "SELECT 1"} "c1")
                                          (tool-output "c1")
                                          (tool-input "edit_sql_query"
                                                      {:query_id "q1" :edits []} "c2")
                                          (tool-output "c2")])])]
      (is (= 0 (signals/expensive-search-turn-magnitude normalized))))))

(deftest expensive-search-turn-returns-raw-tokens-test
  (testing "returns raw total_tokens of the worst search-dominant turn"
    (let [normalized (normalize
                      [(user-msg 1 (ts 1))
                       (assistant-tokens 2 (ts 2) 45000
                                         [(tool-input "search" {} "s1")
                                          (search-output "s1" [{:model "table" :id 1}])])
                       (user-msg 3 (ts 3))
                       (assistant-tokens 4 (ts 4) 80000
                                         [(tool-input "search" {} "s2")
                                          (search-output "s2" [{:model "table" :id 2}])])])]
      ;; raw max (pre-baseline): 80 000
      (is (= 80000 (signals/expensive-search-turn-magnitude normalized))))))

(deftest expensive-search-turn-fifty-percent-counts-test
  (testing "exactly 50% search calls qualifies as search-dominant (≥ 50% rule)"
    (let [normalized (normalize
                      [(user-msg 1 (ts 1))
                       ;; 1 search + 1 read_resource = 50% search → search-dominant
                       (assistant-tokens 2 (ts 2) 60000
                                         [(tool-input "search" {} "s1")
                                          (search-output "s1" [{:model "table" :id 1}])
                                          (tool-input "read_resource"
                                                      {:uris ["metabase://table/1"]} "r1")
                                          (tool-output "r1")])])]
      (is (= 60000 (signals/expensive-search-turn-magnitude normalized))))))

(deftest expensive-search-turn-no-tool-calls-ineligible-test
  (testing "a turn with 0 tool calls is :no-tool-calls — ineligible for either signal"
    (let [normalized (normalize
                      [(user-msg 1 (ts 1))
                       (assistant-tokens 2 (ts 2) 50000
                                         [{:type :text :text "just a reply"}])])]
      (is (= 0 (signals/expensive-search-turn-magnitude normalized)))
      (is (= 0 (signals/expensive-tool-turn-magnitude normalized))))))

;; ---------------------------------------------------------------------------
;; Family 3, Signal 8 — expensive-tool-turn
;; ---------------------------------------------------------------------------

(deftest expensive-tool-turn-returns-raw-tokens-test
  (testing "returns raw total_tokens of the worst non-search-dominant turn"
    (let [normalized (normalize
                      [(user-msg 1 (ts 1))
                       (assistant-tokens 2 (ts 2) 50000
                                         [(tool-input "create_sql_query"
                                                      {:database_id 1 :sql_query "SELECT 1"} "c1")
                                          (tool-output "c1")])])]
      (is (= 50000 (signals/expensive-tool-turn-magnitude normalized))))))

(deftest expensive-tool-turn-zero-when-only-search-dominant-test
  (testing "if every turn is search-dominant, expensive-tool-turn is 0"
    (let [normalized (normalize
                      [(user-msg 1 (ts 1))
                       (assistant-tokens 2 (ts 2) 90000
                                         [(tool-input "search" {} "s1")
                                          (search-output "s1" [{:model "table" :id 1}])])])]
      (is (= 0 (signals/expensive-tool-turn-magnitude normalized)))
      (is (= 90000 (signals/expensive-search-turn-magnitude normalized))))))

(deftest expensive-turn-partition-disjoint-test
  (testing "search-dominant and non-search-dominant turns never double-count"
    (let [normalized (normalize
                      [(user-msg 1 (ts 1))
                       ;; search-dominant 70K
                       (assistant-tokens 2 (ts 2) 70000
                                         [(tool-input "search" {} "s1")
                                          (search-output "s1" [{:model "table" :id 1}])])
                       (user-msg 3 (ts 3))
                       ;; non-search-dominant 50K (authoring)
                       (assistant-tokens 4 (ts 4) 50000
                                         [(tool-input "create_sql_query"
                                                      {:database_id 1 :sql_query "SELECT 1"} "c1")
                                          (tool-output "c1")])])]
      (is (= 70000 (signals/expensive-search-turn-magnitude normalized)))
      (is (= 50000 (signals/expensive-tool-turn-magnitude normalized))))))

;; ---------------------------------------------------------------------------
;; Family 3, Signal 9 — query-thrash
;; ---------------------------------------------------------------------------

(defn- create-with-qid
  "Tool-input/output pair for `create_sql_query` that returns `qid` in
  structured-output. Mirrors the post-strip persisted shape."
  [tid qid]
  [(tool-input "create_sql_query"
               {:database_id 1 :sql_query "SELECT 1"} tid)
   (tool-output tid {:output "..."
                     :structured-output {:query-id qid}})])

(defn- edit-on-qid
  "Tool-input/output pair for `edit_sql_query` targeting an existing query id."
  [tid qid]
  [(tool-input "edit_sql_query" {:query_id qid :edits []} tid)
   (tool-output tid)])

(deftest query-thrash-zero-on-single-authoring-test
  (testing "a single create returns magnitude 1 (raw count, pre-baseline)"
    (let [normalized (normalize
                      [(user-msg 1 (ts 1))
                       (assistant-msg 2 (ts 2)
                                      (vec (create-with-qid "c1" "q-a")))])]
      (is (= 1 (signals/query-thrash-magnitude normalized))))))

(deftest query-thrash-create-plus-fix-test
  (testing "create + immediate fix on the same query → magnitude 2 (still at baseline)"
    (let [parts (vec (concat (create-with-qid "c1" "q-a")
                             (edit-on-qid "e1" "q-a")))
          normalized (normalize
                      [(user-msg 1 (ts 1))
                       (assistant-msg 2 (ts 2) parts)])]
      (is (= 2 (signals/query-thrash-magnitude normalized))))))

(deftest query-thrash-third-authoring-test
  (testing "create + 2 fixes on the same query → magnitude 3 (inflection past baseline)"
    (let [parts (vec (concat (create-with-qid "c1" "q-a")
                             (edit-on-qid "e1" "q-a")
                             (edit-on-qid "e2" "q-a")))
          normalized (normalize
                      [(user-msg 1 (ts 1))
                       (assistant-msg 2 (ts 2) parts)])]
      (is (= 3 (signals/query-thrash-magnitude normalized))))))

(deftest query-thrash-bucketed-per-user-turn-test
  (testing "the same query-id authored in different user-turns does NOT combine into a single bucket"
    ;; First user-turn: 2 authorings on q-a (create + fix)
    ;; Second user-turn: 2 authorings on q-a (more fixes)
    ;; Max within any one (user-turn, query-id) bucket = 2, not 4
    (let [parts1 (vec (concat (create-with-qid "c1" "q-a")
                              (edit-on-qid "e1" "q-a")))
          parts2 (vec (concat (edit-on-qid "e2" "q-a")
                              (edit-on-qid "e3" "q-a")))
          normalized (normalize
                      [(user-msg 1 (ts 1))
                       (assistant-msg 2 (ts 2) parts1)
                       (user-msg 3 (ts 3))
                       (assistant-msg 4 (ts 4) parts2)])]
      (is (= 2 (signals/query-thrash-magnitude normalized))))))

(deftest query-thrash-bucketed-per-query-id-test
  (testing "different query-ids in the same user-turn → magnitude is max-per-bucket, not sum"
    (let [parts (vec (concat (create-with-qid "c1" "q-a")
                             (edit-on-qid "e1" "q-a")
                             (edit-on-qid "e2" "q-a")     ; q-a: 3
                             (create-with-qid "c2" "q-b") ; q-b: 1
                             (edit-on-qid "e3" "q-b")))   ; q-b: 2 (total)
          normalized (normalize
                      [(user-msg 1 (ts 1))
                       (assistant-msg 2 (ts 2) parts)])]
      (is (= 3 (signals/query-thrash-magnitude normalized))))))

(deftest query-thrash-no-query-id-dropped-test
  (testing "authoring events without a resolvable query-id don't contribute"
    ;; create_sql_query with no structured-output query-id, edit with no query_id arg
    (let [parts [(tool-input "create_sql_query"
                             {:database_id 1 :sql_query "SELECT 1"} "c1")
                 (tool-output "c1" {:output "..."})  ; no structured-output
                 (tool-input "edit_sql_query" {:edits []} "e1")
                 (tool-output "e1")]
          normalized (normalize
                      [(user-msg 1 (ts 1))
                       (assistant-msg 2 (ts 2) parts)])]
      (is (= 0 (signals/query-thrash-magnitude normalized))))))

(deftest query-thrash-non-authoring-tools-ignored-test
  (testing "search/inspect tool calls don't count toward query-thrash"
    (let [parts [(tool-input "search" {} "s1")
                 (search-output "s1" [{:model "table" :id 1}])
                 (tool-input "search" {} "s2")
                 (search-output "s2" [{:model "table" :id 2}])
                 (tool-input "search" {} "s3")
                 (search-output "s3" [{:model "table" :id 3}])]
          normalized (normalize
                      [(user-msg 1 (ts 1))
                       (assistant-msg 2 (ts 2) parts)])]
      (is (= 0 (signals/query-thrash-magnitude normalized))))))

;; ---------------------------------------------------------------------------
;; Family 4, Signal 10 — tool-error-magnitude
;; ---------------------------------------------------------------------------

(deftest tool-error-zero-on-clean-conversation-test
  (testing "no tool errors → magnitude 0"
    (let [normalized (normalize
                      [(user-msg 1 (ts 1))
                       (assistant-msg 2 (ts 2)
                                      [(tool-input "search" {} "s1")
                                       (search-output "s1" [{:model "table" :id 10}])])])]
      (is (= 0 (signals/tool-error-magnitude normalized))))))

(deftest tool-error-sibling-error-counts-test
  (testing "sibling :error on tool-output (new-format) contributes"
    (let [parts [(tool-input "create_sql_query"
                             {:database_id 1 :sql_query "SELECT 1"} "c1")
                 {:type :tool-output :id "c1" :result nil
                  :error {:type "validation" :message "bad SQL"}}]
          normalized (normalize [(user-msg 1 (ts 1))
                                 (assistant-msg 2 (ts 2) parts)])]
      (is (= 1 (signals/tool-error-magnitude normalized))))))

(deftest tool-error-nested-result-error-counts-test
  (testing "nested :result.error on tool-output contributes"
    (let [parts [(tool-input "create_sql_query"
                             {:database_id 1 :sql_query "SELECT 1"} "c1")
                 (tool-output "c1" {:output "..." :error "oops"})]
          normalized (normalize [(user-msg 1 (ts 1))
                                 (assistant-msg 2 (ts 2) parts)])]
      (is (= 1 (signals/tool-error-magnitude normalized))))))

(deftest tool-error-both-branches-counted-once-test
  (testing "a tool call with BOTH sibling :error and :result.error contributes 1 (per call), not 2"
    (let [parts [(tool-input "create_sql_query"
                             {:database_id 1 :sql_query "SELECT 1"} "c1")
                 {:type :tool-output :id "c1"
                  :result {:output "..." :error "nested oops"}
                  :error  {:type "exception" :message "sibling oops"}}]
          normalized (normalize [(user-msg 1 (ts 1))
                                 (assistant-msg 2 (ts 2) parts)])]
      (is (= 1 (signals/tool-error-magnitude normalized))))))

(deftest tool-error-empty-payloads-not-counted-test
  (testing "empty-string and empty-map error payloads read as 'no error'"
    (let [parts [(tool-input "search" {} "s1")
                 {:type :tool-output :id "s1" :result {:output "ok"} :error ""}
                 (tool-input "search" {} "s2")
                 {:type :tool-output :id "s2" :result {:output "ok" :error ""} :error nil}]
          normalized (normalize [(user-msg 1 (ts 1))
                                 (assistant-msg 2 (ts 2) parts)])]
      (is (= 0 (signals/tool-error-magnitude normalized))))))

(deftest tool-error-multiple-counts-test
  (testing "3 distinct tool errors in one conversation → magnitude 3"
    (let [parts [(tool-input "search" {} "s1")
                 {:type :tool-output :id "s1" :error {:message "a"}}
                 (tool-input "search" {} "s2")
                 {:type :tool-output :id "s2" :error {:message "b"}}
                 (tool-input "search" {} "s3")
                 (tool-output "s3" {:output "..." :error "c"})]
          normalized (normalize [(user-msg 1 (ts 1))
                                 (assistant-msg 2 (ts 2) parts)])]
      (is (= 3 (signals/tool-error-magnitude normalized))))))

;; ---------------------------------------------------------------------------
;; Family 4, Signal 11 — turn-broken
;; ---------------------------------------------------------------------------

(deftest turn-broken-zero-on-healthy-conversation-test
  (testing "all rows finished=true, error=nil → magnitude 0 (matches the historical-backfill default)"
    (let [normalized (normalize
                      [(user-msg 1 (ts 1))
                       (assistant-msg 2 (ts 2)
                                      [(tool-input "search" {} "s1")
                                       (search-output "s1" [{:model "table" :id 1}])])])]
      (is (= 0 (signals/turn-broken-magnitude normalized))))))

(deftest turn-broken-finished-false-counts-test
  (testing "a row with finished=false (client abort) contributes"
    (let [msg-aborted (-> (assistant-msg 2 (ts 2)
                                         [(tool-input "search" {} "s1")
                                          (search-output "s1" [{:model "table" :id 1}])])
                          (assoc :finished false))
          normalized  (normalize [(user-msg 1 (ts 1)) msg-aborted])]
      (is (= 1 (signals/turn-broken-magnitude normalized))))))

(deftest turn-broken-error-not-null-counts-test
  (testing "a row with error IS NOT NULL contributes (regardless of finished)"
    (let [msg-errored (-> (assistant-msg 2 (ts 2) [])
                          (assoc :error "{\"type\":\"exception\",\"message\":\"boom\"}"))
          normalized  (normalize [(user-msg 1 (ts 1)) msg-errored])]
      (is (= 1 (signals/turn-broken-magnitude normalized))))))

(deftest turn-broken-finished-null-does-not-count-test
  (testing "finished IS NULL (in-flight / placeholder) does NOT contribute (impl plan §9.3)"
    (let [msg-inflight (-> (assistant-msg 2 (ts 2) [])
                           (assoc :finished nil :error nil))
          normalized   (normalize [(user-msg 1 (ts 1)) msg-inflight])]
      (is (= 0 (signals/turn-broken-magnitude normalized))))))

(deftest turn-broken-sums-across-rows-test
  (testing "multiple broken rows sum (one finished=false + one error-bearing → 2)"
    (let [m-abort  (-> (assistant-msg 2 (ts 2) [])
                       (assoc :finished false))
          m-err    (-> (assistant-msg 4 (ts 4) [])
                       (assoc :error "{\"type\":\"x\"}"))
          normalized (normalize [(user-msg 1 (ts 1))
                                 m-abort
                                 (user-msg 3 (ts 3))
                                 m-err])]
      (is (= 2 (signals/turn-broken-magnitude normalized))))))
