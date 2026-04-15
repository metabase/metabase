(ns metabase.mcp.settings
  "Settings for MCP Apps CORS origins."
  (:require
   [clojure.string :as str]
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

;;; ------------------------------------------------ Client → Domain Mapping --------------------------------

(def ^:private mcp-client-apps-sandbox-domains
  "Maps MCP client keys to MCP Apps sandbox domains.
   vscode-webview:// origins need special handling (prefix match, not wildcard domain)."
  {"claude"  ["https://*.claudemcpcontent.com"]
   "chatgpt" ["https://*.web-sandbox.oaiusercontent.com"]

    ;; vscode-webview:// handled by mcp-sandbox-origin? in security middleware
   "cursor-vscode"  []})

;;; ------------------------------------------------ Settings ------------------------------------------------

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
