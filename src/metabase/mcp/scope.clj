(ns metabase.mcp.scope
  "The OAuth scopes the v2 MCP surface accepts, and scope matching for MCP tools and resources.

   Only a named scope string grants anything, and only by exact match.

   A leaf namespace with no requires, so the handler and OAuth server can read the scope sets without a dependency
   cycle. Anything `metabase.mcp.core` reaches joins the load path of every namespace that loads it. Pulling
   `metabot.scope`, and through it `premium-features`, onto that path has deadlocked namespace loading with a
   methodical protocol error at web-server start. Keep this namespace dependency-free.")

(def v2-surface-scopes
  "Every OAuth scope the v2 MCP surface accepts, as an ordered vector. The order is the order an
   `insufficient_scope` challenge lists them in, and `contains?` on this would test an index rather than a scope.

   Three things must agree on these, and they are reached from different places, which is why they live in
   this leaf rather than beside any one of them:

   - what the MCP resource accepts when RFC 8707 narrowing trims a requested scope
     ([[metabase.oauth-server.core/narrow-scope-to-resource]]);
   - what the OAuth server will actually grant: a dynamic client's ceiling always includes these, and
     `validate-scope` checks requests against that ceiling;
   - what v2 tools and resources may gate on.

   When the challenge drifted ahead of the grant, a client that followed it asked for exactly what it was told
   and was answered \"Invalid scope\", so the connect failed outright instead of degrading to a narrower grant
   (GHY-4226).

   Spelled as literals rather than read from `metabot.scope` because requiring that namespace here would close
   the load cycle described above; `v2-surface-scopes-match-metabot-scope-test` is what keeps them in step.
   Scopes are never renamed — issued tokens carry literal strings."
  ["agent:content:read"
   "agent:content:write"
   "agent:query:run"
   "agent:sql:run"
   "agent:delivery:write"])

(def v2-baseline-scopes
  "The subset of [[v2-surface-scopes]], in its order, that the consent page locks: when a client requests one of
   these, the user cannot untick it. Reading and running queries. Every other requested scope can be unticked."
  ;; A user who unticks the rest (writes, raw SQL, delivery) reaches it later by stepping up on a 403
  ;; `insufficient_scope`. `agent:query:run` is here because charts must not need a step-up: Claude Desktop retries a
  ;; tool after step-up over a session that declares no MCP Apps support, so a stepped-up `visualize_query` is refused
  ;; and never embeds.
  ["agent:content:read"
   "agent:query:run"])

(defn matches?
  "Does `token-scopes` hold the scope `required-scope`?"
  [token-scopes required-scope]
  (boolean (and (string? required-scope)
                (contains? token-scopes required-scope))))
