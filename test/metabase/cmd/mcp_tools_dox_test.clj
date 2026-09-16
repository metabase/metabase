(ns metabase.cmd.mcp-tools-dox-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.api-scope.core :as api-scope]
   [metabase.cmd.mcp-tools-dox :as mcp-tools-dox]
   [metabase.mcp.v2.registry :as v2.registry]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(defn- documented-tools
  "The registry entries the page documents."
  []
  (remove #'mcp-tools-dox/app-only? (v2.registry/all-tool-entries)))

(defn- argument
  "`property` read as the page reads an argument."
  [property]
  (#'mcp-tools-dox/property->argument [:arg property]))

(def ^:private search-tool
  "A minimal documentable registry entry."
  {:name "search" :description "Search." :scope "agent:content:read" :annotations {:readOnlyHint true} :inputSchema {}})

;;;; Titles

(deftest ^:parallel tool-title-test
  (testing "a tool's own title wins, lowered to the sentence case a heading wants"
    (is (= "Search Metabase content" (#'mcp-tools-dox/tool-title {:name "search" :title "Search Metabase Content"}))))
  (testing "without a title, the snake_case name is spaced out and sentence-cased"
    ;; heading a section `render_drill_through` would read as a slug rather than a name
    (is (= "Render drill through" (#'mcp-tools-dox/tool-title {:name "render_drill_through"})))
    (is (= "Get parameter values" (#'mcp-tools-dox/tool-title {:name "get_parameter_values"}))))
  (testing "acronyms survive the sentence-casing, whichever convention the title came from"
    (is (= "Execute SQL" (#'mcp-tools-dox/tool-title {:name "execute_sql"})))
    (is (= "Execute SQL" (#'mcp-tools-dox/tool-title {:name "execute_sql" :title "Execute Sql"})))))

;;;; From the registry to page data

(deftest ^:parallel tool->entry-test
  (testing "a registry entry becomes a flat map of what the page says about it"
    (is (= {:name        "search"
            :title       "Search"
            :description "Search."
            :scope       {:id "agent:content:read" :description "See your Metabase content and data structure"}
            :effect      :read-only
            :idempotent? false
            :inline-ui?  false
            :arguments   []}
           (#'mcp-tools-dox/tool->entry search-tool))))
  (testing "the description is flattened onto one line and its template syntax fenced from the docs site's Liquid pass"
    ;; `execute_sql` and `document_write` spell out `{{tag}}` and `{% card … %}` in exactly Liquid's syntax
    (is (= "Put values behind {% raw %}{{tag}}{% endraw %} or a {% raw %}{% card id=1 %}{% endraw %} embed."
           (:description (#'mcp-tools-dox/tool->entry
                          (assoc search-tool :description "Put values behind {{tag}} or a\n  {% card id=1 %} embed."))))))
  (testing "a scope no `defscope` registered has no wording"
    (is (= {:id "agent:nope" :description nil}
           (:scope (#'mcp-tools-dox/tool->entry (assoc search-tool :scope "agent:nope"))))))
  (testing "a tool publishing a :_meta :ui block is interactive"
    (is (true? (:inline-ui? (#'mcp-tools-dox/tool->entry
                             (assoc search-tool :_meta {:ui {:resourceUri "ui://metabase/visualize-query.html"}}))))))
  (testing "arguments come out alphabetically, whatever order the schema's map has"
    (is (= ["a" "b" "c"]
           (map :name (:arguments (#'mcp-tools-dox/tool->entry
                                   (assoc search-tool :inputSchema {:properties {:c {} :a {} :b {}}}))))))))

(deftest ^:parallel tool-effect-test
  (are [expected annotations] (= expected (#'mcp-tools-dox/tool-effect {:annotations annotations}))
    :read-only   {:readOnlyHint true}
    ;; `destructiveHint false` is a hint: `document_write` carries it and rewrites whole bodies, so the page
    ;; promises nothing about what a writer won't touch
    :writes      {:destructiveHint false}
    :destructive {:destructiveHint true}
    ;; the registry always merges both hints in; a hand-built map without them says nothing
    nil          {}))

(deftest ^:parallel idempotent-test
  (are [expected annotations] (= expected (:idempotent? (#'mcp-tools-dox/tool->entry
                                                         (assoc search-tool :annotations annotations))))
    ;; idempotence is worth saying about a writer
    true  {:destructiveHint true :idempotentHint true}
    ;; but a read-only tool doesn't stutter about being repeatable
    false {:readOnlyHint true :idempotentHint true}
    ;; and a writer that doesn't claim it gets no line
    false {:destructiveHint false}))

;;;; What the page requires of an entry

(deftest ^:parallel entry-problems-test
  (let [problems (fn [tool] (#'mcp-tools-dox/entry-problems (#'mcp-tools-dox/tool->entry tool)))]
    (testing "a documentable tool has no problems"
      (is (= [] (problems search-tool))))
    (testing "a tool with nothing to say is refused rather than rendered as an empty section"
      (is (=? [#"No description for MCP tool \"search\""] (problems (dissoc search-tool :description)))))
    (testing "a scope no `defscope` registered is refused"
      ;; a scope string the consent screen can't explain is a bug, not a page to publish
      (is (=? [#"uses scope \"agent:nope\", which no defscope describes"] (problems (assoc search-tool :scope "agent:nope")))))
    (testing "every problem is reported, not just the first"
      (is (= 2 (count (problems {:name "nope"})))))))

(deftest ^:parallel page-problems-test
  (let [entries (fn [& tools] (map #'mcp-tools-dox/tool->entry tools))]
    (testing "an empty registry is a problem rather than a page with no tools"
      (is (=? [#"No MCP tools found"] (#'mcp-tools-dox/page-problems []))))
    (testing "one bad tool fails the page, naming it"
      (is (=? [#"MCP tool \"nope\" uses scope \"agent:nope\""]
              (#'mcp-tools-dox/page-problems (entries search-tool (assoc search-tool :name "nope" :scope "agent:nope"))))))
    (testing "a documentable set has none"
      (is (= [] (#'mcp-tools-dox/page-problems (entries search-tool)))))))

;;;; Facts

(deftest ^:parallel facts-bullets-test
  (let [bullets (fn [tool] (#'mcp-tools-dox/facts-bullets (#'mcp-tools-dox/tool->entry tool)))]
    (testing "the scope is published with the wording the consent screen uses"
      (is (= (str "- Tool name: `search`\n"
                  "- Permission scope: `agent:content:read` — See your Metabase content and data structure\n"
                  "- Read-only.")
             (bullets search-tool))))
    (testing "a scope with no wording contributes no bullet"
      (is (not (str/includes? (bullets (assoc search-tool :scope "agent:nope")) "Permission scope"))))
    (testing "a writer says what it does to data, and whether repeating it is safe"
      (is (= (str "- Tool name: `search`\n"
                  "- Can overwrite or delete existing data or content.\n"
                  "- Running it again with the same arguments has the same effect as running it once.")
             (bullets (assoc search-tool :scope "agent:nope" :annotations {:destructiveHint true :idempotentHint true})))))
    (testing "an interactive tool says so; the page has no section grouping such tools, so each one says it for itself"
      (is (str/includes? (bullets (assoc search-tool :_meta {:ui {:resourceUri "ui://x"}})) "- Interactive:"))
      (is (not (str/includes? (bullets search-tool) "Interactive:"))))))

;;;; Argument types

(deftest ^:parallel type-cell-test
  (are [expected property] (= expected (#'mcp-tools-dox/type-cell (argument property)))
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
    ;; and a `:multi` of objects drops the wrapper's prose along with its branches'
    ["The list."]   {:type "array" :description "The list."
                     :items {:description "One op." :oneOf [{:type "object" :description "Op A."}]}}
    ;; nested arrays are read all the way down
    ["Row." "Cell."] {:type "array" :description "Row." :items {:type "array" :items {:type "string" :description "Cell."}}}
    ;; but a nullable object argument keeps its prose — that's the property's own shape, not a nested one
    ["Chain filtering."] {:oneOf [{:type "object" :description "Chain filtering."} {:type "null"}]}
    []              {:type "string"}))

(deftest ^:parallel enum-values-test
  (are [expected property] (= expected (#'mcp-tools-dox/enum-values property))
    ["create" "update"] {:type "string" :enum ["create" "update"]}
    ["create" "update"] {:oneOf [{:type "string" :enum ["create" "update"]} {:type "null"}]}
    ["a" "b"]           {:type "array" :items {:type "string" :enum ["a" "b"]}}
    ;; object elements are opaque to the cell, enums included
    []                  {:type "array" :items {:type "object" :enum ["a"]}}
    []                  {:type "string"}))

(deftest ^:parallel numeric-range-test
  (are [expected property] (= expected (#'mcp-tools-dox/numeric-range property))
    {:minimum 1 :maximum 10} {:type "integer" :minimum 1 :maximum 10}
    ;; `[:maybe [:int {:min 1 :max 10}]]` — the shape of every optional v2 argument
    {:minimum 1 :maximum 10} {:oneOf [{:type "integer" :minimum 1 :maximum 10} {:type "null"}]}
    ;; `[:int {:min 1}]` — every positive-int id; a floor alone tells the reader nothing
    nil                      {:type "integer" :minimum 1}
    nil                      {:oneOf [{:type "integer" :minimum 0} {:type "null"}]}
    ;; a bounded string publishes `minLength`, which is not a range
    nil                      {:type "string" :minLength 1 :maxLength 21}
    nil                      {:type "integer"}))

(deftest ^:parallel description-cell-test
  (are [expected property] (= expected (#'mcp-tools-dox/description-cell (argument property)))
    ;; an enum publishes what it accepts ahead of its prose: the v2 surface dispatches on these, so the
    ;; members are the argument's real documentation
    "One of: `create`, `update`. What to do."  {:type "string" :enum ["create" "update"] :description "What to do."}
    ;; a bounded integer publishes its range after any enum and ahead of its prose — `depth`'s prose says
    ;; "default 2" and stops, and the ceiling is only in the schema
    "Range: 1 to 10. Levels (default 2)."      {:oneOf [{:type "integer" :minimum 1 :maximum 10
                                                         :description "Levels (default 2)."}
                                                        {:type "null"}]}
    ;; a description buried in a nullable branch is found rather than dashed out: the shape of every optional
    ;; v2 argument
    "Max rows."                                {:oneOf [{:type "integer" :description "Max rows."} {:type "null"}]}
    ;; and one on an array's items
    "A keyword query."                         {:type "array" :items {:type "string" :description "A keyword query."}}
    ;; prose is flattened and Liquid-fenced
    "Use {% raw %}{{tag}}{% endraw %}."        {:type "string" :description "Use\n  {{tag}}."}
    ;; nothing at all is an em dash, not an empty cell
    "—"                                        {:type "string"}))

(deftest ^:parallel arguments-markdown-test
  (let [markdown (fn [input-schema]
                   (#'mcp-tools-dox/arguments-markdown (#'mcp-tools-dox/tool->entry (assoc search-tool :inputSchema input-schema))))]
    (testing "a tool with no properties says so rather than rendering an empty table"
      (is (= "This tool takes no arguments." (markdown {}))))
    (testing "each argument is a row of name, type, description, with a dash where the schema carries none"
      (is (= [["`id`" "integer" "The ID."]
              ["`prompt`" "string" "—"]]
             (map #'mcp-tools-dox/argument-row
                  (:arguments (#'mcp-tools-dox/tool->entry
                               (assoc search-tool :inputSchema {:properties {:id     {:type "integer" :description "The ID."}
                                                                             :prompt {:type ["string" "null"]}}})))))))
    (testing "the schema's `:required` is not published"
      ;; `strict-tool-input-schema` lists every property there so strict clients can send an explicit null, so it
      ;; can't tell a required argument from an optional one
      (is (not (str/includes? (markdown {:properties {:id {:type "integer"}} :required [:id]}) "Required"))))
    (testing "a pipe in a description doesn't split the row"
      (is (str/includes? (markdown {:properties {:q {:type "string" :description "a | b"}}}) "a \\| b")))
    (testing "template syntax in a description is Liquid-fenced before the column is padded"
      (let [table (markdown {:properties {:sql {:type "string" :description "Use {{tag}}."}
                                          :x   {:type "string" :description "Short."}}})]
        (is (str/includes? table "| Use {% raw %}{{tag}}{% endraw %}. |"))
        (testing "so the shorter cell is padded to the fenced width"
          (is (str/includes? table "| Short.                            |")))))))

;;;; Which tools land on the page

(deftest documented-tools-test
  (let [tools (documented-tools)]
    (is (seq tools))
    (testing "a tool the MCP App calls for itself is left off the page"
      ;; the model never calls `refresh_ui_credential`; it takes no arguments and returns a credential
      (is (not (some #(= "refresh_ui_credential" (:name %)) tools)))
      (is (some #(= "refresh_ui_credential" (:name %)) (v2.registry/all-tool-entries))
          "no registered tool is named refresh_ui_credential; pick another app-only tool to guard against"))
    (testing "every tool carries a scope some defscope can explain"
      ;; `register-tool!` pins it to a non-blank string; this pins it to one the consent screen has wording for
      (doseq [{:keys [name scope]} tools]
        (is (string? scope) (str "no scope for " name))
        (is (api-scope/registered-scope? scope) (str name " uses unregistered scope " (pr-str scope)))))
    (testing "the page covers everything a fully-authorized client can be offered to a model"
      (is (every? (set (map :name tools))
                  (->> (v2.registry/list-tools nil {:supports-mcp-ui? true})
                       (remove #'mcp-tools-dox/app-only?)
                       (map :name)))))
    (testing "the MCP Apps tools are the ones carrying a :_meta :ui block, which is how the page flags them"
      ;; `:inline-ui?` keys off `:_meta`; keep it in step with the extension the tool actually requires
      (doseq [{:keys [name _meta required-extensions]} tools]
        (is (= (contains? (set required-extensions) :mcp-app-ui) (some? (:ui _meta)))
            (str name " disagrees about being an MCP Apps tool"))))))

(deftest all-arguments-described-test
  (testing "every top-level argument of every tool carries a description the page can show"
    ;; `description-cell` renders an em dash when a schema says nothing. Prose on the keys of a nested object is
    ;; unreachable by design (see `documented-elements`), so an array of objects needs it on the `:sequential`
    ;; wrapper and a nested map on the `:map` itself; anything else wants it on the innermost schema.
    (doseq [{tool-name :name :keys [arguments]} (map #'mcp-tools-dox/tool->entry (documented-tools))
            {:keys [name] :as argument}         arguments]
      (is (not= "—" (#'mcp-tools-dox/description-cell argument))
          (str tool-name " argument " name " has no description")))))

(deftest ^:parallel document-markdown-test
  (testing "the page is the intro, then a section per tool, ending in one newline"
    (let [markdown (#'mcp-tools-dox/document-markdown "intro" [(#'mcp-tools-dox/tool->entry search-tool)])]
      (is (str/starts-with? markdown "intro\n\n## Search\n"))
      (is (str/ends-with? markdown "This tool takes no arguments.\n")))))

;;;; End to end

(deftest generate-dox-test
  (mt/with-temp-file [path]
    (let [{:keys [tools]} (mcp-tools-dox/generate-dox! path)
          markdown        (slurp path)
          documented      (documented-tools)]
      (testing "reports what it wrote"
        (is (= (count documented) tools))
        (is (pos? tools)))
      (testing "the intro template is included"
        (is (str/starts-with? markdown "---\ntitle: MCP server tools")))
      (testing "every registered tool gets a section"
        ;; the point of the page: a `deftool` can't quietly go undocumented
        (doseq [t documented]
          (is (str/includes? markdown (str "\n## " (#'mcp-tools-dox/tool-title t) "\n"))
              (str "no section for " (:name t)))
          (is (str/includes? markdown (str "Tool name: `" (:name t) "`"))
              (str "no tool name for " (:name t)))))
      (testing "tools are not grouped: every heading is a tool's own, and nothing nests beneath one"
        (let [titles (set (map #'mcp-tools-dox/tool-title documented))]
          (doseq [heading (map second (re-seq #"(?m)^## (.*)$" markdown))]
            (is (contains? titles heading) (str "heading is not a tool: " heading))))
        (is (not (str/includes? markdown "\n### "))))
      (testing "tools run in name order"
        ;; `all-tool-entries` name-sorts; the page keeps that rather than imposing an order of its own
        (let [positions (map #(str/index-of markdown (str "\n## " (#'mcp-tools-dox/tool-title %) "\n")) documented)]
          (is (apply < positions))))
      (testing "an interactive tool says so, and a plain one doesn't"
        (let [section-of (fn [title]
                           (-> (str/split markdown (re-pattern (str "\n## " title "\n")))
                               second
                               (str/split #"\n## ")
                               first))]
          (is (str/includes? (section-of "Visualize query") "Interactive:"))
          (is (not (str/includes? (section-of "Search") "Interactive:")))))
      (testing "each section runs facts, then description, then arguments"
        (let [section (second (str/split markdown #"\n## Search\n"))]
          (is (< (str/index-of section "Tool name:")
                 (str/index-of section "Permission scope:")
                 (str/index-of section "Arguments:")))))
      (testing "scopes are published with the consent screen's wording"
        (is (str/includes? markdown "Permission scope: `agent:content:read`")))
      (testing "arguments are listed without claiming which are required"
        ;; the strict-transformed schema lists every property in `:required`, so a column read from it would mark
        ;; them all. Checks the header rows, not the whole page — a description may legitimately open with
        ;; "Required on create", and `collection_write`'s `name` does.
        (is (not (re-find #"(?m)^\| Argument .*\bRequired\b.*\|$" markdown))))
      (testing "argument prose survives the nullable wrapper every v2 argument has"
        ;; an optional v2 argument carries its prose on the nullable branch, not on the property
        (let [section (second (str/split markdown #"\n## Search\n"))]
          (is (str/includes? section "| `limit`"))
          (is (not (re-find #"\| `limit`\s+\| integer\s+\| —" section)))))
      (testing "an action hub publishes the actions it dispatches on"
        (let [section (second (str/split markdown #"\n## Browse data\n"))]
          (is (str/includes? section "`list_databases`"))))
      (testing "an array-of-objects argument carries only its own prose, not every element's"
        ;; `ops` is a union of two dozen op objects, each with a sentence; only the array's own belongs in the cell
        (let [section (second (str/split markdown #"\n## Dashboard write\n"))
              ops-row (re-find #"(?m)^\| `ops` .*$" section)]
          (is (some? ops-row))
          (is (< (count ops-row) 400) ops-row)
          (is (not (str/includes? ops-row "Add a tab.")))
          (is (not (str/includes? ops-row "One editor operation")))))
      (testing "the app-only credential tool has no section"
        (is (not (str/includes? markdown "refresh_ui_credential"))))
      (testing "no unfenced Liquid reaches the page"
        ;; the docs site rejects `{% card %}` outright and renders `{{tag}}` as nothing; the intro is hand-written
        ;; and may carry a real `{% include %}`, so only the generated sections are held to this
        (let [generated (subs markdown (str/index-of markdown "\n## "))
              unfenced  (str/replace generated #"\{% raw %\}.*?\{% endraw %\}" "")]
          (is (not (re-find #"\{\{|\{%" unfenced)))
          (testing "and the fencing was exercised, not vacuous"
            ;; `execute_sql` quotes `{{tag}}`; if that tool stops doing so, pick another that quotes template syntax
            (is (str/includes? generated "{% raw %}{{tag}}{% endraw %}")))))
      (testing "the page ends with exactly one newline"
        (is (str/ends-with? markdown "\n"))
        (is (not (str/ends-with? markdown "\n\n")))))))
