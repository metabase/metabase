(ns metabase.cmd.mcp-tools-dox
  "Generate the reference page for the tools Metabase's MCP server exposes, by running

    clojure -M:ee:doc mcp-tools-documentation

  The page is written from [[documented-tools]] — the same manifest a client receives from `tools/list`, plus the
  `:scope` that answer strips."
  (:require
   [clojure.string :as str]
   [metabase.api-scope.core :as api-scope]
   [metabase.cmd.common :as cmd.common]
   [metabase.cmd.markdown :as md]
   ;; Required for its side effect: loading it loads every tool namespace, which registers itself.
   [metabase.mcp.v2.api]
   [metabase.mcp.v2.registry :as v2.registry]))

(set! *warn-on-reflection* true)

(def ^:private output-path "docs/ai/mcp-tools.md")

(def ^:private intro-resource "metabase/cmd/resources/mcp-tools-intro.md")

;;;; Which tools belong on the page

(defn- renders-inline-ui?
  "Does `tool` render an inline chart in the AI client?"
  [tool]
  (some? (get-in tool [:_meta :ui])))

(defn- app-only?
  "Don't document app-only tools."
  [tool]
  (boolean (some #{"app"} (get-in tool [:_meta :ui :visibility]))))

(defn- documented-tools
  "Every tool the MCP server publishes for a model to call, name-sorted, each with its `:scope`."
  []
  (remove app-only? (v2.registry/all-tool-entries)))

;;;; What the page requires of a tool

(defn- tool-problems
  "Why `tool` can't be documented, as messages."
  [{tool-name :name :keys [description scope]}]
  (cond-> []
    (str/blank? description)
    (conj (str "No description for MCP tool " (pr-str tool-name) ". Give its deftool a docstring."))

    (not (api-scope/registered-scope? scope))
    (conj (str "MCP tool " (pr-str tool-name) " uses unregistered scope " (pr-str scope)
               ". Declare it with metabase.api-scope.core/defscope."))))

(defn- assert-documentable
  "Throw when `tools` is empty or any tool has [[tool-problems]]."
  [tools]
  (when (empty? tools)
    (throw (ex-info (str "No MCP tools found; the v2 registry is empty, so metabase.mcp.v2.api either no longer "
                         "requires the tool namespaces or no longer loads")
                    {})))
  (when-let [problems (seq (mapcat tool-problems tools))]
    (throw (ex-info (str/join "\n" problems) {:problems (vec problems)}))))

;;;; Facts about one tool

(def ^:private fixed-case-words
  "Words that keep their capitalization in a sentence-cased title, keyed by lowercase form."
  {"sql"      "SQL"
   "url"      "URL"
   "uri"      "URI"
   "api"      "API"
   "ui"       "UI"
   "id"       "ID"
   "mbql"     "MBQL"
   "metabase" "Metabase"})

(defn- sentence-case
  "`title` with the first word capitalized and the rest lowered, except for [[fixed-case-words]]."
  [title]
  (->> (str/split title #" ")
       (map-indexed (fn [i word]
                      (let [lowered (str/lower-case word)]
                        (or (get fixed-case-words lowered)
                            (if (zero? i)
                              (str/capitalize lowered)
                              lowered)))))
       (str/join " ")))

(defn- tool-title
  "The section heading: the tool's `:title`, else its name with underscores spaced out; sentence-cased either way."
  [{:keys [title] :as tool}]
  (sentence-case (or title (str/replace (:name tool) "_" " "))))

(defn- page-prose
  "Registry prose flattened to one line and Liquid-escaped. Not for the intro resource, which may use Liquid."
  [s]
  (some-> (md/flatten-prose s) md/escape-liquid))

(defn- tool-description
  "The tool's description, as one line of prose."
  [tool]
  (page-prose (:description tool)))

(defn- name-bullet
  "How to call the tool."
  [tool]
  (str "Tool name: " (md/code (:name tool))))

(defn- scope-bullet
  "The scope the tool needs, with the consent screen's wording. Nil for an unregistered scope."
  [{:keys [scope]}]
  (when-let [description (page-prose (api-scope/scope-description scope))]
    (str "Permission scope: " (md/code scope) " — " description)))

(defn- effect-bullet
  "What the tool's annotations promise about its effects. The registry always sets both hints."
  [{{:keys [readOnlyHint destructiveHint]} :annotations}]
  (cond
    readOnlyHint             "Read-only."
    destructiveHint          "Can overwrite or delete existing data or content."
    ;; a hint, not a contract: `document_write` carries it and rewrites whole bodies
    (false? destructiveHint) "Creates or changes content."))

(defn- idempotence-bullet
  "Idempotence, for tools that write. A read is trivially repeatable."
  [{{:keys [readOnlyHint idempotentHint]} :annotations}]
  (when (and idempotentHint (not readOnlyHint))
    "Running it again with the same arguments has the same effect as running it once."))

(defn- inline-ui-bullet
  "Flags a tool that renders inline. Clients that can't render an iframe never list such a tool."
  [tool]
  (when (renders-inline-ui? tool)
    (str "Interactive: renders a chart inline in your AI client. Only available in clients that support inline "
         "visualizations.")))

(defn- tool-facts
  "The bullets under a tool's heading; nils are dropped."
  [tool]
  (md/bullets [(name-bullet tool)
               (scope-bullet tool)
               (effect-bullet tool)
               (idempotence-bullet tool)
               (inline-ui-bullet tool)]))

;;;; Reading a property's JSON Schema
;;;;
;;;; Malli puts an argument's description, enum and bounds on the wrapped schema, not the property:
;;;; `[:maybe [:int {:description ...}]]` publishes `{:oneOf [{:type "integer" :description ...} {:type "null"}]}`.
;;;; Everything below reads through those alternatives.

(defn- union-branches
  "The `oneOf`/`anyOf` alternatives of `schema`."
  [{:keys [oneOf anyOf]}]
  (concat oneOf anyOf))

(defn- alternatives
  "`schema` and every schema its unions reach, preorder. Does not descend into `:items`."
  [schema]
  (tree-seq map? union-branches schema))

(defn- own-types
  "A schema's own `:type` members, minus `null`, which marks an optional argument rather than a value."
  [{:keys [type]}]
  ;; a set used as a predicate can't reject nil
  (when type
    (remove #{"null"} (if (coll? type) type [type]))))

(defn- object-typed?
  "Does the schema's own `:type` include `object`?"
  [schema]
  (boolean (some #{"object"} (own-types schema))))

(defn- property-types
  "The JSON Schema types a property accepts, distinct and in order."
  [property]
  (into [] (comp (mapcat own-types) (distinct)) (alternatives property)))

(defn- element-types
  "The types an array's elements accept. A nullable array keeps `:items` in its non-null branch."
  [property]
  (into [] (comp (keep :items) (mapcat property-types) (distinct)) (alternatives property)))

(defn- element-descriptions
  "Descriptions of an array's elements. Object elements contribute nothing: the table can't show their shape, and
  `dashboard_write`'s `ops` would otherwise put two dozen op sentences in one cell."
  [items]
  (keep :description (remove object-typed? (alternatives items))))

(defn- property-descriptions
  "Every description on a property, its alternatives, and its elements, in order and deduped."
  [property]
  (let [own (alternatives property)]
    (into []
          (comp cat (remove str/blank?) (distinct))
          [(keep :description own)
           (mapcat element-descriptions (keep :items own))])))

(defn- enum-values
  "The enum members of a property, its alternatives, and its elements, deduped. For an action hub like
  `browse_data`, the enum is the argument's real documentation."
  [property]
  (let [own (alternatives property)]
    (into []
          (comp cat (distinct))
          [(mapcat :enum own)
           (mapcat enum-values (keep :items own))])))

(defn- own-bounds
  "A schema's own `{:minimum :maximum}`, when it has both. A lone minimum, as on every positive-int id, isn't worth showing."
  [{:keys [minimum maximum]}]
  (when (and minimum maximum)
    {:minimum minimum :maximum maximum}))

(defn- numeric-range
  "The first [[own-bounds]] among a property's alternatives."
  [property]
  (some own-bounds (alternatives property)))

;;;; The arguments table

(defn- type-cell
  "The Type column: `any` when unconstrained, `array of X` for a homogeneous array, else the types joined by `or`."
  [property]
  (let [types (property-types property)]
    (cond
      (empty? types)      "any"
      (= ["array"] types) (let [item-types (element-types property)]
                            (if (= 1 (count item-types))
                              (str "array of " (first item-types))
                              "array"))
      :else               (str/join " or " types))))

(defn- enum-sentence
  "\"One of: `a`, `b`.\" — or nil for a property with no enum."
  [property]
  (when-let [values (seq (enum-values property))]
    (str "One of: " (str/join ", " (map md/code values)) ".")))

(defn- range-sentence
  "\"Range: 1 to 10.\" — or nil for a property without both bounds."
  [property]
  (when-let [{:keys [minimum maximum]} (numeric-range property)]
    (format "Range: %s to %s." minimum maximum)))

(defn- description-cell
  "The Description column: enum, then range, then prose. An em dash when the schema says nothing."
  [property]
  (or (not-empty (md/sentences [(enum-sentence property)
                                (range-sentence property)
                                (md/sentences (map page-prose (property-descriptions property)))]))
      "—"))

(defn- argument-row
  "One table row from a `[name property]` entry."
  [[k property]]
  [(md/code (name k))
   (type-cell property)
   (description-cell property)])

(defn- arguments-markdown
  "The top-level arguments as a table, alphabetical so the page doesn't churn with map order. No `Required`
  column: the strict schema lists every property as required so clients can send explicit nulls."
  [{:keys [inputSchema]}]
  (let [properties (:properties inputSchema)]
    (if (empty? properties)
      "This tool takes no arguments."
      (md/table ["Argument" "Type" "Description"]
                (map argument-row (sort-by (comp name key) properties))))))

;;;; Sections

(defn- tool-section
  "One tool's section: heading, facts, description, arguments. All of it comes from the registry."
  [tool]
  (md/paragraphs
   [(md/heading 2 (tool-title tool))
    (tool-facts tool)
    (md/sentence (tool-description tool))
    (md/labeled-block "Arguments:" (arguments-markdown tool))]))

(defn- document-markdown
  "The intro, then a section per tool in name order."
  [intro tools]
  (md/document (cons intro (map tool-section tools))))

;;;; Entry point

(defn generate-dox!
  "Write the MCP tool reference to `path`, defaulting to `docs/ai/mcp-tools.md`. Returns `{:path ... :tools n}`."
  ([]
   (generate-dox! output-path))
  ([path]
   (printf "Generating MCP tool documentation in %s\n" path)
   (let [tools (documented-tools)
         n     (count tools)]
     (assert-documentable tools)
     (cmd.common/write-doc-file! path (document-markdown (cmd.common/load-resource! intro-resource) tools))
     (printf "Wrote %s (%d tools)\n" path n)
     (println "Done.")
     {:path path :tools n})))
