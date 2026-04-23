(ns metabase.metabot.tools.slackbot-query-test
  "Tests for slackbot query tool schema, prompt content, and (post-step-14) its
  representations-pipeline integration.

  Three test layers:

  * **Schema / prompt tests** (parallel-safe): assert properties of the tool's args schema and
    of the slackbot system prompt.
  * **Unit tests** (stubbed pipeline): stub `construct/execute-representations-query` and
    exercise the slackbot wrapper logic \u2014 YAML pass-through, adhoc_viz data part
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
      (testing "`:query` is a plain string (flat schema for MCP compat)"
        ;; Keep the schema flat: MCP `flatten-root-schema` historically breaks on
        ;; `:and` / `:fn` wrappers. The YAML is validated inside
        ;; `execute-representations-query`, not at the tool boundary.
        (is (= "string" (get-in json-schema [:properties :query :type])))))))

;;; ---------------------------------------- integration tests ------------------------------------------------------

;; These tests stub `execute-representations-query` with a fake that returns a canned
;; `:structured-output` so we can assert the slackbot-specific wrapping (link construction,
;; adhoc_viz data part, instructions text, error passthrough).

(defn- with-repr-stub! [stub-fn f]
  (with-redefs [construct/execute-representations-query stub-fn
                ;; `streaming/query->question-url` inspects the query; stub it too so the
                ;; fake query doesn't have to satisfy the real function's expectations.
                streaming/query->question-url
                (fn [_q display]
                  (str "/question#fake" (when display (str "?d=" display))))]
    (f)))

(deftest slackbot-tool-happy-path-test
  (testing (str "Slackbot tool takes a YAML query, hands it verbatim to\n"
                "execute-representations-query, wraps the result in an adhoc_viz data part\n"
                "with the provided title + display, and returns structured-output + instructions.")
    (let [captured-yaml (atom nil)
          fake-query    {:lib/type :mbql/query :database 1 :stages [{:source-table 10}]}]
      (with-repr-stub!
        (fn [yaml-string]
          (reset! captured-yaml yaml-string)
          {:structured-output {:query-id       "q-1"
                               :query          fake-query
                               :result-columns []}
           :instructions      "Query created."})
        (fn []
          (let [yaml-input (str "lib/type: mbql/query\n"
                                "database: Sample\n"
                                "stages:\n"
                                "  - source-table: [Sample, PUBLIC, ORDERS]\n"
                                "    aggregation:\n"
                                "      - [count, {}]\n")
                result     (slackbot-query/slackbot-construct-notebook-query-tool
                            {:reasoning "user asked for order count"
                             :query     yaml-input
                             :title     "Monthly order volume"
                             :display   "bar"})]
            (testing "YAML string passed through verbatim"
              (is (= yaml-input @captured-yaml)))
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
            (testing "instructions text mentions follow-up visualization rendering"
              (is (str/includes? (:instructions result) "follow-up message")))))))))

(deftest slackbot-tool-no-optional-fields-test
  (testing (str "When title/display are absent, the adhoc_viz data part omits them (doesn't\n"
                "include them with nil values) but the link is still built and returned.")
    (let [fake-query {:lib/type :mbql/query :database 1 :stages [{:source-table 10}]}]
      (with-repr-stub!
        (fn [_yaml]
          {:structured-output {:query-id       "q-x"
                               :query          fake-query
                               :result-columns []}
           :instructions      "ok"})
        (fn []
          (let [result (slackbot-query/slackbot-construct-notebook-query-tool
                        {:reasoning "simple request"
                         :query     "database: Sample\nstages:\n  - source-table: [Sample, PUBLIC, ORDERS]\n    aggregation:\n      - [count]\n"})
                data   (get-in result [:data-parts 0 :data])]
            (is (= "q-x" (get-in result [:structured-output :query-id])))
            (is (not (contains? data :title)))
            (is (not (contains? data :display)))
            (is (string? (:link data)))
            (is (= fake-query (:query data)))))))))

