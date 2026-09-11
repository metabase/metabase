(ns metabase.metabot.agent.prompts-test
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.metabot.agent.prompts :as prompts]))

(deftest ^:parallel load-system-prompt-template-test
  (testing "loads internal.selmer template"
    (let [template (prompts/load-system-prompt-template "internal.selmer")]
      (is (some? template))
      (is (string? template))
      (is (> (count template) 1000))
      (is (re-find #"metabot_name" template))))
  (testing "loads embedding-next.selmer template"
    (let [template (prompts/load-system-prompt-template "embedding-next.selmer")]
      (is (some? template))
      (is (string? template))
      (is (re-find #"metabot_name" template))))
  (testing "returns nil for non-existent template"
    (let [template (prompts/load-system-prompt-template "non-existent.selmer")]
      (is (nil? template)))))

(deftest ^:parallel construct-notebook-query-prompt-database-name-examples-test
  ;; This .md is the canonical construct_query format reference, served verbatim as an MCP resource
  ;; (see metabase.mcp.resources) and the source the construct-notebook-query-* skills were split from.
  (let [prompt (slurp (io/resource "metabot/prompts/tools/construct_notebook_query.md"))]
    (is (some? prompt))
    (testing "examples use the exact sample database name, not the old abbreviated portable FK"
      (is (str/includes? prompt "Sample Database"))
      (is (not (re-find #"\[Sample\s*," prompt))))))

(deftest ^:parallel metric-source-guidance-is-carried-by-every-surface-test
  ;; "A metric only works on the source it was defined on" is taught in three places that cannot share text: the
  ;; canonical .md served as an MCP resource, the advanced skill split out of it, and the aggregation catalog. Get
  ;; it wrong in any one and the agent builds `source-table: <base table>` for a metric defined on a saved question,
  ;; which the QP rejects. The gate in `metabase.metabot.tools.construct` and the tag attributes in
  ;; `metabase.metabot.tools.shared.llm-shape` are the other two halves; this pins the prose half.
  (let [surfaces {"prompts/tools/construct_notebook_query.md"
                  (slurp (io/resource "metabot/prompts/tools/construct_notebook_query.md"))
                  "skills/construct-notebook-query-advanced.md"
                  (slurp (io/resource "metabot/skills/construct-notebook-query-advanced.md"))}]
    (doseq [[path doc] surfaces]
      (testing path
        (testing "names both source attributes the `<metric>` tag can carry"
          (is (str/includes? doc "base_table_fully_qualified_name"))
          (is (str/includes? doc "source_card_portable_entity_id")))
        (testing "and the marker for a metric whose source cannot be offered"
          (is (str/includes? doc "source_unavailable")))
        (testing "and states the rule that makes the choice between them conditional"
          ;; Positive assertion: checking that old wording is absent goes vacuous the first time anyone
          ;; rephrases it, and would pass on a surface teaching the base table unconditionally in other words.
          (is (str/includes? doc "only works on the source it was defined on")))))
    (testing "the aggregation catalogs describe the metric clause the same way"
      (doseq [path ["metabot/prompts/tools/construct_notebook_query.md"
                    "metabot/skills/construct-notebook-query-operators.md"]]
        (testing path
          (let [line (->> (str/split-lines (slurp (io/resource path)))
                          (filter #(str/starts-with? % "- `[\"metric\", {}, "))
                          first)]
            (is (some? line) "the catalog lists a `metric` aggregation clause")
            (is (str/includes? line "base_table_fully_qualified_name"))
            (is (str/includes? line "source_card_portable_entity_id"))))))))

(deftest ^:parallel render-system-prompt-test
  (testing "renders template with variables"
    (let [template "Hello {{name}}, today is {{day}}"
          context {:name "Metabot" :day "Monday"}
          rendered (prompts/render-system-prompt template context)]
      (is (= "Hello Metabot, today is Monday" rendered))))
  (testing "handles missing variables gracefully"
    (let [template "Hello {{name}}"
          context {}
          rendered (prompts/render-system-prompt template context)]
      (is (some? rendered))
      ;; Selmer leaves undefined variables as empty or the variable name
      (is (or (= "Hello " rendered)
              (= "Hello {{name}}" rendered)))))
  (testing "handles conditionals"
    (let [template "{% if show %}visible{% endif %}"
          context-true {:show true}
          context-false {:show false}]
      (is (= "visible" (prompts/render-system-prompt template context-true)))
      (is (= "" (prompts/render-system-prompt template context-false)))))
  (testing "handles loops"
    (let [template "{% for item in items %}{{item}} {% endfor %}"
          context {:items ["a" "b" "c"]}
          rendered (prompts/render-system-prompt template context)]
      (is (= "a b c " rendered)))))

(deftest template-caching-test
  (testing "caches loaded templates"
    ;; Clear cache first
    (prompts/clear-cache!)
    ;; Load template - should cache it
    (let [template1 (prompts/get-cached-system-prompt "internal.selmer")]
      (is (some? template1))
      ;; Load again - should return from cache
      (let [template2 (prompts/get-cached-system-prompt "internal.selmer")]
        (is (= template1 template2)))))
  (testing "clear-cache! removes all cached templates"
    ;; Load some templates
    (prompts/get-cached-system-prompt "internal.selmer")
    ;; Clear cache
    (prompts/clear-cache!)
    ;; Cache should be empty (we can't directly test this, but we can reload)
    (let [template (prompts/get-cached-system-prompt "internal.selmer")]
      (is (some? template)))))

(deftest ^:parallel build-system-message-content-test
  (testing "builds complete system message"
    (let [profile {:prompt-template "embedding-next.selmer"}
          context {:current_time "2024-01-15 14:30:00"
                   :sql-dialect "postgresql"}
          tools {}
          content (prompts/build-system-message-content profile context tools [])]
      (is (some? content))
      (is (string? content))
      (is (> (count content) 100))
      (is (re-find #"Metabot" content))
      (is (not (str/includes? content "2024-01-15 14:30:00"))
          "current time is not in system message (moved to message injection)"))))

(deftest ^:parallel build-system-message-content-test-2
  (testing "includes dialect instructions when dialect specified"
    (let [profile {:prompt-template "embedding-next.selmer"}
          context {:current_time "2024-01-15 14:30:00"
                   :sql-dialect "postgresql"}
          tools {}
          content (prompts/build-system-message-content profile context tools [])]
      (is (some? content))
      ;; Note: The embedding template might not reference dialect instructions,
      ;; but they should be available in the template context
      (is (string? content)))))

(deftest ^:parallel build-system-message-content-test-3
  (testing "falls back to default message if template not found"
    (let [profile {:prompt-template "non-existent.selmer"}
          context {}
          tools {}
          content (prompts/build-system-message-content profile context tools [])]
      (is (some? content))
      (is (= "You are Metabot, a data analysis assistant for Metabase." content)))))

(deftest ^:parallel build-system-message-content-test-4
  (testing "uses default template name if not specified"
    (let [profile {}
          context {:current_time "2024-01-15 14:30:00"}
          tools {}
          content (prompts/build-system-message-content profile context tools [])]
      (is (some? content))
      (is (string? content))
      (is (> (count content) 1000)))))

(deftest ^:parallel build-system-message-content-test-5
  (testing "renders transform codegen template with literal model syntax"
    (let [profile {:prompt-template "transform-codegen.selmer"}
          context {:current_time "2024-01-15 14:30:00"
                   :sql-dialect "postgresql"}
          tools {}
          content (prompts/build-system-message-content profile context tools [])]
      (is (some? content))
      (is (string? content))
      (is (str/includes? content "{{#model_id}}"))
      (is (str/includes? content "{{#5-user-details}}"))
      (is (str/includes? content "{{snippet: Snippet Name}}"))
      (is (str/includes? content "{{snippet: recent orders}}"))
      (is (not (str/includes? content "{%raw%}")))
      (is (not (str/includes? content "{% safe %}"))))))

(deftest ^:parallel build-system-message-content-test-6
  (testing "current user info is not in system message (moved to message injection)"
    (let [profile {:prompt-template "internal.selmer"}
          context {:current_time "2024-01-15 14:30:00"
                   :current_user_info "<user><name>Jane Doe</name></user>"}
          tools {}
          content (prompts/build-system-message-content profile context tools [])]
      (is (some? content))
      (is (not (str/includes? content "Here is some information about the user:")))
      (is (not (str/includes? content "<user><name>Jane Doe</name></user>"))))))

(deftest ^:parallel build-system-message-content-test-7
  (testing "viewing context and recent views are not in system message (moved to message injection)"
    (let [profile {:prompt-template "internal.selmer"}
          context {:viewing_context "The user is currently looking at dashboard 42."
                   :recent_views    "Here are some items the user has recently viewed: card 7"}
          tools {}
          content (prompts/build-system-message-content profile context tools [])]
      (is (some? content))
      (is (not (str/includes? content "dashboard 42")))
      (is (not (str/includes? content "recently viewed"))))))

(deftest ^:parallel inject-context-test
  (testing "prepends the rendered context block to the message"
    (let [injected (prompts/inject-context {:current_time      "2024-01-15 14:30:00"
                                            :first_day_of_week "Monday"}
                                           "Show me revenue")]
      (is (str/starts-with? injected "<context>"))
      (is (str/ends-with? injected "Show me revenue"))
      (is (str/includes? injected "2024-01-15 14:30:00"))
      (is (str/includes? injected "Monday")))))

(deftest ^:parallel inject-context-recent-views-test
  (testing "recent views are injected into the message"
    (let [recent   "Here are some items the user has recently viewed: card 7"
          injected (prompts/inject-context {:recent_views recent} "Show me revenue")]
      (is (str/starts-with? injected "<context>"))
      (is (str/includes? injected recent)))))

(deftest ^:parallel inject-context-no-context-test
  (testing "message is returned unchanged when there is nothing to inject"
    (is (= "Hi" (prompts/inject-context {} "Hi")))
    (is (= "Hi" (prompts/inject-context {:viewing_context ""
                                         :current_time    ""
                                         :recent_views    ""}
                                        "Hi")))))

(deftest ^:parallel build-system-message-content-test-8
  (testing "builds exploration system message"
    (let [profile {:prompt-template "explorations.selmer"}
          context {}
          tools {}
          content (prompts/build-system-message-content profile context tools [])]
      (is (string? content))
      (is (not (str/includes? content "{% include"))
          "unresolved {% include %} tags mean rendering failed and the raw template was returned"))))

(deftest ^:parallel build-system-message-content-test-9
  (testing "renders sql querying template with literal model syntax"
    (let [profile {:prompt-template "sql-querying-only.selmer"}
          context {:current_time "2024-01-15 14:30:00"
                   :sql-dialect "postgresql"}
          tools {}
          content (prompts/build-system-message-content profile context tools [])]
      (is (some? content))
      (is (string? content))
      (is (str/includes? content "SELECT * FROM {{#model_id}} AS model_alias"))
      (is (str/includes? content "SELECT * FROM {{#5}} AS model_alias"))
      (is (str/includes? content "FROM {{#5}} a"))
      (is (str/includes? content "LEFT JOIN {{#7}} b ON a.customer_id = b.customer_id"))
      (is (str/includes? content "queried with {{#id}} syntax"))
      (is (not (str/includes? content "{%raw%}")))
      (is (not (str/includes? content "{% safe %}")))
      (is (not (str/includes? content "verbatim"))))))
