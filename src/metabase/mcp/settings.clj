(ns metabase.mcp.settings
  "Settings for MCP Apps CORS origins and MCP session key derivation."
  (:require
   [clojure.string :as str]
   [metabase.llm.settings :as llm.settings]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.string :as u.str]))

;; NOTE: uuid-nonce-base sets :setter :none, so this secret is not rotatable via the normal settings API.
;; If rotation is needed (e.g. after a DB breach), an admin action should regenerate the secret and
;; invalidate existing MCP-backed core_session rows. See also: premium-embedding-token-signing-key.
;;
;; The getter is obfuscated so that the raw secret can never leak via settings APIs, the admin UI,
;; logs, or audit events — only a masked form is exposed. Internal callers that actually need to
;; HMAC with the secret must use `unobfuscated-mcp-embedding-signing-secret`.
(defsetting mcp-embedding-signing-secret
  (deferred-tru "Instance-wide secret used to derive embedding session keys for MCP sessions.")
  :encryption :when-encryption-key-set
  :visibility :internal
  :sensitive? true
  :base       setting/uuid-nonce-base
  :export?    false
  :audit      :no-value
  :doc        false
  :getter     (fn []
                (-> (setting/get-value-of-type :string :mcp-embedding-signing-secret)
                    (u.str/mask 4))))

(defn unobfuscated-mcp-embedding-signing-secret
  "Get the unobfuscated value of [[mcp-embedding-signing-secret]]. Callers must only
   use this for in-process key derivation, never to expose the secret externally."
  []
  (setting/get-value-of-type :string :mcp-embedding-signing-secret))

;;; ------------------------------------------------ Client → Domain Mapping --------------------------------

(def ^:private mcp-client-apps-sandbox-domains
  "Maps MCP client keys to MCP Apps sandbox domains.
   vscode-webview:// origins need special handling (prefix match, not wildcard domain)."
  {"claude"  ["https://*.claudemcpcontent.com"]
   "chatgpt" ["https://*.web-sandbox.oaiusercontent.com"]

   ;; vscode-webview:// handled by mcp-sandbox-origin? in security middleware
   "cursor-vscode"  []})

;;; ------------------------------------------------ Settings ------------------------------------------------

(defsetting mcp-enabled?
  (deferred-tru "Whether the MCP server is enabled.")
  :type       :boolean
  :default    true
  :visibility :public
  :getter     #(and (llm.settings/ai-features-enabled?)
                    (setting/get-value-of-type :boolean :mcp-enabled?))
  :export?    true
  :doc        false)

;; The two v2 settings gate the v2 tool surface (`/api/metabase-mcp/v2`) independently of the v1
;; `mcp-enabled?` setting, so either surface can run while the other is dark. No trailing `?` on
;; the boolean: admins toggle it as `/api/setting/mcp-v2-enabled`, and a `?` can't ride a URL path.

(defsetting mcp-v2-enabled
  (deferred-tru "Whether the v2 MCP tool surface is enabled.")
  :type       :boolean
  :default    false
  :visibility :admin
  :getter     #(boolean (and (llm.settings/ai-features-enabled?)
                             (setting/get-value-of-type :boolean :mcp-v2-enabled)))
  :export?    false
  :doc        false)

(defsetting mcp-v2-disabled-tools
  (deferred-tru "v2 MCP tool names to disable, stored as CSV. Disabled tools are hidden from tools/list and rejected by tools/call.")
  :type       :csv
  :default    []
  :visibility :admin
  :export?    false
  :encryption :no
  :audit      :getter
  :doc        false)

(defsetting mcp-query-handle-ttl-hours
  (deferred-tru "Hours a stored MCP query handle is kept before the scheduled GC task deletes it.")
  :type       :integer
  :default    24
  :visibility :internal
  :export?    false
  :doc        false)

(defsetting mcp-apps-cors-enabled-clients
  (deferred-tru "Popular MCP clients enabled for CORS, stored as CSV client keys (e.g. claude, vscode).")
  :type       :csv
  :default    []
  :visibility :admin
  :export?    false
  :encryption :no
  :audit      :getter)

(defn- strip-scheme
  [s]
  (if-let [idx (str/index-of s "://")]
    (subs s (+ idx 3))
    s))

(defn- origin-has-real-path?
  "True if `entry` (a single CORS origin, optionally `scheme://`-prefixed) has a path component beyond
   an optional bare trailing slash, e.g. `http://localhost:6274/sse` (but not `http://localhost:6274/`)."
  [entry]
  (let [without-scheme (strip-scheme entry)
        slash-idx      (str/index-of without-scheme "/")]
    (boolean (and slash-idx
                  (< (inc slash-idx) (count without-scheme))))))

(defn- validate-no-origin-paths!
  "Throws if any space-separated entry in `origins-raw` has a path component. CORS origins are
   scheme + host + port only, so a path pasted into this setting (e.g. `http://localhost:6274/sse`)
   wouldn't do what an admin might expect (only the origin is honored, not the path) — better to
   reject it outright than silently drop it and leave the setting looking saved."
  [origins-raw]
  (when-let [bad-entries (->> (str/split (or origins-raw "") #"\s+")
                              (filter not-empty)
                              (filter origin-has-real-path?)
                              not-empty)]
    (throw (ex-info (str "CORS origins must not include a path: " (str/join ", " bad-entries))
                    {:status-code 400}))))

(defn- -mcp-apps-cors-custom-origins!
  "The setter for [[mcp-apps-cors-custom-origins]]."
  [new-value]
  (validate-no-origin-paths! new-value)
  (setting/set-value-of-type! :string :mcp-apps-cors-custom-origins new-value))

(defsetting mcp-apps-cors-custom-origins
  (deferred-tru "Custom CORS origins for self-hosted MCP clients, space-separated.")
  :type       :string
  :default    ""
  :visibility :admin
  :export?    false
  :encryption :no
  :audit      :getter
  :setter     #'-mcp-apps-cors-custom-origins!)

;;; ------------------------------------------------ Helpers ------------------------------------------------

(defn mcp-apps-cors-origins
  "Returns space-separated CORS origins from both common and custom MCP client settings."
  []
  (let [common-domains (mapcat mcp-client-apps-sandbox-domains (mcp-apps-cors-enabled-clients))
        custom-domains (str/split (mcp-apps-cors-custom-origins) #"\s+")]
    (->> (concat common-domains custom-domains)
         (map str/trim)
         (keep not-empty)
         (str/join " "))))
