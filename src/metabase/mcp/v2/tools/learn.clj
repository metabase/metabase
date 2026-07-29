(ns metabase.mcp.v2.tools.learn
  "The v2 MCP `learn` tool: on-demand delivery of the skill packs in
   [[metabase.mcp.v2.skills]] — the deep, task-shaped knowledge tool descriptions cannot carry
   (template-tag shapes, the MBQL query dialect, parameter wiring, layout conventions).

   One tool is the whole delivery surface: it rides `tools/list`, the one discovery channel
   every MCP client implements, so it is model-invokable everywhere. The tool's own description
   carries the catalog inline, so even a model that ignores every per-tool pointer sees the
   topics in its tool list. Knowledge is not sensitive — it describes the API, not the
   instance's data — so the tool sits behind the always-granted resource-read scope."
  (:require
   [clojure.string :as str]
   [metabase.mcp.v2.common :as common]
   [metabase.mcp.v2.registry :as registry]
   [metabase.mcp.v2.skills :as skills]
   [metabase.metabot.scope :as metabot.scope]))

(set! *warn-on-reflection* true)

(defn- unknown-topic!
  [topic]
  (common/throw-teaching-error
   (format "Unknown topic %s. Topics: %s. Call learn() with no arguments for the catalog with descriptions."
           (pr-str topic) (str/join ", " (skills/topics)))))

(registry/deftool learn
  "Read this server's task docs (skills) for the write dialects the schemas can't fully describe. learn() lists topics; learn(topic) returns that skill whole; learn(topic, reference) one of its reference files. Topics: query-dialect (the query language for execute_query and question_write's query; reference \"operators\" = operator catalog), native-parameters (template tags and field filters for native SQL), dashboard-filters (dashboard parameters and the wire_parameter target grammar), dashboard-layout (24-column grid, sizes, tabs), documents (document_write's Markdown grammar), visualization-settings (display choice and settings; reference \"settings\" = per-chart key catalog). Read the matching topic before your first complex write of that kind; skip when already in context."
  {:name        "learn"
   :scope       metabot.scope/agent-resource-read
   :annotations {:readOnlyHint true :idempotentHint true}
   :args        [:map {:closed true}
                 [:topic {:optional true}
                  [:maybe [:string {:min 1 :description "A topic from the catalog. Omit to list all topics."}]]]
                 [:reference {:optional true}
                  [:maybe [:string {:min 1 :description "A reference file of `topic`, by the name the skill (or the catalog) lists."}]]]]}
  [{:keys [topic reference]} _context]
  (common/success-content
   (cond
     (and reference (nil? topic))
     (common/throw-teaching-error
      "`reference` names a file within a topic — pass `topic` alongside it, e.g. learn(\"query-dialect\", \"operators\").")

     (nil? topic)
     (skills/catalog-text)

     reference
     (or (skills/reference-text topic reference)
         (if-let [names (skills/reference-names topic)]
           (common/throw-teaching-error
            (format "Topic %s has no reference %s.%s"
                    (pr-str topic) (pr-str reference)
                    (if (seq names)
                      (str " Its references: " (str/join ", " names) ".")
                      " It has no reference files — call learn(topic) for the skill itself.")))
           (unknown-topic! topic)))

     :else
     (or (skills/skill-text topic)
         (unknown-topic! topic)))))
