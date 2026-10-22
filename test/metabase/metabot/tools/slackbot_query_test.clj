(ns metabase.metabot.tools.slackbot-query-test
  "Tests for slackbot query tool schema, prompt content, and (post-step-14) its
  representations-pipeline integration.

  Three test layers:

  * **Schema / prompt tests** (parallel-safe): assert properties of the tool's args schema and
    of the slackbot system prompt.
  * **Unit tests** (stubbed pipeline): stub `construct/execute-representations-query` and
    exercise the slackbot wrapper logic - YAML pass-through, adhoc_viz data part
    construction, error translation.
  * **End-to-end test** (real sample DB): calls the tool with a realistic YAML against the
    real application database to catch anything the stubbed tests miss (real YAML parse,
    real repair passes, real resolver, real `query->question-url`)."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [malli.json-schema :as mjs]
   [metabase.metabot.agent.streaming :as streaming]
   [metabase.metabot.test-util :as test-util]
   [metabase.metabot.tools.construct :as construct]
   [metabase.metabot.tools.slackbot-query :as slackbot-query]
   [metabase.test :as mt]
   [metabase.test.data.users :as test.users]
   [toucan2.core :as t2]))

;;; ---------------------------------------- prompt content tests ---------------------------------------------------

(deftest slackbot-prompt-display-guidance-test
  (testing "slackbot prompt contains display-related guidance"
    (let [prompt (slurp (io/resource "metabot/prompts/system/slackbot.selmer"))]
      (is (str/includes? prompt "Set `display` explicitly for Slackbot charts."))
      (is (str/includes? prompt "Do not omit `display` for chart or graph requests.")))))

(deftest slackbot-prompt-narration-guidance-test
  (testing "slackbot prompt contains updated narration guidance"
    (let [prompt (slurp (io/resource "metabot/prompts/system/slackbot.selmer"))]
      (is (str/includes? prompt "Default to no pre-tool text at all."))
      (is (str/includes? prompt "Minimal Commentary for Query/Chart Requests")))))

;;; ---------------------------------------- schema tests -----------------------------------------------------------

(deftest display-field-has-description-test
  (testing "display field in slackbot-query-schema has a description in JSON Schema"
    (let [schema  @#'slackbot-query/slackbot-query-schema
          json-schema (mjs/transform schema)
          display-prop (get-in json-schema [:properties :display])]
      (is (some? (:description display-prop))
          "display field should have a :description in the JSON schema")
      (is (str/includes? (:description display-prop) "Visualization type")
          "description should mention 'Visualization type'"))))

(deftest display-field-is-optional-test
  (testing "display field is not in the required list"
    (let [schema  @#'slackbot-query/slackbot-query-schema
          json-schema (mjs/transform schema)
          required (set (:required json-schema))]
      (is (not (contains? required "display"))
          "display should not be required"))))

(deftest schema-shape-post-step-14-test
  (testing (str "Per `repr-plan.md` steps 13 and 14, the slackbot tool schema must only accept\n"
                "`{reasoning, query, title?, display?}`. No `source_entity`, no\n"
                "`referenced_entities`, no `program` (the legacy sexp shape).")
    (let [schema      @#'slackbot-query/slackbot-query-schema
          json-schema (mjs/transform schema)
          props       (set (keys (:properties json-schema)))]
      (testing "expected keys present"
        (is (contains? props :reasoning))
        (is (contains? props :query))
        (is (contains? props :title))
        (is (contains? props :display)))
      (testing "legacy keys absent"
        (is (not (contains? props :source_entity)))
        (is (not (contains? props :referenced_entities)))
        (is (not (contains? props :program))))
      (testing "`:query` is a JSON object (the portable representations external-query)"
        (is (= "object" (get-in json-schema [:properties :query :type])))))))

;;; ---------------------------------------- integration tests ------------------------------------------------------

;; These tests stub `execute-representations-query` with a fake that returns a canned
;; `:structured-output` so we can assert the slackbot-specific wrapping (link construction,
;; adhoc_viz data part, output text) without the pipeline.

(defn- with-repr-stub! [stub-fn f]
  (mt/with-dynamic-fn-redefs
    [construct/execute-representations-query stub-fn
     ;; `streaming/query->question-url` inspects the query; stub it too so the
     ;; fake query doesn't have to satisfy the real function's expectations.
     streaming/query->question-url
     (fn [_q display]
       (str "/question#fake" (when display (str "?d=" display))))]
    (f)))

(defn- call
  [arguments]
  (test-util/call-tool slackbot-query/slackbot-construct-notebook-query-tool arguments))

