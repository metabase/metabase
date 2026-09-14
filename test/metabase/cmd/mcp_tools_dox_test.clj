(ns metabase.cmd.mcp-tools-dox-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.api-scope.core :as api-scope]
   [metabase.cmd.mcp-tools-dox :as mcp-tools-dox]
   [metabase.mcp.v2.registry :as v2.registry]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

;;;; Titles

(deftest ^:parallel tool-title-test
  (testing "a tool's own title wins, lowered to the sentence case a heading wants"
    (is (= "Search Metabase content" (#'mcp-tools-dox/tool-title {:name "search" :title "Search Metabase Content"}))))
  (testing "no v2 deftool sets a title, so the slug is title-cased then sentence-cased"
    ;; heading a section `render_drill_through` would read as a slug rather than a name
    (is (= "Render drill through" (#'mcp-tools-dox/tool-title {:name "render_drill_through"})))
    (is (= "Get parameter values" (#'mcp-tools-dox/tool-title {:name "get_parameter_values"}))))
  (testing "acronyms survive the sentence-casing, whichever convention the title came from"
    (is (= "Execute SQL" (#'mcp-tools-dox/tool-title {:name "execute_sql"})))
    (is (= "Execute SQL" (#'mcp-tools-dox/tool-title {:name "execute_sql" :title "Execute Sql"})))
    (testing "and an explicit title that already spells one correctly is left alone"
      (is (= "Execute SQL" (#'mcp-tools-dox/tool-title {:name "execute_sql" :title "Execute SQL"})))))
  (testing "a word that merely contains an acronym is untouched"
    (is (= "Validate idea" (#'mcp-tools-dox/tool-title {:name "validate_idea"}))))
  (testing "UI is an acronym too"
    (is (= "Refresh UI credential" (#'mcp-tools-dox/tool-title {:name "refresh_ui_credential"})))))

(deftest ^:parallel description-test
  (testing "a description is flattened onto one line"
    (is (= "Search for tables. Ranked using RRF."
           (#'mcp-tools-dox/tool-description {:name "search"
                                              :description "Search for tables.\n\n  Ranked using\n  RRF."}))))
  (testing "a tool with nothing to say fails loudly rather than rendering an empty section"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"No description for MCP tool \"nope\""
                          (#'mcp-tools-dox/tool-description {:name "nope"})))))

;;;; Scopes

(deftest ^:parallel scope-bullet-test
  (testing "the scope is published with the wording the consent screen uses"
    (is (= "Permission scope: `agent:content:read` — See your Metabase content and data structure"
           (#'mcp-tools-dox/scope-bullet {:name "search" :scope "agent:content:read"}))))
  (testing "a tool with no scope contributes no bullet"
    ;; `register-tool!` refuses one, so this is only reachable from a hand-built map
    (is (nil? (#'mcp-tools-dox/scope-bullet {:name "whatever"}))))
  (testing "a scope no `defscope` registered fails loudly"
    ;; a scope string the consent screen can't explain is a bug, not a page to publish
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"uses unregistered scope \"agent:nope\""
                          (#'mcp-tools-dox/scope-bullet {:name "nope" :scope "agent:nope"})))))

;;;; Effects

(deftest ^:parallel effect-bullets-test
  (testing "a read-only tool says so, and doesn't stutter about being repeatable"
    (is (= ["Read-only. It doesn't create, change, or delete anything in your Metabase."]
           (remove nil? (#'mcp-tools-dox/effect-bullets
                         {:annotations {:readOnlyHint true :idempotentHint true}})))))
  (testing "a non-destructive writer says it writes, and promises nothing about what it won't touch"
    ;; `destructiveHint false` is a hint: `document_write` carries it and rewrites whole bodies
    (is (= ["Creates or changes content."]
           (remove nil? (#'mcp-tools-dox/effect-bullets {:annotations {:destructiveHint false}})))))
  (testing "a destructive tool is called out, and idempotence is worth saying about a writer"
    (is (= ["Can overwrite or delete existing content."
            "Running it again with the same arguments has the same effect as running it once."]
           (remove nil? (#'mcp-tools-dox/effect-bullets
                         {:annotations {:destructiveHint true :idempotentHint true}}))))))

;;;; Argument types

(deftest ^:parallel property-type-label-test
  (are [expected property] (= expected (#'mcp-tools-dox/property-type-label property))
    "string"           {:type "string"}
    ;; the strict-tool transform spells "optional" as nullable; `null` isn't a value a caller passes
    "string"           {:type ["string" "null"]}
    "array of string"  {:type "array" :items {:type "string"}}
    "array"            {:type "array"}
    ;; a nullable array keeps its `:items` inside the non-null branch
    "array of integer" {:oneOf [{:type "array" :items {:type "integer"}} {:type "null"}]}
    "string or array"  {:oneOf [{:type "string"} {:type "array" :items {:type "string"}}]}
    "object"           {:type "object" :properties {:a {:type "string"}}}
    "any"              {}))

;;;; Argument descriptions
;;;;
;;;; A `deftool` writes its prose on the schema it wraps, not on the property, and Malli leaves it there. These
;;;; pin the three shapes that puts it in, because reading `(:description property)` alone finds none of them.

(deftest ^:parallel property-descriptions-test
  (are [expected property] (= expected (#'mcp-tools-dox/property-descriptions property))
    ["Plain."]      {:description "Plain."}
    ;; `[:maybe [:int {:description ...}]]`
    ["Nullable."]   {:oneOf [{:type "integer" :description "Nullable."} {:type "null"}]}
    ;; `[:sequential [:string {:description ...}]]`
    ["Per item."]   {:type "array" :items {:type "string" :description "Per item."}}
    ;; `[:maybe [:sequential [:string {:description ...}]]]` — both wrappers at once
    ["Both."]       {:oneOf [{:type "array" :items {:type "string" :description "Both."}} {:type "null"}]}
    ;; `[:maybe [:or [:int {...}] [:string {...}]]]` — one per branch, both worth keeping
    ["An id." "An entity_id."]
    {:oneOf [{:oneOf [{:type "integer" :description "An id."}
                      {:type "string" :description "An entity_id."}]}
             {:type "null"}]}
    ;; the same prose reached twice is said once
    ["Once."]       {:oneOf [{:type "string" :description "Once."} {:type "string" :description "Once."}]}
    ;; an array of objects keeps the array's own prose and drops the elements': the table can't show the
    ;; nested shape, and `dashboard_write`'s `ops` is a union of two dozen such objects
    ["The list."]   {:type "array" :description "The list." :items {:type "object" :description "One item."}}
    ["The list."]   {:type "array" :description "The list."
                     :items {:oneOf [{:type "object" :description "Op A."} {:type "object" :description "Op B."}]}}
    ;; but a nullable object argument keeps its prose — that's the property's own shape, not a nested one
    ["Chain filtering."] {:oneOf [{:type "object" :description "Chain filtering."} {:type "null"}]}
    []              {:type "string"}))

(deftest ^:parallel enum-values-test
  (are [expected property] (= expected (#'mcp-tools-dox/enum-values property))
    ["create" "update"] {:type "string" :enum ["create" "update"]}
    ["create" "update"] {:oneOf [{:type "string" :enum ["create" "update"]} {:type "null"}]}
    ["a" "b"]           {:type "array" :items {:type "string" :enum ["a" "b"]}}
    []                  {:type "string"}))

(deftest ^:parallel arguments-markdown-test
  (testing "a tool with no properties says so rather than rendering an empty table"
    (is (= "This tool takes no arguments." (#'mcp-tools-dox/arguments-markdown {:inputSchema {}}))))
  (testing "arguments render alphabetically, with a dash where the schema carries no description"
    (let [markdown (#'mcp-tools-dox/arguments-markdown
                    {:inputSchema {:properties {:id     {:type "integer" :description "The ID."}
                                                :prompt {:type ["string" "null"]}}
                                   :required   [:id :prompt]}})]
      (is (str/includes? markdown "| `id`     | integer | The ID.     |"))
      (is (str/includes? markdown "| `prompt` | string  | —           |"))
      (testing "and the schema's `:required` is not published"
        ;; `strict-tool-input-schema` lists every property there so strict clients can send an explicit null,
        ;; so it can't tell a required argument from an optional one
        (is (not (str/includes? markdown "Required"))))))
  (testing "a description buried in a nullable branch is found rather than dashed out"
    ;; the shape of every optional v2 argument; would have been an em dash before `property-descriptions`
    (is (str/includes? (#'mcp-tools-dox/arguments-markdown
                        {:inputSchema {:properties {:limit {:oneOf [{:type "integer" :description "Max rows."}
                                                                    {:type "null"}]}}}})
                       "Max rows.")))
  (testing "a description on an array's items is found too"
    (is (str/includes? (#'mcp-tools-dox/arguments-markdown
                        {:inputSchema {:properties {:term_queries {:type  "array"
                                                                   :items {:type "string"
                                                                           :description "A keyword query."}}}}})
                       "A keyword query.")))
  (testing "an enum publishes what it accepts, ahead of its own prose"
    ;; the v2 surface dispatches on these, so the members are the argument's real documentation
    (is (str/includes? (#'mcp-tools-dox/arguments-markdown
                        {:inputSchema {:properties {:method {:type "string"
                                                             :enum ["create" "update"]
                                                             :description "What to do."}}}})
                       "One of: `create`, `update`. What to do.")))
  (testing "a pipe in a description doesn't split the row"
    (is (str/includes? (#'mcp-tools-dox/arguments-markdown
                        {:inputSchema {:properties {:q {:type "string" :description "a | b"}}}})
                       "a \\| b"))))

;;;; Which tools land on the page

(deftest all-tools-test
  (let [tools (#'mcp-tools-dox/all-tools)]
    (is (seq tools))
    (testing "a tool the MCP App calls for itself is left off the page"
      ;; the model never calls `refresh_ui_credential`; it takes no arguments and returns a credential
      (is (not (some #(= "refresh_ui_credential" (:name %)) tools)))
      (is (some #(= "refresh_ui_credential" (:name %)) (v2.registry/all-tool-entries))
          "the tool this test guards against listing no longer exists; pick another app-only tool"))
    (testing "every tool carries a scope some defscope can explain"
      ;; `register-tool!` pins it to a non-blank string; this pins it to one the consent screen has wording for
      (doseq [{:keys [name scope]} tools]
        (is (string? scope) (str "no scope for " name))
        (is (api-scope/registered-scope? scope) (str name " uses unregistered scope " (pr-str scope)))))
    (testing "the page covers everything a fully-authorized client can be offered to a model"
      ;; the manifest is the superset: `list-tools` also drops whatever `mcp-v2-disabled-tools` names
      (is (every? (set (map :name tools))
                  (->> (v2.registry/list-tools nil {:supports-mcp-ui? true})
                       (remove #'mcp-tools-dox/app-only?)
                       (map :name)))))
    (testing "the MCP Apps tools are the ones carrying a :_meta :ui block, which is how the page groups them"
      ;; `sections` keys off `:_meta`; keep it in step with the extension the tool actually requires
      (doseq [{:keys [name _meta required-extensions]} tools]
        (is (= (contains? (set required-extensions) :mcp-app-ui) (some? (:ui _meta)))
            (str name " disagrees about being an MCP Apps tool"))))))

(deftest ^:parallel group-tools-test
  (testing "an interactive tool is claimed by the interactive section even though it's also read-only"
    ;; section order is load-bearing: a reader needs to know it won't show up in every client
    (let [grouped (#'mcp-tools-dox/group-tools
                   [{:name "visualize_query" :_meta {:ui {:resourceUri "ui://metabase/visualize-query.html"}}
                     :annotations {:readOnlyHint true}}
                    {:name "search" :annotations {:readOnlyHint true}}
                    {:name "collection_write" :annotations {:destructiveHint true}}])]
      (is (= [["Interactive tools" ["visualize_query"]]
              ["Read-only tools" ["search"]]
              ["Write and delete tools" ["collection_write"]]]
             (for [[section tools] grouped]
               [(:heading section) (mapv :name tools)]))))))

(deftest ^:parallel document-markdown-test
  (testing "an empty registry fails loudly rather than writing a page with no tools"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"No MCP tools found"
                          (#'mcp-tools-dox/document-markdown "intro" [])))))

;;;; End to end

(deftest generate-dox-test
  (mt/with-temp-file [path]
    (let [{:keys [tools]} (mcp-tools-dox/generate-dox! path)
          markdown        (slurp path)
          documented      (#'mcp-tools-dox/all-tools)]
      (testing "reports what it wrote"
        (is (= (count documented) tools))
        (is (pos? tools)))
      (testing "the intro template is included"
        (is (str/starts-with? markdown "---\ntitle: MCP server tools")))
      (testing "every registered tool gets a section"
        ;; the point of the page: a `deftool` can't quietly go undocumented
        (doseq [t documented]
          (is (str/includes? markdown (str "### " (#'mcp-tools-dox/tool-title t)))
              (str "no section for " (:name t)))
          (is (str/includes? markdown (str "Tool name: `" (:name t) "`"))
              (str "no tool name for " (:name t)))))
      (testing "sections run interactive, then read-only, then write"
        (is (< (str/index-of markdown "## Interactive tools")
               (str/index-of markdown "## Read-only tools")
               (str/index-of markdown "## Write and delete tools"))))
      (testing "each section runs facts, then description, then arguments"
        (let [section (second (str/split markdown #"\n### Search\n"))]
          (is (< (str/index-of section "Tool name:")
                 (str/index-of section "Permission scope:")
                 (str/index-of section "Arguments:")))))
      (testing "scopes are published with the consent screen's wording"
        (is (str/includes? markdown "Permission scope: `agent:content:read`")))
      (testing "arguments are listed without claiming which are required"
        ;; would regress if the table read `:required` off the strict-transformed schema, which lists them all.
        ;; Checks the header rows, not the whole page — a description may legitimately open with "Required on
        ;; create", and `collection_write`'s `name` does.
        (is (not (re-find #"(?m)^\| Argument .*\bRequired\b.*\|$" markdown))))
      (testing "argument prose survives the nullable wrapper every v2 argument has"
        ;; the whole table would be em dashes if `property-descriptions` stopped at the property
        (let [section (second (str/split markdown #"\n### Search\n"))]
          (is (str/includes? section "| `limit`"))
          (is (not (re-find #"\| `limit`\s+\| integer\s+\| —" section)))))
      (testing "an action hub publishes the actions it dispatches on"
        (let [section (second (str/split markdown #"\n### Browse data\n"))]
          (is (str/includes? section "`list_databases`"))))
      (testing "an array-of-objects argument carries only its own prose, not every element's"
        ;; `ops` is a union of two dozen op objects; before `item-descriptions` their sentences ran together
        (let [section (second (str/split markdown #"\n### Dashboard write\n"))
              ops-row (re-find #"(?m)^\| `ops` .*$" section)]
          (is (some? ops-row))
          (is (< (count ops-row) 400) ops-row)
          (is (not (str/includes? ops-row "Add a tab.")))))
      (testing "the app-only credential tool has no section"
        (is (not (str/includes? markdown "refresh_ui_credential"))))
      (testing "the page ends with exactly one newline"
        (is (str/ends-with? markdown "\n"))
        (is (not (str/ends-with? markdown "\n\n")))))))
