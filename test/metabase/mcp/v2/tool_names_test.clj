(ns metabase.mcp.v2.tool-names-test
  "Pins the names of the live MCP tools. Every admin's explicit yes or no in `mcp_group_permission` is keyed by tool
  name, so a rename drops them all unless the tool declares `:renamed-from`."
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is]]
   [metabase.mcp.v2.api]
   [metabase.mcp.v2.registry :as registry]))

(set! *warn-on-reflection* true)

(def ^:private live-tool-names
  #{"alert_write"
    "bookmark_content"
    "browse_collection"
    "browse_data"
    "collection_write"
    "dashboard_write"
    "document_write"
    "duplicate_content"
    "execute_query"
    "execute_sql"
    "get_content"
    "get_parameter_values"
    "glossary"
    "learn"
    "measure_write"
    "metric_write"
    "question_write"
    "refresh_ui_credential"
    "render_drill_through"
    "run_saved_question"
    "search"
    "segment_write"
    "subscription_write"
    "transform_write"
    "visualize_query"})

(defn- live-tool?
  "Whether `tool` is registered by a namespace under `metabase.mcp.v2.tools`, as opposed to a test-only tool."
  [{:keys [handler]}]
  (str/starts-with? (str (some-> handler meta :ns ns-name)) "metabase.mcp.v2.tools."))

(deftest ^:parallel live-tool-names-are-pinned-test
  (is (= live-tool-names
         (into #{} (comp (filter live-tool?) (map :name)) (vals @@#'registry/tools*)))
      (str "A live MCP tool was added, removed or renamed. Update this set. A rename also needs `:renamed-from` on "
           "the tool so stored group entries follow it, or a chosen `:default-access` for the new name.")))
