(ns metabase.cmd.mcp-tools-dox
  "Generate the reference page for the tools Metabase's MCP server exposes, by running

    clojure -M:ee:doc mcp-tools-documentation

  The page is written from the registry's manifest — the same tool entries a client receives from `tools/list`, plus
  the `:scope` that answer strips. Each tool is first read into a plain map by [[tool->entry]]; everything after that
  renders those maps. A tool's own description is written for the model and stays off the page; the argument notes
  are the prose readers get."
  (:require
   [clojure.string :as str]
   [metabase.cmd.common :as cmd.common]
   [metabase.cmd.markdown :as md]
   ;; Required for its side effect: loading it loads every tool namespace, which registers itself.
   [metabase.mcp.v2.api]
   [metabase.mcp.v2.registry :as v2.registry]))

(set! *warn-on-reflection* true)

(def ^:private output-path "docs/ai/mcp-tools.md")

(def ^:private intro-resource "metabase/cmd/resources/mcp-tools-intro.md")

;;;; Which tools belong on the page

(defn- app-only?
  "Is `tool` one the MCP App calls for itself rather than one a model chooses? Such tools stay off the page."
  [tool]
  (boolean (some #{"app"} (get-in tool [:_meta :ui :visibility]))))

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

(defn- documented-elements
  "The element schemas of an array `schema` whose prose and enums belong in the property's table cell. Elements that
  can be objects contribute nothing: the cell can't show their shape."
  [schema]
  (->> (alternatives schema)
       (keep :items)
       (remove #(some object-typed? (alternatives %)))))

(defn- documented-schemas
  "Every schema a property's cell reads: the property's own alternatives, then those of its [[documented-elements]],
  however deeply nested."
  [property]
  (mapcat alternatives (tree-seq map? documented-elements property)))

(defn- property-descriptions
  "Every non-blank description among a property's [[documented-schemas]], in order and deduped."
  [property]
  (into [] (comp (keep :description) (remove str/blank?) (distinct)) (documented-schemas property)))

(defn- enum-values
  "The enum members among a property's [[documented-schemas]], deduped. For an action hub like `browse_data`, the
  enum is the argument's real documentation."
  [property]
  (into [] (comp (mapcat :enum) (distinct)) (documented-schemas property)))

(defn- own-bounds
  "A schema's own `{:minimum :maximum}`, when it has both. A lone minimum, as on every positive-int id, isn't worth
  showing."
  [{:keys [minimum maximum]}]
  (when (and minimum maximum)
    {:minimum minimum :maximum maximum}))

(defn- numeric-range
  "The first [[own-bounds]] among a property's alternatives."
  [property]
  (some own-bounds (alternatives property)))

;;;; From the registry to page data

(defn- page-prose
  "Registry prose flattened to one line and Liquid-escaped, or nil when blank. Applied where registry text enters an
  entry, so the table is padded after escaping and its columns stay aligned. Not for the intro resource, which may
  use Liquid for real."
  [s]
  (some-> (md/flatten-prose s) md/escape-liquid))

(defn- property->argument
  "One argument as data, from its `[name property]` entry."
  [[k property]]
  {:name          (name k)
   :types         (property-types property)
   :element-types (element-types property)
   :enum          (enum-values property)
   :range         (numeric-range property)
   :descriptions  (mapv page-prose (property-descriptions property))})

(defn- tool-title
  "The section heading: the tool's `:title`, else its name with underscores spaced out; sentence-cased either way."
  [{:keys [title] :as tool}]
  (md/sentence-case (or title (str/replace (:name tool) "_" " "))))

(defn- tool-effect
  "What the tool's annotations promise about its effects: `:read-only`, `:destructive`, or `:writes`. Nil when the
  annotations carry neither hint."
  [{{:keys [readOnlyHint destructiveHint]} :annotations}]
  (cond
    readOnlyHint             :read-only
    destructiveHint          :destructive
    (false? destructiveHint) :writes))

(defn- tool->entry
  "Everything the page says about `tool`, as data. `:scope` carries the consent screen's English wording under
  `:description`, the same label the manifest uses, or nil when no `defscope` registered the scope."
  [{tool-name :name :keys [scope inputSchema annotations] :as tool}]
  (let [{:keys [readOnlyHint idempotentHint]} annotations]
    {:name        tool-name
     :title       (tool-title tool)
     :scope       {:id scope :description (page-prose (v2.registry/english-scope-label scope))}
     :effect      (tool-effect tool)
     ;; a read is trivially repeatable, so idempotence is only worth saying about a writer
     :idempotent? (boolean (and idempotentHint (not readOnlyHint)))
     :inline-ui?  (some? (get-in tool [:_meta :ui]))
     ;; alphabetical, so the table doesn't churn with map order
     :arguments   (mapv property->argument (sort-by (comp name key) (:properties inputSchema)))}))

;;;; What the page requires of an entry

(defn- entry-problems
  "Why `entry` can't be documented, as messages."
  [{entry-name :name :keys [scope]}]
  (cond-> []
    (nil? (:description scope))
    (conj (str "MCP tool " (pr-str entry-name) " uses scope " (pr-str (:id scope))
               ", which no defscope describes. Declare it with metabase.api-scope.core/defscope."))))

(defn- page-problems
  "Why the page can't be written from `entries`: an empty registry, or any entry's [[entry-problems]]. Empty when it
  can."
  [entries]
  (if (empty? entries)
    [(str "No MCP tools found; the v2 registry is empty, so metabase.mcp.v2.api either no longer requires the tool "
          "namespaces or no longer loads")]
    (into [] (mapcat entry-problems) entries)))

;;;; Rendering an entry

(def ^:private effect-sentences
  "The bullet for each [[tool-effect]]."
  {:read-only   "Read-only."
   :destructive "Can overwrite or delete existing data or content."
   ;; a hint, not a contract: `document_write` carries it and rewrites whole bodies
   :writes      "Creates or changes content."})

(defn- facts-bullets
  "The bullets under a tool's heading: how to call it, what it needs, what it does to your data."
  [{entry-name :name :keys [scope effect idempotent? inline-ui?]}]
  (md/bullets
   [(str "Tool name: " (md/code entry-name))
    (when-let [scope-description (:description scope)]
      (str "Permission scope: " (md/code (:id scope)) " — " scope-description))
    (effect-sentences effect)
    (when idempotent?
      "Running it again with the same arguments has the same effect as running it once.")
    ;; clients that can't render an iframe never list such a tool
    (when inline-ui?
      (str "Interactive: renders a chart inline in your AI client. Only available in clients that support inline "
           "visualizations."))]))

(defn- array-type-cell
  "`array of X` for a homogeneous array, else `array`."
  [{:keys [element-types]}]
  (if (= 1 (count element-types))
    (str "array of " (first element-types))
    "array"))

(defn- type-cell
  "The Type column: `any` when unconstrained, [[array-type-cell]] for an array, else the types joined by `or`."
  [{:keys [types] :as argument}]
  (cond
    (empty? types)      "any"
    (= ["array"] types) (array-type-cell argument)
    :else               (str/join " or " types)))

(defn- enum-sentence
  "\"One of: `a`, `b`.\" — or nil for an argument with no enum."
  [{:keys [enum]}]
  (when (seq enum)
    (str "One of: " (str/join ", " (map md/code enum)) ".")))

(defn- range-sentence
  "\"Range: 1 to 10.\" — or nil for an argument without a range."
  [{:keys [range]}]
  (when-let [{:keys [minimum maximum]} range]
    (format "Range: %s to %s." minimum maximum)))

(defn- description-cell
  "The Description column: enum, then range, then prose. An em dash when the schema says nothing."
  [{:keys [descriptions] :as argument}]
  (or (not-empty (md/sentences (list* (enum-sentence argument) (range-sentence argument) descriptions)))
      "—"))

(defn- argument-row
  "One table row."
  [{:keys [name] :as argument}]
  [(md/code name) (type-cell argument) (description-cell argument)])

(defn- arguments-markdown
  "The arguments as a table. No `Required` column: the strict schema lists every property as required so clients can
  send explicit nulls."
  [{:keys [arguments]}]
  (if (empty? arguments)
    "This tool takes no arguments."
    (md/table ["Argument" "Type" "Description"] (map argument-row arguments))))

(defn- tool-section
  "One tool's section: heading, facts, arguments."
  [{:keys [title] :as entry}]
  (md/paragraphs
   [(md/heading 2 title)
    (facts-bullets entry)
    (md/labeled-block "Arguments:" (arguments-markdown entry))]))

(defn- document-markdown
  "The intro, then a section per entry."
  [intro entries]
  (md/document (cons intro (map tool-section entries))))

;;;; Entry point

(defn generate-dox!
  "Write the MCP tool reference to `path`, defaulting to `docs/ai/mcp-tools.md`. Returns `{:path ... :tools n}`.
  Throws when any tool has [[entry-problems]]."
  ([]
   (generate-dox! output-path))
  ([path]
   (printf "Generating MCP tool documentation in %s\n" path)
   (let [entries  (into [] (comp (remove app-only?) (map tool->entry)) (v2.registry/all-tool-entries))
         problems (page-problems entries)]
     (when (seq problems)
       (throw (ex-info (str/join "\n" problems) {:problems problems})))
     (cmd.common/write-doc-file! path (document-markdown (cmd.common/load-resource! intro-resource) entries))
     (printf "Wrote %s (%d tools)\n" path (count entries))
     (println "Done.")
     {:path path :tools (count entries)})))
