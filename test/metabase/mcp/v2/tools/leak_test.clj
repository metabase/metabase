(ns metabase.mcp.v2.tools.leak-test
  "The v2 surface exposes no `read_resource`, no `metabase://` URIs, no `portable_entity_id`
   field, and no `visualize_query` — those are v1 affordances, and any v2-reachable text that
   names one sends the model to a tool that does not exist. The v1 name-based (\"portable\")
   query dialect is likewise never acknowledged, and neither are MBQL version numbers or any
   other query-language history: v2's spec is one concrete shape with numeric ids, and naming
   an alternative or a version makes it ambiguous. This sweeps the two static text surfaces an
   agent reads: the tools/list manifest (descriptions + input schemas) and the skill packs.
   Runtime error hints are covered where they are produced (see
   `metabase.metabot.tools.construct-representations-test` and the v2 query tool tests)."
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase.mcp.v2.api]
   [metabase.mcp.v2.registry :as registry]
   [metabase.mcp.v2.skills :as skills]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(def ^:private v1-affordances
  ["read_resource" "metabase://" "portable_entity_id" "visualize_query" "portable"
   "MBQL 5" "MBQL 4" "MBQL5" "MBQL4" "legacy"])

(deftest tool-manifest-never-names-v1-affordances-test
  ;; nil token-scopes = internal caller, which sees every enabled tool.
  (let [tools (registry/list-tools nil)]
    (is (seq tools))
    (doseq [tool   tools
            :let   [text (json/encode tool)]
            leaked v1-affordances]
      (testing (str (:name tool) " must not mention " (pr-str leaked))
        (is (not (str/includes? text leaked)))))))

(deftest skills-never-name-v1-affordances-test
  (doseq [topic  (skills/topics)
          :let   [text (str (skills/skill-text topic)
                            (str/join (map #(skills/reference-text topic %)
                                           (skills/reference-names topic))))]
          leaked v1-affordances]
    (testing (str topic " must not mention " (pr-str leaked))
      (is (not (str/includes? text leaked))))))
