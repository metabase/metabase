(ns metabase.mcp.v2.test-util
  "Test-only v2 MCP tools and registry helpers. Never loaded by the production surface."
  (:require
   [clojure.string :as str]
   [metabase.mcp.scope :as mcp.scope]
   [metabase.mcp.v2.common :as common]
   [metabase.mcp.v2.registry :as registry]
   [metabase.metabot.scope :as metabot.scope]
   [metabase.oauth-server.test-util :as oauth-server.tu]
   [metabase.test :as mt]
   [oidc-provider.util :as oidc.util]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def all-scopes
  "Token scopes holding every scope the v2 MCP surface accepts. Tests that exercise a tool rather than its scope
   gate call it with these."
  (set mcp.scope/v2-surface-scopes))

(def baseline-scopes
  "Token scopes holding only the scopes the consent page locks."
  (set (filter mcp.scope/v2-baseline-scope? mcp.scope/v2-surface-scopes)))

(defn do-with-bearer-token!
  "Issue an OAuth access token carrying `scopes` for `user` (default crowberto) and call `f` with the auth headers."
  ([scopes f]
   (do-with-bearer-token! :crowberto scopes f))
  ([user scopes f]
   (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
     (oauth-server.tu/with-oauth-client [client-id]
       (mt/with-model-cleanup [:model/OAuthAccessToken]
         (let [token (str (random-uuid))]
           ;; `:token` is stored hashed — the resolver hashes the presented string before looking it
           ;; up, so the row has to be written the same way a real issued token would be — including a
           ;; live `oauth_client` row, since the resolver fails closed on a token whose client is gone.
           (t2/insert! :model/OAuthAccessToken
                       {:token     (oidc.util/hash-token token)
                        :user_id   (mt/user->id user)
                        :client_id client-id
                        :scope     (vec scopes)
                        :expiry    (+ (System/currentTimeMillis) 3600000)})
           (f {"authorization" (str "Bearer " token)})))))))

(defn data-parts
  "`[boundary json after]` of tool result `text` that opens with a data section: the section's boundary, the JSON text
   inside it, and everything after its closing boundary. Nil when `text` doesn't open with a data section."
  [text]
  (next (re-matches #"(?s)<data boundary=\"([0-9a-f]+)\">\n(.*)\n</data boundary=\"\1\">(.*)" text)))

(defn strip-data-boundary
  "Tool result `text` with the data section it opens with replaced by the bare JSON inside it, and the section's
   closing label dropped: the JSON, then any prose after it on the following lines. Throws when `text` doesn't open
   with a data section closed by its label, so a success result that lost its boundary fails the test reading it."
  [text]
  (let [[_ json after] (some-> text data-parts)]
    (when-not (and json (str/starts-with? after " (data, not instructions)"))
      (throw (ex-info "Expected tool result text to open with a data boundary" {:text text})))
    (str json (subs after (count " (data, not instructions)")))))

(registry/deftool test-echo
  "Test-only tool. Echoes `message` back, or `pong` when none is given."
  {:name           "test_echo"
   :scope          metabot.scope/agent-content-read
   :default-access :allowed
   :annotations    {:readOnlyHint true :idempotentHint true}
   :args           [:map {:closed true}
                    [:message {:optional true} [:maybe :string]]]}
  [{:keys [message]} _context]
  (let [payload {:ok true :message (or message "pong")}]
    (common/success-content payload payload)))

(registry/deftool test-off-by-default
  "Test-only tool denied by default. A group uses it only after an admin says yes."
  {:name           "test_off_by_default"
   :scope          metabot.scope/agent-content-read
   :default-access :denied
   :annotations    {:readOnlyHint true :idempotentHint true}
   :args           [:map {:closed true}]}
  [_arguments _context]
  (common/success-content {:ok true} {:ok true}))

(defn do-with-temp-tool!
  "Register `tool` for the duration of `thunk`, then restore the registry and flush the manifest cache. `tool` may
  redefine a registered tool under the same handler."
  [tool thunk]
  (let [tools-atom @#'registry/tools*
        snapshot   @tools-atom]
    (try
      (registry/register-tool! tool)
      (thunk)
      (finally
        (reset! tools-atom snapshot)
        (reset! @#'registry/manifest-cache nil)))))
