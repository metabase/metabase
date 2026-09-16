(ns metabase.metabot.tools.external-mcp
  "Metabot tools backed by the external MCP servers a user is connected to (Notion, Linear, ...), adapted from the
  servers' own tool definitions into agent ToolEntry maps.

  The entries are deferred: the model sees them as a catalog and loads the ones it needs with `load_mcp_tools`,
  after which they are declared in full for the rest of the conversation. A connected server can expose dozens of
  tools with large schemas, so declaring them all on every request would dominate the prompt."
  (:require
   [clojure.string :as str]
   [metabase.mcp-client.core :as mcp]
   [metabase.metabot.scope :as scope]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

;;; LLM providers accept tool names matching [a-zA-Z0-9_-]{1,64}; MCP tool and server names are arbitrary.
(def ^:private max-tool-name-length 64)
(def ^:private max-server-token-length 24)
(def ^:private max-output-chars 60000)
(def ^:private max-summary-chars 200)

(def load-tool-name
  "Name of the tool the model calls to have deferred external tools declared to it."
  "load_mcp_tools")

(def ^:private arguments-schema
  "Tool arguments are validated by the server against its own JSON Schema, which is sent to the model verbatim as
  `:parameters`, so the Malli side accepts any object."
  [:=> [:cat [:map-of :keyword :any]] :any])

(defn- token
  [s]
  (-> (str s)
      u/lower-case-en
      (str/replace #"[^a-z0-9_-]+" "_")
      (str/replace #"^_+|_+$" "")))

(defn- truncate
  [^String s n]
  (if (> (count s) n) (subs s 0 n) s))

(defn tool-name
  "The agent-facing name of MCP tool `mcp-tool-name` on the server called `server-name`: `<server>__<tool>`,
  restricted to the characters and length providers accept."
  [server-name mcp-tool-name]
  (let [server (or (not-empty (truncate (token server-name) max-server-token-length)) "mcp")
        tool   (or (not-empty (token mcp-tool-name)) "tool")]
    (truncate (str server "__" tool) max-tool-name-length)))

(defn- unique-name
  [taken candidate]
  (loop [n 2, candidate' candidate]
    (if (contains? taken candidate')
      (let [suffix (str "_" n)]
        (recur (inc n) (str (truncate candidate (- max-tool-name-length (count suffix))) suffix)))
      candidate')))

(defn parameters
  "`input-schema` (an MCP tool's `inputSchema`) as the JSON Schema object providers require for tool parameters."
  [input-schema]
  (let [schema (if (map? input-schema) input-schema {})]
    (cond-> schema
      (not= "object" (:type schema))       (assoc :type "object")
      (not (contains? schema :properties)) (assoc :properties {}))))

(defn- content-part->text
  [{:keys [type text uri name resource] :as part}]
  (case type
    "text"          text
    "image"         "[image omitted]"
    "audio"         "[audio omitted]"
    "resource_link" (str "Resource: " (or name uri) (when (and name uri) (str " (" uri ")")))
    "resource"      (or (:text resource) (str "Resource: " (:uri resource)))
    (json/encode part)))

(defn result->tool-result
  "An MCP `tools/call` result as the `{:output ...}` map the agent hands back to the model. Text content is joined,
  non-text content is summarized, and a result without content falls back to its structured content."
  [{:keys [content structuredContent isError]}]
  (let [text   (str/join "\n" (keep content-part->text content))
        text   (cond
                 (not (str/blank? text))   text
                 (some? structuredContent) (json/encode structuredContent)
                 :else                     "The tool returned no output.")
        output (if (> (count text) max-output-chars)
                 (str (subs text 0 max-output-chars) "\n[output truncated]")
                 text)]
    {:output (if isError (str "Error: " output) output)}))

(defn- describe
  [server {:keys [description title name]}]
  (str (or (not-empty description) title name)
       "\n\nProvided by the external MCP server \"" (:name server) "\"."))

(defn summary
  "A one-line, at most [[max-summary-chars]]-character summary of an MCP tool for the catalog: its first sentence
  or line, falling back to its title or name."
  [{:keys [description title name]}]
  (let [text (-> (or (not-empty description) title name "")
                 str/trim
                 (str/split #"(?<=[.!?])\s+|\n" 2)
                 first
                 (str/replace #"\s+" " "))]
    (if (> (count text) max-summary-chars)
      (str (str/trimr (subs text 0 (dec max-summary-chars))) "…")
      text)))

(defn- tool-entry
  [user-id server {mcp-name :name :keys [title] :as tool} agent-name]
  (let [server-id (:id server)
        label     (str "Using " (:name server) ": " (or title mcp-name))]
    {:tool-name  agent-name
     :doc        (describe server tool)
     :schema     arguments-schema
     :parameters (parameters (:inputSchema tool))
     :title-fn   (constantly label)
     :scope      scope/agent-external-mcp-call
     :deferred   {:group (:name server) :summary (summary tool)}
     :fn         (fn [arguments]
                   (result->tool-result (mcp/call-user-tool! user-id server-id mcp-name arguments)))}))

(defn tool-entries
  "ToolEntry maps, keyed by agent tool name, for every tool of every external MCP server `user-id` can use. Names
  that would collide are made unique with a numeric suffix."
  [user-id]
  (let [servers (mcp/user-tools user-id)]
    (loop [pairs   (for [{:keys [server tools]} servers, tool tools] [server tool])
           entries {}]
      (if-let [[server tool] (first pairs)]
        (let [candidate  (tool-name (:name server) (:name tool))
              agent-name (unique-name entries candidate)]
          (when (not= candidate agent-name)
            (log/debugf "External MCP tool %s on server %s renamed to %s" (:name tool) (:id server) agent-name))
          (recur (rest pairs) (assoc entries agent-name (tool-entry user-id server tool agent-name))))
        entries))))

(defn- describe-loaded
  [{:keys [tool-name doc parameters]}]
  (str "## " tool-name "\n" doc "\n\nParameters (JSON Schema): " (json/encode parameters)))

(defn load-tool-entry
  "The ToolEntry for [[load-tool-name]] over `entries`, the deferred external tool entries keyed by name. Loading
  a tool returns its full description and parameter schema; the agent declares every loaded tool on subsequent
  requests (see [[metabase.metabot.tools/declared-tools]])."
  [entries]
  {:tool-name load-tool-name
   :doc       (str "Load one or more of the external tools listed under \"External tools\" so you can call them. "
                   "Call this with every tool you intend to use before using any of them; several can be loaded at "
                   "once. Load only what the current task needs.")
   :schema    [:=> [:cat [:map {:closed true}
                          [:names [:sequential {:description "External tool names exactly as listed"} :string]]]]
               :any]
   :title-fn  (constantly "Loading external tools")
   :scope     scope/agent-external-mcp-call
   :fn        (fn [{:keys [names]}]
                {:output (str/join "\n\n"
                                   (for [n (distinct names)]
                                     (if-let [entry (get entries n)]
                                       (describe-loaded entry)
                                       (format "Unknown external tool: \"%s\". Load only names listed under \"External tools\"." n))))})})

(defn loaded-tool-names
  "The names passed to [[load-tool-name]] calls anywhere in `parts`, the conversation's AISDK parts. History parts
  may carry string or keyword argument keys depending on whether they were replayed from a stored message or
  streamed this turn."
  [parts]
  (into #{}
        (comp (filter #(and (= :tool-input (:type %)) (= load-tool-name (:function %))))
              (mapcat #(let [arguments (:arguments %)]
                         (or (get arguments :names) (get arguments "names"))))
              (filter string?))
        parts))
