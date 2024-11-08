(ns metabase-enterprise.metabot-v3.tools
  (:require
   [metabase-enterprise.metabot-v3.tools.change-chart-appearance]
   [metabase-enterprise.metabot-v3.tools.change-column-settings]
   [metabase-enterprise.metabot-v3.tools.change-display-type]
   [metabase-enterprise.metabot-v3.tools.change-query]
   [metabase-enterprise.metabot-v3.tools.change-series-settings]
   [metabase-enterprise.metabot-v3.tools.change-table-visualization-settings]
   [metabase-enterprise.metabot-v3.tools.confirm-invite-user]
   [metabase-enterprise.metabot-v3.tools.registry :as tools.registry]
   [metabase-enterprise.metabot-v3.tools.who-is-your-favorite]))

(set! *warn-on-reflection* true)

(comment
  metabase-enterprise.metabot-v3.tools.confirm-invite-user/keep-me
  metabase-enterprise.metabot-v3.tools.change-display-type/keep-me
  metabase-enterprise.metabot-v3.tools.change-query/keep-me
  metabase-enterprise.metabot-v3.tools.change-table-visualization-settings/keep-me
  metabase-enterprise.metabot-v3.tools.change-series-settings/keep-me
  metabase-enterprise.metabot-v3.tools.change-column-settings/keep-me
  metabase-enterprise.metabot-v3.tools.who-is-your-favorite/keep-me
  metabase-enterprise.metabot-v3.tools.change-chart-appearance/keep-me)

(defn- tool-applicable? [tool-name context]
  (let [name-symbol (symbol (name tool-name))
        applicable? (:applicable? (get tools.registry/registry name-symbol))]
    (applicable? context)))

(defn applicable-tools
  "Given a list of tools and the relevant context, return the filtered list of tools that are applicable in this
  context."
  [tools context]
  (filter #(tool-applicable? (:name %) context) tools))

(def ^{:arglists '([])} ^:dynamic *tools-metadata*
  "Get metadata about the available tools. Metadata matches the `::metabot-v3.tools.interface/metadata` schema.

  In prod model, tools metadata is only loaded once, the first time this function is called, and cached afterwards. In
  dev mode, it is reloaded every time so we can pick up changes to tools."
  (fn []
    (->> tools.registry/registry vals (map :schema))))

(def ^:dynamic *tool-invocations*
  "Normally contains an atom with a map of tool-call-id => result, to prevent calling the same tool multiple times"
  (atom {}))

(defn invoke-tool!
  "When we invoke a tool, we can either:
  - do nothing at all, send the tool to the frontend for processing
  - generate an output to send to the LLM"
  [{:keys [name id arguments]}]
  (let [info (tools.registry/resolve-tool name)
        result ((:output-fn info) arguments)]
    (swap! *tool-invocations* (fn [calls]
                                (if (contains? calls id)
                                  (throw (ex-info "Invoked tool multiple times" {:tool-call-id id}))
                                  (assoc calls id result))))
    result))

(defn requires-invocation?
  "Does the given tool call require invocation?"
  [{:keys [id] :as _tool-call}]
  (not (contains? @*tool-invocations* id)))

(defmacro with-invocation-tracking
  "Tracks invocation of tools and doesn't invoke the same tool twice with the same arguments"
  [& body]
  `(binding [*tool-invocations* (atom {})]
     ((fn [] ~@body))))