(deftest slackbot-tool-happy-path-test
  (testing (str "Slackbot tool takes an external-query map, hands it verbatim to\n"
                "execute-representations-query, and wraps the result in an adhoc_viz data part\n"
                "with the provided title + display.")
    (let [captured-query (atom nil)
          captured-opts  (atom :not-called)
          fake-query     {:lib/type :mbql/query :database 1 :stages [{:source-table 10}]}]
      (with-repr-stub!
        (fn [external-query & [opts]]
          (reset! captured-query external-query)
          (reset! captured-opts opts)
          {:structured-output {:query-id       "q-1"
                               :query          fake-query
                               :result-columns []}
           :instructions      "Query created."})
        (fn []
          (let [query-input {:lib/type "mbql/query"
                             :stages   [{:lib/type     "mbql.stage/mbql"
                                         :source-table ["Sample" "PUBLIC" "ORDERS"]
                                         :aggregation  [["count" {}]]}]}
                result      (call {:reasoning "user asked for order count"
                                   :query     query-input
                                   :title     "Monthly order volume"
                                   :display   "bar"})]
            (testing "external-query passed through verbatim"
              (is (= query-input @captured-query)))
            (testing "no `:recovery-hint` is threaded in. A pipeline error's recovery steps come
                     from its declaration in `tools.recoverable.pipeline`, filtered by the tools
                     the calling profile has — passing a hint as well would append a second copy
                     of the same advice."
              (is (nil? @captured-opts)))
            (testing "structured-output is returned upstream"
              (is (= "q-1" (get-in result [:structured-output :query-id])))
              (is (= fake-query (get-in result [:structured-output :query]))))
            (testing "adhoc_viz data part carries title + display + link"
              (let [parts (:data-parts result)
                    part  (first parts)
                    data  (:data part)]
                (is (= 1 (count parts)))
                (is (= "Monthly order volume" (:title data)))
                (is (= "bar" (:display data)))
                (is (str/starts-with? (:link data) "/question#"))
                (is (= fake-query (:query data)))))
            (testing "the model is told the visualization follows in its own message. Before, this
                     tool returned `:instructions` and no `:output`, so what actually reached the
                     model was the printed result map — this sentence plus the EDN of the resolved
                     query."
              (is (str/includes? (:output result) "follow-up message"))
              (is (str/includes? (:output result) "future tense"))
              (is (not (str/includes? (:output result) "source-table"))))))))))

(deftest slackbot-tool-no-optional-fields-test
  (testing (str "When title/display are absent, the adhoc_viz data part omits them (doesn't\n"
                "include them with nil values) but the link is still built and returned.")
    (let [fake-query {:lib/type :mbql/query :database 1 :stages [{:source-table 10}]}]
      (with-repr-stub!
        (fn [_external-query & _]
          {:structured-output {:query-id       "q-x"
                               :query          fake-query
                               :result-columns []}
           :instructions      "ok"})
        (fn []
          (let [result (call {:reasoning "simple request"
                              :query     {:lib/type "mbql/query"
                                          :stages   [{:lib/type     "mbql.stage/mbql"
                                                      :source-table ["Sample" "PUBLIC" "ORDERS"]
                                                      :aggregation  [["count" {}]]}]}})
                data   (get-in result [:data-parts 0 :data])]
            (is (= "q-x" (get-in result [:structured-output :query-id])))
            (is (not (contains? data :title)))
            (is (not (contains? data :display)))
            (is (string? (:link data)))
            (is (= fake-query (:query data)))))))))

(deftest slackbot-tool-declared-pipeline-error-test
  (testing (str "A pipeline error carrying a declared `:error` code becomes that recoverable\n"
                "error: the pipeline's own sentence, plus the recovery steps its declaration\n"
                "supplies. The tool itself says nothing about recovery.")
    (with-repr-stub!
      (fn [_external-query & _]
        (throw (ex-info "Unknown database: `Sample`."
                        {:agent-error? true
                         :status-code  400
                         :error        :unknown-database
                         :database     "Sample"})))
      (fn []
        (let [{:keys [class code text]}
              (test-util/tool-failure slackbot-query/slackbot-construct-notebook-query-tool
                                      {:reasoning "test agent-error path"
                                       :query     {:lib/type "mbql/query" :stages []}})]
          (is (= :recoverable class))
          (is (= :metabase.metabot.tools.recoverable.pipeline/unknown-database code))
          (testing "the pipeline's sentence survives verbatim"
            (is (str/includes? text "Unknown database"))
            (is (str/includes? text "Sample")))
          (testing "and the declaration's recovery step is appended"
            (is (str/includes? text "first element of every portable FK"))))))))

