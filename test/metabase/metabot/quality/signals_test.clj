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
