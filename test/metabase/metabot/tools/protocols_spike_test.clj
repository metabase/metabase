(ns metabase.metabot.tools.protocols-spike-test
  "SPIKE — tools as records implementing protocols. Delete before merging.

  Two cases, chosen because they stress different halves of the idea:

  - `search`, where four tools in the codebase today are the same tool under different
    configuration. Four `mu/defn`s with four duplicated metadata blocks become one record type and
    four instances, and the thing they share stops being a coincidence you have to notice.
  - `read_resource`, where the tool does one thing per item. It implements `BatchedTool` as well,
    and its `handle` says so in one line.

  Internals are stubbed; the control flow and every error decision mirror the real tools."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools.core :as tools]
   [metabase.metabot.tools.error :as tools.error]
   [metabase.metabot.tools.runtime :as tools.runtime]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

;;; ════════════════════════════════════════════════════════════════════════════════════════════════
;;; search — one record, four instances
;;; ════════════════════════════════════════════════════════════════════════════════════════════════

(def ^:private search-args
  [:map {:closed true}
   [:keyword_queries [:sequential :string]]
   [:limit {:optional true} [:maybe :int]]])

(def ^:private sql-search-args
  [:map {:closed true}
   [:keyword_queries [:sequential :string]]
   [:database_id :int]
   [:limit {:optional true} [:maybe :int]]])

(defn- search-display
  "The title shown while the tool runs. Shared by every search variant — which the record makes a
  fact rather than four copies of the same metadata key."
  [{:keys [keyword_queries]}]
  (str/join ", " keyword_queries))

(defn- do-search
  "Stands in for the real `do-search`: the one body all four variants already share."
  [label allowed-types opts args]
  {:output            (format "<search label=\"%s\" types=\"%s\" opts=\"%s\">%s</search>"
                              label
                              (str/join "," (sort allowed-types))
                              (pr-str opts)
                              (str/join ", " (:keyword_queries args)))
   :structured-output {:result-type :search :label label}})

(defrecord SearchTool [tool-name description args allowed-types opts]
  tools/Tool
  (declaration [this]
    {:name         (:tool-name this)
     :description  (:description this)
     :args         (:args this)
     :scope        scope/agent-search
     :metabot/title-fn search-display})
  (handle [this args _ctx]
    (do-search (:tool-name this) (:allowed-types this) (:opts this) args)))

;;; The four tools. What varies is visible; what is shared is in the record.

(def search-tool
  (->SearchTool "search"
                (str "Find tables, models, metrics, dashboards, documents, and saved questions by "
                     "topic across the instance.")
                search-args
                #{"dashboard" "document" "metric" "model" "question" "table"}
                {}))

(def sql-search-tool
  (->SearchTool "search"
                "Find SQL-queryable data sources (tables and models) within a specific database."
                sql-search-args
                #{"model" "table"}
                {:scoped-to-database? true}))

(def nlq-search-tool
  (->SearchTool "search"
                "Find NLQ-queryable data sources by topic, or dashboards and documents to save into."
                search-args
                #{"dashboard" "document" "metric" "model" "question" "table"}
                {:profile-id "nlq"}))

(def transform-search-tool
  (->SearchTool "search"
                "Find transforms, plus the tables and models around them, by topic."
                search-args
                #{"model" "table" "transform"}
                {:search-native-query true}))

;;; ════════════════════════════════════════════════════════════════════════════════════════════════
;;; read_resource — one thing per item
;;; ════════════════════════════════════════════════════════════════════════════════════════════════

(tools.error/defrecoverable unreadable-uri!
  "The string is not a Metabase resource URI."
  {:payload [:map {:closed true} [:uri :string]]}
  [{:keys [uri]}]
  {:message  (str (pr-str uri) " is not a Metabase resource URI.")
   :recovery [{:uses #{"search"}
               :text "Call `search` and feed a URI from its results back here."}]})

(def ^:private fake-tables
  {1 {:name "orders" :fields ["id" "total"]}
   2 {:name "people" :fields ["id" "email"]}})

(defn- prefetch-tables!
  "Stands in for the batching `read_resource` does not do yet (`mapv`, with a pmap TODO) and for the
  cache `list_available_fields` already uses. A failure here fails the whole call, on purpose: a
  dead connection is one fault, not N misses."
  [uris]
  (when (some #(str/includes? % "/dbdown") uris)
    (throw (ex-info "H2 connection reset: user=mb_admin" {:sql "SELECT 1"})))
  ::warm)

(defrecord ReadResourceTool []
  tools/Tool
  (declaration [_]
    {:name        "read_resource"
     :description "Read detailed information about Metabase resources via URI patterns."
     :args        [:map {:closed true}
                   ;; The item cap is a fact about the arguments, so the runtime enforces it and the
                   ;; tool drops its hand-written count check. See `item-cap-loses-its-teaching-test`.
                   [:uris [:sequential {:min 1 :max 5} :string]]]
     :scope       scope/agent-resource-read})
  (handle [this {:keys [uris]} ctx]
    ;; The whole shape of this tool, in two lines: warm the cache, then do each item.
    (prefetch-tables! uris)
    (tools/handle-each this {:uris uris} ctx))

  tools/BatchedTool
  (items [_ {:keys [uris]} _ctx]
    uris)
  (load-item [_ uri _ctx]
    (if-not (str/starts-with? uri "metabase://")
      (unreadable-uri! {:uri uri})
      (let [[kind id] (str/split (subs uri (count "metabase://")) #"/")]
        (if-let [table (and (= "table" kind) (get fake-tables (parse-long (str id))))]
          {:output            (format "<table name=\"%s\">%s</table>"
                                      (:name table) (str/join ", " (:fields table)))
           :structured-output table}
          (tools/with-entity {:kind :table :id id}
            (throw (ex-info "Not found." {:status-code 404})))))))
  (compose [_ entries _ctx]
    ;; Each item in its own element, so a failure sits inside the element for the URI it belongs to
    ;; — which is what the tool does today via `format-resources`' `**Error:**` branch. The one thing
    ;; this cannot get from `concatenated` is `:data-parts`: the tool emits a *single* title part
    ;; built from the items that loaded, so that key is not per-item concatenable.
    (cond-> {:output (str "<resources>\n"
                          (str/join "\n"
                                    (for [{:keys [item output]} entries]
                                      (format "<resource uri=\"%s\">\n%s\n</resource>" item output)))
                          "\n</resources>")}
      (seq (remove :failed? entries))
      (assoc :data-parts [{:type      :data
                           :data-type "tool-title"
                           :data      (->> entries
                                           (remove :failed?)
                                           (keep (comp :name :structured-output))
                                           distinct
                                           (str/join ", "))}]))))

(def read-resource-tool (->ReadResourceTool))

;;; A batched tool that wants nothing special from composition — the delegating line is the whole
;;; answer to Clojure's missing protocol defaults, and it reads as what it is.

(defrecord LoadSkillTool []
  tools/Tool
  (declaration [_]
    {:name        "load_skill"
     :description "Load the full instructions for one or more skills."
     :args        [:map {:closed true} [:ids [:sequential :string]]]})
  (handle [this args ctx]
    (tools/handle-each this args ctx))

  tools/BatchedTool
  (items [_ {:keys [ids]} _ctx] ids)
  (load-item [_ id _ctx]
    (if (= "unknown" id)
      (unreadable-uri! {:uri id})
      {:output (format "<skill id=\"%s\">…body…</skill>" id)}))
  (compose [_ entries _ctx]
    (tools/concatenated entries)))

(def load-skill-tool (->LoadSkillTool))

;;; ════════════════════════════════════════════════════════════════════════════════════════════════
;;; Tests
;;; ════════════════════════════════════════════════════════════════════════════════════════════════

(def ^:private entries
  (tools/entries [search-tool read-resource-tool load-skill-tool]))

(defn- invoke
  ([tool args] (invoke #{"search" "read_resource" "load_skill"} tool args))
  ([tool-names tool args]
   (binding [scope/*current-user-scope* #{"*"}]
     (tools.runtime/invoke entries
                           {:profile-id :nlq :metabot-id nil :tool-names tool-names}
                           tool args))))

;;; ── the variant case ──────────────────────────────────────────────────────────────────────────

(deftest ^:parallel variants-are-instances-not-copies-test
  (testing "all four share a type, a scope, a title function and a body"
    (let [variants [search-tool sql-search-tool nlq-search-tool transform-search-tool]]
      (is (every? #(instance? SearchTool %) variants))
      (is (= [scope/agent-search] (distinct (map (comp :scope tools/declaration) variants))))
      (is (= [search-display] (distinct (map (comp :metabot/title-fn tools/declaration) variants))))
      (is (= ["search"] (distinct (map (comp :name tools/declaration) variants))))))
  (testing "and differ only in the fields they were constructed with"
    (is (= #{"model" "table"} (:allowed-types sql-search-tool)))
    (is (= {:profile-id "nlq"} (:opts nlq-search-tool)))
    (is (not= (:args search-tool) (:args sql-search-tool)))))

(deftest ^:parallel each-variant-declares-validly-test
  (testing "a declaration is checked the same way whatever instance it came from"
    (doseq [tool [search-tool sql-search-tool nlq-search-tool transform-search-tool]]
      (is (mr/validate ::tools/declaration (tools/validate-tool! tool))))))

(deftest ^:parallel a-variants-config-reaches-its-body-test
  (is (= (str "<search label=\"search\" types=\"dashboard,document,metric,model,question,table\" "
              "opts=\"{}\">orders</search>")
         (:output (invoke "search" {:keyword_queries ["orders"]}))))
  (testing "a different instance, same code path"
    (is (= "<search label=\"search\" types=\"model,table,transform\" opts=\"{:search-native-query true}\">orders</search>"
           (:output (tools/handle transform-search-tool {:keyword_queries ["orders"]} {}))))))

;;; ── the batched case ──────────────────────────────────────────────────────────────────────────

(deftest ^:parallel a-failed-item-sits-in-its-own-element-test
  (let [outcome (invoke "read_resource" {:uris ["metabase://table/1" "nope" "metabase://table/9"]})]
    (is (nil? (:error outcome)) "a partial failure is not a failed call")
    (is (= ["<resources>"
            "<resource uri=\"metabase://table/1\">"
            "<table name=\"orders\">id, total</table>"
            "</resource>"
            "<resource uri=\"nope\">"
            "\"nope\" is not a Metabase resource URI."
            "Call `search` and feed a URI from its results back here."
            "</resource>"
            "<resource uri=\"metabase://table/9\">"
            "Table 9 was not found. It may not exist, or you may not have access to it."
            "Call `search` to find the entity you want and use an id from the results."
            "</resource>"
            "</resources>"]
           (str/split-lines (:output outcome))))
    (is (mr/validate ::tools.runtime/outcome outcome))))

(deftest ^:parallel compose-exists-for-the-single-title-part-test
  (is (= [{:type :data :data-type "tool-title" :data "orders, people"}]
         (:data-parts (invoke "read_resource" {:uris ["metabase://table/1" "metabase://table/2"
                                                      "nope"]}))))
  (testing "and none when nothing loaded"
    (is (nil? (:data-parts (invoke "read_resource" {:uris ["nope"]}))))))

(deftest ^:parallel delegating-to-concatenated-is-the-whole-default-test
  (testing "load_skill wants nothing special, so its compose is one line"
    (is (= ["<skill id=\"a\">…body…</skill>"
            "<skill id=\"b\">…body…</skill>"]
           (str/split-lines (:output (invoke "load_skill" {:ids ["a" "b"]})))))
    (testing "and a failed item still lands in position"
      (is (= ["<skill id=\"a\">…body…</skill>"
              "\"unknown\" is not a Metabase resource URI."
              "Call `search` and feed a URI from its results back here."]
             (str/split-lines (:output (invoke "load_skill" {:ids ["a" "unknown"]}))))))))

(deftest ^:parallel recovery-steps-are-filtered-once-for-everyone-test
  (testing "an item's failure gets the filtering a whole failed call gets"
    (let [outcome (invoke #{"read_resource"} "read_resource" {:uris ["nope"]})]
      (is (not (str/includes? (:output outcome) "`search`")))
      (is (str/includes? (:output outcome) "\"nope\" is not a Metabase resource URI.")))))

(deftest ^:parallel prefetch-failure-fails-the-whole-call-test
  (testing "it runs in `handle` before the delegation, so it is not a per-item failure"
    (let [outcome (invoke "read_resource" {:uris ["metabase://table/1" "metabase://table/dbdown"]})]
      (is (= {:class :unrecoverable :code :internal} (:error outcome)))
      (doseq [leak ["H2" "mb_admin" "SELECT"]]
        (is (not (str/includes? (:output outcome) leak)) (str "leaked " leak))))))

(deftest ^:parallel an-undeclared-exception-in-an-item-ends-the-turn-test
  (testing "the items that did load are discarded on purpose: a bug is not a partial result"
    (let [crashing (reify
                     tools/Tool
                     (declaration [_] {:name "crash" :description "d"
                                       :args [:map {:closed true}]})
                     (handle [this args ctx] (tools/handle-each this args ctx))
                     tools/BatchedTool
                     (items [_ _ _] [1 2])
                     (load-item [_ i _] (if (= 2 i)
                                          (throw (ex-info "a real bug: hunter2" {:pw "hunter2"}))
                                          {:output "fine"}))
                     (compose [_ es _] (tools/concatenated es)))
          outcome  (binding [scope/*current-user-scope* #{"*"}]
                     (tools.runtime/invoke (tools/entries [crashing])
                                           {:profile-id :nlq :metabot-id nil :tool-names #{"crash"}}
                                           "crash" {}))]
      (is (= {:class :unrecoverable :code :internal} (:error outcome)))
      (doseq [secret ["hunter2" "a real bug" "fine"]]
        (is (not (str/includes? (:output outcome) secret)) (str "leaked " secret))))))

(deftest ^:parallel reify-is-enough-for-a-test-double-test
  (testing "no macro, no var metadata, no registry — a tool is just a value"
    (is (= {:output "stub"}
           (tools/handle (reify tools/Tool
                           (declaration [_] {:name "x" :description "d" :args :any})
                           (handle [_ _ _] {:output "stub"}))
                         {} {})))))

;;; ── recorded, not decided ─────────────────────────────────────────────────────────────────────

(deftest ^:parallel item-cap-loses-its-teaching-test
  (testing "moving the cap into :args is right, but the generated message is much worse than the
           hand-written one. read_resource says today:

             Too many URIs provided (6). Please limit to 5 URIs maximum. Be more selective and
             focus on the most relevant items for the current task or fetch them in batches."
    (is (= "Invalid tool arguments: `uris` should have at most 5 elements; received an array."
           (:output (invoke "read_resource" {:uris ["a" "b" "c" "d" "e" "f"]}))))))

(deftest ^:parallel everything-failed-is-still-a-success-test
  (testing "OPEN QUESTION — every item failed, so nothing was delivered, yet the call succeeds and
           its whole output is failure text. Arguably it should fail, but as which error? There is
           no code for \"your five items were five different kinds of missing\", and collapsing them
           loses the attribution the agent needs to retry."
    (let [outcome (invoke "read_resource" {:uris ["nope" "also-nope"]})]
      (is (nil? (:error outcome)))
      (is (= 2 (count (re-seq #"is not a Metabase resource URI" (:output outcome))))))))

;;; ════════════════════════════════════════════════════════════════════════════════════════════════
;;; edit_sql_query — a mutation tool: three failures, three audiences
;;; ════════════════════════════════════════════════════════════════════════════════════════════════

(tools.error/defrecoverable unknown-query-id!
  "The query id is not in this conversation's query state."
  {:payload [:map {:closed true}
             [:query-id  :string]
             [:available [:sequential :string]]]}
  [{:keys [query-id available]}]
  {:message  (if (seq available)
               (str "Query " query-id " is not in this conversation. Available query ids: "
                    (str/join ", " available) ".")
               (str "Query " query-id " is not in this conversation, and none have been created "
                    "in it yet."))
   :recovery (if (seq available)
               []
               [{:uses #{"create_sql_query"}
                 :text "Call `create_sql_query` to make one first."}])})

(tools.error/defrecoverable sql-syntax-error!
  "The edited SQL does not parse."
  {:payload [:map {:closed true}
             [:dialect :string]
             [:line    {:optional true} [:maybe :int]]
             [:column  {:optional true} [:maybe :int]]]}
  [{:keys [dialect line column]}]
  ;; Structured fields, never the raw sqlglot message — that can carry ANSI escapes, and `render`'s
  ;; dev/test assertion would reject it.
  {:message  (str "The edited query is not valid " dialect " SQL"
                  (when line (str " at line " line (when column (str ", column " column)))) ".")
   :recovery [{:uses #{} :text "Fix the syntax and send the edit again."}]})

(def ^:private fake-queries
  {"q1" {:database 1 :sql "SELECT id, name FROM orders"}
   "q2" {:database 99 :sql "SELECT 1"}})

(defrecord EditSqlQueryTool []
  tools/Tool
  (declaration [_]
    {:name         "edit_sql_query"
     :description  "Edit an existing SQL query using structured edits."
     :scope        scope/agent-sql-edit
     :metabot/capabilities #{:permission-write-sql-queries}
     :args         [:map {:closed true}
                    [:query_id [:or :string :int]]
                    [:old_string :string]
                    [:new_string :string]]})
  (handle [_ {:keys [query_id old_string new_string]} ctx]
    (let [queries  (get-in (some-> (:memory-atom ctx) deref) [:state :queries] fake-queries)
          query-id (str query_id)
          query    (or (get queries query-id)
                       (unknown-query-id! {:query-id  query-id
                                           :available (vec (sort (keys queries)))}))]
      ;; A permission the agent cannot acquire, so the user is the one who has to act. Note this is
      ;; the call Maksym questioned: MBQL may still be open, which would make it recoverable.
      (when (= 99 (:database query))
        (tools.error/unrecoverable!
         ::no-native-query-permission
         {:user-message "You don't have permission to write SQL against this database."
          :data         {:database-id (:database query)}}))
      (let [new-sql (str/replace-first (:sql query) old_string new_string)]
        (when (str/includes? new-sql "FROM FROM")
          (sql-syntax-error! {:dialect "postgres" :line 1 :column 22}))
        {:output            (str "<result>\nQuery " query-id " updated.\n"
                                 "<query>" new-sql "</query>\n</result>\n"
                                 "<instructions>\nShow the user the result.\n</instructions>")
         :structured-output {:query-id query-id :query-content new-sql}}))))

(def edit-sql-query-tool (->EditSqlQueryTool))

;;; ════════════════════════════════════════════════════════════════════════════════════════════════
;;; get_timeline_details — a single-query tool that is one converter
;;; ════════════════════════════════════════════════════════════════════════════════════════════════

(defrecord GetTimelineDetailsTool []
  tools/Tool
  (declaration [_]
    {:name        "get_timeline_details"
     :description "Get the full details of a timeline including its events."
     :scope       scope/agent-timelines-read
     :args        [:map {:closed true} [:timeline_id pos-int?]]})
  (handle [_ {:keys [timeline_id]} _ctx]
    (let [timeline (tools/with-entity {:kind :timeline :id timeline_id}
                     (if (= 1 timeline_id)
                       {:name "Releases" :events [{:name "v50"}]}
                       (throw (ex-info "Not found." {:status-code 404}))))]
      {:output (format "<timeline name=\"%s\">%s events</timeline>"
                       (:name timeline) (count (:events timeline)))})))

(def get-timeline-details-tool (->GetTimelineDetailsTool))

;;; ── tests for the two above ───────────────────────────────────────────────────────────────────

(def ^:private more-entries
  (tools/entries [edit-sql-query-tool get-timeline-details-tool]))

(defn- invoke-more [tool args]
  (binding [scope/*current-user-scope* #{"*"}]
    (tools.runtime/invoke more-entries
                          {:profile-id :sql :metabot-id nil
                           :tool-names #{"edit_sql_query" "get_timeline_details"
                                         "create_sql_query" "search"}}
                          tool args)))

(deftest ^:parallel a-mutation-tool-routes-three-failures-three-ways-test
  (testing "recoverable: the agent can pick a different query id"
    (is (=? {:output "Query q7 is not in this conversation. Available query ids: q1, q2."
             :error  {:class :recoverable}}
            (invoke-more "edit_sql_query" {:query_id "q7" :old_string "a" :new_string "b"}))))
  (testing "recoverable: the agent can fix its own syntax"
    (is (=? {:error {:class :recoverable
                     :code  ::sql-syntax-error}}
            (invoke-more "edit_sql_query" {:query_id   "q1"
                                           :old_string "FROM orders"
                                           :new_string "FROM FROM orders"}))))
  (testing "unrecoverable: only the user can grant a permission, so the turn ends"
    (is (=? {:output "This call failed and the user was shown the error (:metabase.metabot.tools.protocols-spike-test/no-native-query-permission). Don't retry it."
             :error  {:class        :unrecoverable
                      :user-message "You don't have permission to write SQL against this database."}}
            (invoke-more "edit_sql_query" {:query_id "q2" :old_string "1" :new_string "2"}))))
  (testing "success"
    (is (=? {:output            #(str/includes? % "SELECT id, name, total FROM orders")
             :structured-output {:query-id "q1"}}
            (invoke-more "edit_sql_query" {:query_id   "q1"
                                           :old_string "id, name"
                                           :new_string "id, name, total"})))))

(deftest ^:parallel a-mutation-tool-reads-state-from-ctx-test
  (testing "no dynamic var, no per-tool memory allowlist"
    (is (=? {:output "Query q1 is not in this conversation. Available query ids: mine."}
            (binding [scope/*current-user-scope* #{"*"}]
              (tools.runtime/invoke more-entries
                                    {:profile-id  :sql :metabot-id nil
                                     :tool-names  #{"edit_sql_query"}
                                     :memory-atom (atom {:state {:queries {"mine" {:database 1
                                                                                   :sql "SELECT 1"}}}})}
                                    "edit_sql_query"
                                    {:query_id "q1" :old_string "a" :new_string "b"}))))))

(deftest ^:parallel a-single-query-tool-can-be-one-converter-test
  (is (= {:output "<timeline name=\"Releases\">1 events</timeline>"}
         (invoke-more "get_timeline_details" {:timeline_id 1})))
  (is (=? {:output #(str/starts-with? % "Timeline 9 was not found.")
           :error  {:class :recoverable
                    :code  :metabase.metabot.tools.recoverable.common/not-found}}
          (invoke-more "get_timeline_details" {:timeline_id 9}))))
