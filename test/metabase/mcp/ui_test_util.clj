(ns metabase.mcp.ui-test-util
  "Helpers for tests that call the `/api/embed-mcp` handlers the way the MCP Apps iframe does: with a UI credential
  and the MCP session id it was minted for."
  (:require
   [metabase.mcp.session :as mcp.session]
   [metabase.test :as mt]
   [metabase.test.http-client :as client]))

(set! *warn-on-reflection* true)

(def query-scopes
  "The scopes the iframe's query routes cost."
  #{"agent:query:run"})

(defn ui-auth!
  "A fresh MCP session for `username` and a UI credential minted for it holding `scopes` (default
  [[query-scopes]]), as `{:user-id :session-id :credential}`."
  ([username]
   (ui-auth! username query-scopes))
  ([username scopes]
   (let [user-id    (mt/user->id username)
         session-id (mcp.session/create! user-id)]
     {:user-id    user-id
      :session-id session-id
      :credential (mcp.session/issue-ui-credential session-id user-id scopes)})))

(defn headers
  "The request headers the iframe sends for `auth`, from [[ui-auth!]]."
  [{:keys [credential session-id]}]
  (cond-> {}
    credential (assoc "x-metabase-mcp-ui-auth" credential)
    session-id (assoc "mcp-session-id" session-id)))

(defn ui-request
  "Send `method` to `url` with the iframe's headers for `auth`, and `body` when given. `expected-status` may be nil.
  Returns the full response."
  ([auth method expected-status url]
   (ui-request auth method expected-status url nil))
  ([auth method expected-status url body]
   (apply client/client-full-response
          (concat [method]
                  (when expected-status [expected-status])
                  [url {:request-options {:headers (headers auth)}}]
                  (when (some? body) [body])))))
