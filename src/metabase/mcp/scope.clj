(ns metabase.mcp.scope
  "The OAuth scopes the v2 MCP surface accepts, and scope matching for MCP tools and resources.

   Only a named scope string grants anything, and only by exact match.

   A leaf namespace with no requires, so the handler and OAuth server can read the scope sets without a dependency
   cycle. Anything `metabase.mcp.core` reaches joins the load path of every namespace that loads it. Pulling
   `metabot.scope`, and through it `premium-features`, onto that path has deadlocked namespace loading with a
   methodical protocol error at web-server start. Keep this namespace dependency-free.")

(def v2-surface-scopes
  "Every OAuth scope the v2 MCP surface accepts in order from safest to most dangerous."
  ["agent:content:read"
   "agent:query:run"
   "agent:content:write"
   "agent:sql:run"
   "agent:delivery:write"])

(def ^:private v2-surface-scopes-set (set v2-surface-scopes))

(defn valid-scope?
  "Is this an allowed scope from MCP?"
  [scope]
  (contains? v2-surface-scopes-set scope))

(def ^:private v2-baseline-scopes
  "The subset of [[v2-surface-scopes]] the consent page locks."
  #{"agent:content:read"
    "agent:query:run"})

(defn v2-baseline-scope?
  "Is `scope` locked on the consent page?"
  [scope]
  (contains? v2-baseline-scopes scope))

(defn matches?
  "True when `required-scope` is a valid MCP scope and is contained in `token-scopes`."
  [token-scopes required-scope]
  (boolean (and (valid-scope? required-scope)
                (contains? token-scopes required-scope))))
