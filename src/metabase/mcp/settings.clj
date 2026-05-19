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

(defsetting mcp-apps-cors-enabled-clients
  (deferred-tru "Popular MCP clients enabled for CORS, stored as CSV client keys (e.g. claude, vscode).")
  :type       :csv
  :default    []
  :visibility :admin
  :export?    false
  :encryption :no
  :audit      :getter)

(defsetting mcp-apps-cors-custom-origins
  (deferred-tru "Custom CORS origins for self-hosted MCP clients, space-separated.")
  :type       :string
  :default    ""
  :visibility :admin
  :export?    false
  :encryption :no
  :audit      :getter)

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
