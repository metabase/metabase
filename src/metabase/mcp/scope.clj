(ns metabase.mcp.scope
  "Scope matching for MCP tools and resources."
  (:require
   [clojure.string :as str]
   [metabase.api.macros.scope :as scope]))

(defn matches?
  "Does `token-scopes` grant access to a tool with the given `tool-scope`?
   - nil token-scopes → always matches (internal callers)
   - ::scope/unrestricted in token-scopes → always matches
   - nil tool-scope → only matches nil or unrestricted token-scopes
   - wildcard scopes like \"agent:*\" match any tool scope starting with \"agent:\""
  [token-scopes tool-scope]
  (or (nil? token-scopes)
      (contains? token-scopes ::scope/unrestricted)
      (when (some? tool-scope)
        (or (contains? token-scopes tool-scope)
            (some (fn [s]
                    (when (string? s)
                      (when-let [prefix (when (str/ends-with? s ":*")
                                          (subs s 0 (dec (count s))))]
                        (str/starts-with? tool-scope prefix))))
                  token-scopes)))))