(deftest slackbot-tool-undeclared-error-ends-the-turn-test
  (testing (str "An exception the pipeline stamped `:agent-error?` onto without authoring a\n"
                "sentence for it is unrecoverable. Its message was written for a developer, and\n"
                "before this it went to the model as the tool's whole output.")
    (with-repr-stub!
      (fn [_external-query & _]
        (throw (ex-info "No matching clause: :metabase.lib.schema/bogus" {:agent-error? true})))
      (fn []
        (is (= {:class :unrecoverable :code :internal}
               (test-util/tool-failure slackbot-query/slackbot-construct-notebook-query-tool
                                       {:reasoning "foreign failure"
                                        :query     {:lib/type "mbql/query" :stages []}})))))))

(deftest slackbot-tool-refusal-is-a-not-found-test
  (testing (str "A 403 from inside the pipeline becomes the shared not-found error rather than\n"
                "`api/read-check`'s own sentence. Before, \"You don't have permissions to do\n"
                "that.\" was handed to the model as the tool's output, which named nothing and\n"
                "offered no next step.")
    (with-repr-stub!
      (fn [_external-query & _]
        (throw (ex-info "You don't have permissions to do that." {:status-code 403})))
      (fn []
        (let [{:keys [class code text]}
              (test-util/tool-failure slackbot-query/slackbot-construct-notebook-query-tool
                                      {:reasoning "refused"
                                       :query     {:lib/type "mbql/query" :stages []}})]
          (is (= :recoverable class))
          (is (= :metabase.metabot.tools.recoverable.common/not-found code))
          (is (str/includes? text "was not found"))
          (testing "and says nothing about permissions, which would leak whether it exists"
            (is (not (str/includes? text "permission")))))))))

(deftest slackbot-tool-bug-propagates-test
  (testing "an unexpected error, e.g. a programming bug, is not converted"
    (with-repr-stub!
      (fn [_external-query & _] (throw (RuntimeException. "something went sideways")))
      (fn []
        (is (thrown-with-msg? RuntimeException #"something went sideways"
                              (call {:reasoning "bug" :query {:lib/type "mbql/query" :stages []}})))))))

;;; ---------------------------------------- end-to-end test --------------------------------------------------------

(deftest slackbot-tool-end-to-end-test
  (testing (str "End-to-end: call the slackbot tool with a real query against the real\n"
                "application sample DB. Exercises the full repr pipeline (validate → repair →\n"
                "resolve) plus the slackbot-specific wrapping (query->question-url, adhoc_viz\n"
                "data part).")
    (mt/with-current-user (test.users/user->id :crowberto)
      (let [db-name (t2/select-one-fn :name :model/Database :id (mt/id))
            external-query {:lib/type "mbql/query"
                            :stages   [{:lib/type     "mbql.stage/mbql"
                                        :source-table [db-name "PUBLIC" "ORDERS"]
                                        :aggregation  [["count" {}]]}]}
            result  (call {:reasoning "count the orders"
                           :query     external-query
                           :title     "Total orders"
                           :display   "bar"})]
        (testing "structured-output carries a resolved MBQL 5 query with numeric ids"
          (let [q (get-in result [:structured-output :query])]
            (is (= :mbql/query (:lib/type q)))
            (is (= (mt/id) (:database q)))
            (is (= (mt/id :orders) (get-in q [:stages 0 :source-table])))
            (is (= :count (first (get-in q [:stages 0 :aggregation 0]))))))
        (testing "adhoc_viz data part carries title, display, a real question link, and the query"
          (let [part (first (:data-parts result))
                data (:data part)]
            (is (some? part))
            (is (= "Total orders" (:title data)))
            (is (= "bar" (:display data)))
            (is (str/starts-with? (:link data) "/question#"))
            (is (map? (:query data)))))
        (testing "and an `:output` the model can read"
          (is (string? (:output result)))
          (is (str/includes? (:output result) "Query created")))))))

(deftest slackbot-tool-end-to-end-unknown-database-test
  (testing (str "End-to-end error path: a DB name matching no application database is the\n"
                "declared `unknown-database` error, with the pipeline's sentence and the\n"
                "recovery step that says where a database name comes from.")
    (mt/with-current-user (test.users/user->id :crowberto)
      (let [external-query {:lib/type "mbql/query"
                            :stages   [{:lib/type     "mbql.stage/mbql"
                                        :source-table ["DefinitelyNotARealDatabaseName" "PUBLIC" "ORDERS"]
                                        :aggregation  [["count" {}]]}]}
            {:keys [class code text]}
            (test-util/tool-failure slackbot-query/slackbot-construct-notebook-query-tool
                                    {:reasoning "wrong db name"
                                     :query     external-query
                                     :display   "table"})]
        (is (= :recoverable class))
        (is (= :metabase.metabot.tools.recoverable.pipeline/unknown-database code))
        (is (str/includes? text "Unknown database"))
        (is (str/includes? text "DefinitelyNotARealDatabaseName"))
        (is (str/includes? text "portable FK"))))))
