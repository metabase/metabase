(ns metabase-enterprise.mcp.tools
  "MCP tool registry. Tools are registered with name, description, JSON Schema, and handler fn.")

(defonce ^{:doc "Global tool registry atom. Tool namespaces register themselves at load time."}
  global-registry
  (atom {}))

(defn register-tool!
  "Register a tool in the given registry atom.
   Tool map must have :name, :description, :input-schema, and :handler."
  [registry {:keys [name] :as tool}]
  (swap! registry assoc name tool))

(defn list-tools
  "Return all registered tools in MCP tools/list response format.
   Includes annotations when present (readOnlyHint, destructiveHint, etc.)."
  [registry]
  (mapv (fn [{:keys [name description input-schema annotations]}]
          (cond-> {"name"        name
                   "description" description
                   "inputSchema" input-schema}
            annotations (assoc "annotations" annotations)))
        (vals @registry)))

(defn call-tool
  "Execute a registered tool by name with the given arguments.
   Returns {\"content\" [...]} on success or {\"content\" [...] \"isError\" true} on failure."
  [registry tool-name arguments]
  (if-let [{:keys [handler]} (get @registry tool-name)]
    (try
      (let [result (handler arguments)]
        {"content" (mapv #(update-keys % clojure.core/name) (:content result))})
      (catch Exception e
        {"content" [{"type" "text" "text" (str "Error: " (ex-message e))}]
         "isError" true}))
    {"content" [{"type" "text" "text" (str "Unknown tool: " tool-name)}]
     "isError" true}))
