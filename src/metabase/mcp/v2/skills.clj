(ns metabase.mcp.v2.skills
  "The skill packs behind the v2 `learn` tool, plus the doc snippets teaching errors embed.

   A pack is a directory on the classpath under `mcp/v2/skills/<pack>/`: a `SKILL.md` (the whole
   document a `learn(topic)` call returns — one indivisible unit, no windowing) and optional
   `references/<name>.md` files it points at. Every file is resolved at namespace load, so a
   missing file fails at startup rather than on the first fetch; the slurp itself is delayed.

   Packs carry the knowledge tool descriptions cannot: shapes the input schemas don't fully
   type (template tags, visualization settings), dialects (portable MBQL), and conventions
   (dashboard grids, parameter wiring). Tool descriptions point here with trigger-conditioned
   sentences, and teaching errors embed the short contract snippets defined at the bottom of
   this namespace — so a miss recovers within one round trip even when no pack was read."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]))

(set! *warn-on-reflection* true)

(def ^:private skills-root "mcp/v2/skills")

(defn- classpath-file
  "A delay over the contents of `path` under the skills root. Throws at namespace load when the
   file is missing from the classpath."
  [path]
  (let [full (str skills-root "/" path)
        url  (io/resource full)]
    (when-not url
      (throw (ex-info (str "Missing MCP skill pack file on classpath: resources/" full)
                      {:path full})))
    (delay (slurp url :encoding "UTF-8"))))

(def packs
  "The pack catalog, in the order `learn()` lists it. `:description` doubles as the catalog line
   and must say when to read the pack, not just what it is."
  [{:name        "query-dialect"
    :description "The portable MBQL 5 dialect execute_query and question_write's `query` speak: name-based refs, clause grammar, joins, expressions, multi-stage queries. Read before authoring any non-trivial query. Reference `operators` lists every filter/aggregation/expression operator."
    :references  ["operators"]}
   {:name        "native-parameters"
    :description "Template tags for native SQL (question_write's `native`): the tag kinds, the field-filter-vs-variable decision, the exact template_tags shape, widget types, optional [[ ]] blocks. Read before first passing template_tags."
    :references  []}
   {:name        "dashboard-filters"
    :description "Dashboard parameters end to end: add_parameter types, wire_parameter target grammar (target_field vs target_tag vs raw target), autowire, linked filters, value sources, inline parameters. Read before your first add_parameter or wire_parameter."
    :references  []}
   {:name        "dashboard-layout"
    :description "The 24-column dashboard grid: per-display default sizes, explicit placement vs autoplace, the KPI-row pattern, tabs and the every-card-needs-a-tab rule."
    :references  []}
   {:name        "documents"
    :description "document_write's Markdown grammar beyond the basics: the CommonMark subset, {% card %} embeds, {% entity %} links, ::: layout containers, and how surgical `edits` behave."
    :references  []}
   {:name        "visualization-settings"
    :description "Choosing a card's display and authoring visualization_settings: which chart fits which data, the output-column-name rule, minimum settings per chart family. Reference `settings` is the full per-chart key catalog including column_settings, series_settings, and dashcard click behavior."
    :references  ["settings"]}])

(def ^:private content
  "pack name -> {:skill <delay> :references {ref-name <delay>}} — resolved (and thus existence-
   checked) at load."
  (into {}
        (map (fn [{pack-name :name :keys [references]}]
               [pack-name
                {:skill      (classpath-file (str pack-name "/SKILL.md"))
                 :references (into {}
                                   (map (fn [ref-name]
                                          [ref-name (classpath-file (str pack-name "/references/" ref-name ".md"))]))
                                   references)}]))
        packs))

(defn topics
  "The pack names, in catalog order."
  []
  (mapv :name packs))

(defn catalog-text
  "The `learn()` response: one line per pack — name, description, reference names."
  []
  (str "Topics — fetch one with learn(topic); a reference with learn(topic, reference):\n\n"
       (str/join "\n"
                 (for [{pack-name :name :keys [description references]} packs]
                   (str "- " pack-name " — " description
                        (when (seq references)
                          (str " [references: " (str/join ", " references) "]")))))))

(defn skill-text
  "`topic`'s whole SKILL.md, with a footer naming its references, or nil for an unknown topic."
  [topic]
  (when-let [{:keys [skill references]} (get content topic)]
    (cond-> @skill
      (seq references)
      (str "\n\n---\nReferences for this topic — fetch with learn(\"" topic "\", \"<name>\"): "
           (str/join ", " (keys references)) "."))))

(defn reference-text
  "The reference file `reference` of pack `topic`, or nil when either is unknown."
  [topic reference]
  (some-> (get-in content [topic :references reference]) deref))

(defn reference-names
  "The reference names of `topic`, or nil for an unknown topic."
  [topic]
  (when-let [{:keys [references]} (get content topic)]
    (vec (keys references))))

;;; --------------------------------------------- Teaching-error snippets ------------------------------------------
;;; Short contract blocks embedded into teaching errors at the boundaries the packs document, so a
;;; failed call carries the spec itself and recovery never needs a second round trip.

(def template-tag-contract
  "The question_write template_tags contract, embedded in tag-shape teaching errors."
  (str "template_tags is a map keyed by {{tag}} name; each entry:\n"
       "  field filter:  {\"type\": \"dimension\", \"field_id\": <numeric id or entity_id>, \"widget_type\": \"string/=\" | \"number/=\" | \"date/all-options\" | …, \"display_name\"?, \"required\"?, \"default\"?}\n"
       "  raw variable:  {\"type\": \"text\" | \"number\" | \"date\" | \"boolean\", \"display_name\"?, \"required\"?, \"default\"?}\n"
       "  time grouping: {\"type\": \"temporal-unit\", \"field_id\": <numeric id or entity_id>}\n"
       "Write a field filter BARE in the SQL (WHERE {{tag}}, never col = {{tag}}); a raw variable is a literal you wrap yourself (WHERE total > {{tag}}). "
       "The shape get_content returns for template_tags is accepted back verbatim — including snippet/card reference-tag entries, which are ignored (the SQL text configures them). Full doc: learn(\"native-parameters\")."))

(def wire-target-grammar
  "The wire_parameter target grammar, embedded in wiring teaching errors."
  (str "wire_parameter takes exactly one of: `target_field` (a numeric field id — works for MBQL cards and for native cards whose field-filter tag binds that field; the server derives the mapping), "
       "`target_tag` (a template tag name on a native-SQL card; the server derives [\"dimension\"…] vs [\"variable\"…] from the tag's type), "
       "or raw `target` (advanced, e.g. [\"dimension\", [\"template-tag\", \"category\"]]; [\"text-tag\", \"name\"] binds a {{name}} placeholder in a text/heading/iframe card's own content). Full doc: learn(\"dashboard-filters\")."))
