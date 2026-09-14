(ns metabase.cmd.mcp-tools-dox
  "Generate the reference page for the tools Metabase's MCP server exposes, by running

    clojure -M:ee:doc mcp-tools-documentation

  The page is written from [[all-tools]] — the same manifest a client receives from `tools/list`, plus the
  `:scope` that answer strips."
  (:require
   [clojure.string :as str]
   [metabase.api-scope.core :as api-scope]
   [metabase.cmd.common :as cmd.common]
   [metabase.cmd.markdown :as md]
   ;; Tools self-register with `deftool` when their namespace loads, and `metabase.mcp.v2.api` is the one
   ;; place that requires all of them. Required for that side effect: without it the registry is empty.
   [metabase.mcp.v2.api]
   [metabase.mcp.v2.registry :as v2.registry]))

(set! *warn-on-reflection* true)

(def ^:private output-path "docs/ai/mcp-tools.md")

(def ^:private intro-resource "metabase/cmd/resources/mcp-tools-intro.md")

(def ^:private sections
  "The page's sections, in order, each with the predicate that claims a tool for it. A tool lands in the first
  section whose `:claims?` says yes."
  [{:heading "Interactive tools"
    :blurb   (str "These render inline charts in your AI client. They only work in clients that support inline "
                  "visualizations. Such a client may also list a helper tool the chart calls for itself; it "
                  "isn't documented here because the model never calls it.")
    ;; A UI tool is recognized by the `:_meta` `:ui` block it publishes rather than by its
    ;; `:required-extensions`, because `:_meta` is the half a client actually sees.
    ;; `metabase.cmd.mcp-tools-dox-test/all-tools-test` pins the two to the same set.
    :claims? #(some? (get-in % [:_meta :ui]))}
   {:heading "Read-only tools"
    :blurb   "These read from your Metabase. They don't create, change, or delete anything."
    :claims? #(true? (get-in % [:annotations :readOnlyHint]))}
   {:heading "Write and delete tools"
    :blurb   (str "These create or change content in your Metabase. Like every tool here, they're scoped to what "
                  "you have permission to do.")
    :claims? (constantly true)}])

;;;; Which tools belong on the page

(defn- app-only?
  "Is `tool` one the MCP App calls for itself rather than one the model chooses? `refresh_ui_credential` marks
  itself so with the `:_meta` `:ui` `:visibility` hint. It takes no arguments and returns a credential, so a
  section for it would document nothing a reader can act on."
  [tool]
  (boolean (some #{"app"} (get-in tool [:_meta :ui :visibility]))))

(defn- all-tools
  "Every tool the MCP server publishes for a model to call, name-sorted, each with its `:scope`.

  Reads [[v2.registry/all-tool-entries]] rather than [[v2.registry/list-tools]]. The two agree on which tools
  exist and on the `:inputSchema` and `:annotations` each publishes, but `list-tools` answers for one session:
  it strips `:scope`, which is half of what this page is for; it hides the MCP Apps tools from a client that
  can't render them; and it drops whatever an admin listed in `mcp-v2-disabled-tools`. None of those are
  reasons for a tool to be missing from the reference. Being [[app-only?]] is."
  []
  (remove app-only? (v2.registry/all-tool-entries)))

;;;; Facts about one tool

(def ^:private preserved-words
  "Words that keep their own capitalization when a title is lowered to sentence case, keyed by their lowercase form.
  Two kinds: acronyms, which the Title Case conventions upstream of this page get wrong anyway — the fallback in
  [[tool-title]] capitalizes a tool name word by word, turning `execute_sql` into `Execute Sql` — and the proper
  nouns an explicit `:title` spells out."
  {"sql"      "SQL"
   "url"      "URL"
   "uri"      "URI"
   "api"      "API"
   "ui"       "UI"
   "id"       "ID"
   "mbql"     "MBQL"
   "metabase" "Metabase"})

(defn- sentence-case
  "`title` in the sentence case the docs style guide asks of a heading: the first word capitalized, the rest lowered,
  except for the [[preserved-words]]. Whole words only, so a `Validate Idea` keeps its `idea`."
  [title]
  (->> (str/split title #" ")
       (map-indexed (fn [i word]
                      (let [lowered (str/lower-case word)]
                        (or (get preserved-words lowered)
                            (if (zero? i)
                              (str/capitalize lowered)
                              lowered)))))
       (str/join " ")))

(defn- tool-title
  "The heading a tool's section gets. No v2 `deftool` spells out a `:title` today, so in practice this always
  title-cases the tool's snake_case name rather than heading a section with a bare slug; the `:title` branch is
  there because `tools/list` publishes the key and a tool may yet set it. Either way the result goes through
  [[sentence-case]]: Title Case is not what the docs style guide wants in a heading, and the word-by-word
  fallback doesn't know `sql` is an acronym. Correcting it here keeps the fix to the page — a `:title` is also
  what MCP clients list, where Title Case is the norm."
  [{:keys [title] :as tool}]
  (sentence-case
   (or title
       (->> (str/split (:name tool) #"_")
            (map str/capitalize)
            (str/join " ")))))

(defn- tool-description
  "The tool's description, as one line of prose. Throws when there is none: a tool section without one is an empty
  entry on a reference page. `register-tool!` already rejects a `deftool` with no docstring, so this is a
  belt-and-braces check on the page rather than the first line of defence."
  [tool]
  (or (md/flatten-prose (:description tool))
      (throw (ex-info (str "No description for MCP tool " (pr-str (:name tool))
                           ". Give its deftool a docstring.")
                      {:tool (:name tool)}))))

(defn- registered-scope-description
  "The description [[metabase.api-scope.core/defscope]] registered for `scope`. Throws when the scope isn't
  registered — a tool pointing at a scope that no consent screen can explain is a bug, not a page to publish."
  [tool scope]
  (or (md/flatten-prose (api-scope/scope-description scope))
      (throw (ex-info (str "MCP tool " (pr-str (:name tool)) " uses unregistered scope " (pr-str scope)
                           ". Declare it with metabase.api-scope.core/defscope.")
                      {:tool (:name tool) :scope scope}))))

(defn- scope-bullet
  "The permission a client has to be granted before it can call the tool, with the wording the consent screen uses.
  Always one scope: `register-tool!` refuses a tool whose `:scope` is not a non-blank string."
  [{:keys [scope] :as tool}]
  (when scope
    (str "Permission scope: " (md/code scope) " — " (registered-scope-description tool scope))))

(defn- effect-bullets
  "What the tool's MCP annotations promise about its effects. Every tool has `readOnlyHint` and `destructiveHint` —
  the registry merges its `default-annotations` over whatever a `deftool` declares — so there is always at least
  one of these to say."
  [{:keys [annotations]}]
  (let [{:keys [readOnlyHint destructiveHint idempotentHint]} annotations]
    [(cond
       readOnlyHint             "Read-only. It doesn't create, change, or delete anything in your Metabase."
       destructiveHint          "Can overwrite or delete existing data or content."
       ;; `destructiveHint false` is the tool's claim to make additive changes. It's a hint, not a contract:
       ;; `document_write` carries it while its description explains a full-body rewrite, so the page promises
       ;; nothing about what the tool won't touch and leaves that to the description.
       (false? destructiveHint) "Creates or changes content.")
     ;; only worth saying about a tool that changes something; that a read is repeatable goes without saying
     (when (and idempotentHint (not readOnlyHint))
       "Running it again with the same arguments has the same effect as running it once.")]))

;;;; Arguments

(defn- json-schema-types
  "The JSON Schema types a property accepts, distinct and in order, with `null` dropped. Nullability is how the
  strict-tool transform spells \"optional\" — it's the schema's way of letting a client omit the argument, not a
  type anyone passes, so listing it would read as though `null` were a meaningful value."
  [{:keys [type oneOf anyOf]}]
  (into []
        (comp (remove #{"null"}) (distinct))
        (concat (cond
                  (string? type) [type]
                  (coll? type)   type)
                (mapcat json-schema-types (concat oneOf anyOf)))))

(defn- array-item-types
  "The types an array property's elements accept. Looks through `oneOf`/`anyOf` branches, because a nullable array
  keeps its `:items` inside the non-null branch rather than at the top level."
  [{:keys [items oneOf anyOf]}]
  (into []
        (comp (remove #{"null"}) (distinct))
        (concat (json-schema-types items)
                (mapcat array-item-types (concat oneOf anyOf)))))

(defn- property-type-label
  "How to name a property's type in the arguments table. An array names what it holds — `array of string` reads
  better than a bare `array` when the argument is a list of search terms. Anything the schema doesn't pin down is
  `any`."
  [property]
  (let [types (json-schema-types property)]
    (cond
      (empty? types)      "any"
      (= ["array"] types) (let [item-types (array-item-types property)]
                            (if (= 1 (count item-types))
                              (str "array of " (first item-types))
                              "array"))
      :else               (str/join " or " types))))

(defn- object-typed?
  "Does the schema describe an object? Looks only at its own `:type`, not through wrappers."
  [{:keys [type]}]
  (boolean (some #{"object"} (if (coll? type) type [type]))))

(declare property-descriptions)

(defn- item-descriptions
  "The descriptions an array's `:items` schema contributes. An element that is itself an object contributes
  nothing, nor does an object branch of a union of elements: the table renders the argument as `array of object`
  and points at the client for the nested shape, so its prose describes something the reader can't see here.
  `dashboard_write`'s `ops` is a union of two dozen op objects, each with a sentence — collected, they ran
  together into one cell."
  [{:keys [oneOf anyOf] :as items}]
  (if (object-typed? items)
    []
    (property-descriptions (assoc items
                                  :oneOf (remove object-typed? oneOf)
                                  :anyOf (remove object-typed? anyOf)))))

(defn- property-descriptions
  "Every description reachable from a property, in order, deduped.

  A `deftool` writes its argument prose on the schema it wraps rather than on the property itself, and Malli
  leaves it there: `[:maybe [:int {:description ...}]]` publishes `{:oneOf [{:type \"integer\" :description ...}
  {:type \"null\"}]}`, so reading `(:description property)` alone would find nothing on almost every v2 argument.
  Three shapes reach one: the property, a `oneOf`/`anyOf` branch (`[:maybe ...]`, `[:or ...]`), and an array's
  `:items` (`[:sequential [:string {:description ...}]]`, subject to [[item-descriptions]]' object rule).
  `[:or [:int {...}] [:string {...}]]` carries one per branch, so this collects rather than taking the first."
  [{:keys [description items oneOf anyOf]}]
  (into []
        (comp cat (remove str/blank?) (distinct))
        [[description]
         (some-> items item-descriptions)
         (mapcat property-descriptions (concat oneOf anyOf))]))

(defn- enum-values
  "The values a property is restricted to, deduped, looking through `oneOf`/`anyOf` and `:items` the same way
  [[property-descriptions]] does. Worth publishing because the v2 surface is built on action-dispatch hubs: the
  enum on `browse_data`'s `action` or a write tool's `method` is the argument's real documentation, and a JSON
  Schema `enum` carries no `:type` distinction to show it."
  [{:keys [enum items oneOf anyOf]}]
  (into []
        (comp cat (distinct))
        [(or enum [])
         (some-> items enum-values)
         (mapcat enum-values (concat oneOf anyOf))]))

(defn- description-cell
  "The Description column for one argument: what values it accepts, then the schema's own prose. An em dash where
  the schema says nothing at all — escaping the pipes is [[md/table]]'s business, not this function's."
  [property]
  (let [values (enum-values property)
        parts  (cond->> (map md/flatten-prose (property-descriptions property))
                 (seq values) (cons (str "One of: " (str/join ", " (map md/code values)) ".")))]
    (if (seq parts)
      (str/join " " parts)
      "—")))

(defn- arguments-markdown
  "A tool's top-level arguments as a table. Only the top level: a nested object renders as `object`, and the
  intro points at the client for the full schema.

  Deliberately no `Required` column. The published `:inputSchema` can't answer that question:
  `strict-tool-input-schema` lists *every* property in `:required` so that strict MCP clients can send an explicit
  null for the ones they're leaving out, so reading it would mark every argument required. Which arguments are
  genuinely needed is what the tool's description is for, and most of them say so."
  [{:keys [inputSchema]}]
  (let [properties (:properties inputSchema)]
    (if (empty? properties)
      "This tool takes no arguments."
      (md/table ["Argument" "Type" "Description"]
                ;; alphabetical rather than schema order: a JSON Schema's properties are a plain map, so schema
                ;; order isn't stable, and an unstable order churns the page's diff on unrelated edits
                (for [[k property] (sort-by (comp name key) properties)]
                  [(md/code (name k))
                   (property-type-label property)
                   (description-cell property)])))))

;;;; Sections

(defn- tool-section
  "One tool's section of the page: heading, facts, description, then arguments. Everything on it comes from the
  tool registry — the page carries no hand-written prose per tool, so anything a reader needs to know about a
  tool belongs in its `deftool` docstring, where the agent reads it too."
  [tool]
  (md/paragraphs
   [(md/heading 3 (tool-title tool))
    (md/bullets (into [(str "Tool name: " (md/code (:name tool)))
                       (scope-bullet tool)]
                      (effect-bullets tool)))
    (md/sentence (tool-description tool))
    (md/labeled-block "Arguments:" (arguments-markdown tool))]))

(defn- section-markdown
  "One of the page's [[sections]], with the tools it claimed."
  [{:keys [heading blurb]} tools]
  (md/paragraphs
   (into [(md/heading 2 heading) blurb]
         (map tool-section tools))))

(defn- group-tools
  "Split `tools` across [[sections]]. Returns `[section tools]` pairs in section order, dropping any section nothing
  claimed."
  [tools]
  (let [by-heading (group-by (fn [tool]
                               (:heading (first (filter #((:claims? %) tool) sections))))
                             tools)]
    (for [{:keys [heading] :as section} sections
          :let [claimed (get by-heading heading)]
          :when (seq claimed)]
      [section claimed])))

(defn- document-markdown
  "The whole page: the `intro` resource, then a section per group of tools."
  [intro tools]
  (when (empty? tools)
    (throw (ex-info (str "No MCP tools found; the v2 registry is empty, so metabase.mcp.v2.api either no longer "
                         "requires the tool namespaces or no longer loads")
                    {})))
  (md/document (cons intro (for [[section claimed] (group-tools tools)]
                             (section-markdown section claimed)))))

;;;; Entry point

(defn generate-dox!
  "Write the MCP tool reference to `path`, defaulting to `docs/ai/mcp-tools.md`. Returns `{:path ... :tools n}`."
  ([]
   (generate-dox! output-path))
  ([path]
   (printf "Generating MCP tool documentation in %s\n" path)
   (let [tools (all-tools)
         n     (count tools)]
     (cmd.common/write-doc-file! path (document-markdown (cmd.common/load-resource! intro-resource) tools))
     (printf "Wrote %s (%d tools)\n" path n)
     (println "Done.")
     {:path path :tools n})))