(deftest slackbot-tool-agent-error-surfaces-as-output-test
  (testing (str "When `execute-representations-query` throws an :agent-error? ex-info (as it\n"
                "does for unknown database, malformed YAML, etc.), the slackbot wrapper\n"
                "returns `{:output <message>}` so the message reaches the LLM verbatim \u2014\n"
                "no stack trace, no data-parts.")
    (with-repr-stub!
      (fn [_yaml]
        (throw (ex-info "Unknown database: `Sample`. Use the exact database name as reported by entity_details."
                        {:agent-error? true
                         :status-code  400
                         :error        :unknown-database
                         :database     "Sample"})))
      (fn []
        (let [result (slackbot-query/slackbot-construct-notebook-query-tool
                      {:reasoning "test agent-error path"
                       :query     "database: Sample\nstages: []\n"})]
          (testing "bare :output key with the agent message, no structured-output or data-parts"
            (is (string? (:output result)))
            (is (re-find #"Unknown database" (:output result)))
            (is (re-find #"Sample" (:output result)))
            (is (nil? (:structured-output result)))
            (is (nil? (:data-parts result)))))))))

(deftest slackbot-tool-unexpected-error-is-wrapped-test
  (testing (str "A non-agent exception (e.g. a programming bug) gets wrapped with a generic\n"
                "`Failed to construct notebook query: ...` prefix. Protects the LLM from\n"
                "leaking internal stack-trace-style messages.")
    (with-repr-stub!
      (fn [_yaml]
        (throw (RuntimeException. "something went sideways")))
      (fn []
        (let [result (slackbot-query/slackbot-construct-notebook-query-tool
                      {:reasoning "test non-agent error path"
                       :query     "database: Sample\nstages: []\n"})]
          (is (string? (:output result)))
          (is (str/starts-with? (:output result) "Failed to construct notebook query:"))
          (is (re-find #"something went sideways" (:output result))))))))

;;; ---------------------------------------- end-to-end test --------------------------------------------------------

(deftest slackbot-tool-end-to-end-test
  (testing (str "End-to-end: call the slackbot tool with a YAML query against the real\n"
                "application sample DB. Exercises the full repr pipeline (parse-yaml \u2192\n"
                "repair \u2192 validate \u2192 resolve) plus the slackbot-specific wrapping\n"
                "(query->question-url, adhoc_viz data part). Serves as a safety net for\n"
                "step 14 \u2014 any future regression in the slackbot contract should surface here\n"
                "without needing a live LLM loop.")
    (mt/with-current-user (test.users/user->id :crowberto)
      (let [db-name (t2/select-one-fn :name :model/Database :id (mt/id))
            ;; Canonical DB name (per `repr-plan.md` step 13); `Sample` alone would
            ;; short-circuit with :unknown-database.
            yaml    (str "lib/type: mbql/query\n"
                         "database: " db-name "\n"
                         "stages:\n"
                         "  - source-table: [" db-name ", PUBLIC, ORDERS]\n"
                         "    aggregation:\n"
                         "      - [count, {}]\n")
            result  (slackbot-query/slackbot-construct-notebook-query-tool
                     {:reasoning "count the orders"
                      :query     yaml
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
        (testing "canonical-DB-name happy path returns a structured-output, not an error :output"
          ;; A non-agent failure (or agent-error) would clear :structured-output and put the
          ;; message under :output. Sanity-check the happy-path shape.
          (is (some? (:structured-output result)) (pr-str result))
          (is (nil? (:output result))))))))

(deftest slackbot-tool-end-to-end-unknown-database-test
  (testing (str "End-to-end error path: if the LLM writes a DB name that doesn't match any\n"
                "application database, the slackbot tool returns `{:output <message>}` with\n"
                "a clear `Unknown database` message (no stack trace, no data-parts). This is\n"
                "the post-step-13 loud-failure behaviour \u2014 the previous silent-rewrite pass\n"
                "is gone.")
    (mt/with-current-user (test.users/user->id :crowberto)
      (let [;; Intentionally use an impossible name so we hit :unknown-database at lookup.
            yaml   (str "lib/type: mbql/query\n"
                        "database: DefinitelyNotARealDatabaseName\n"
                        "stages:\n"
                        "  - source-table: [DefinitelyNotARealDatabaseName, PUBLIC, ORDERS]\n"
                        "    aggregation:\n"
                        "      - [count, {}]\n")
            result (slackbot-query/slackbot-construct-notebook-query-tool
                    {:reasoning "wrong db name"
                     :query     yaml
                     :display   "table"})]
        (testing "no structured-output, no data-parts, clear message"
          (is (nil? (:structured-output result)))
          (is (nil? (:data-parts result)))
          (is (string? (:output result)))
          (is (re-find #"Unknown database" (:output result)))
          (is (re-find #"DefinitelyNotARealDatabaseName" (:output result))))))))
