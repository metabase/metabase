(ns metabase.mcp.settings
  "Settings for MCP Apps CORS origins and MCP session key derivation."
  (:require
   [clojure.string :as str]
   [metabase.llm.settings :as llm.settings]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.startup.core :as startup]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.log :as log]
   [metabase.util.string :as u.str]))

;; NOTE: uuid-nonce-base sets :setter :none, so this secret is not rotatable via the normal settings API.
;; If rotation is needed (e.g. after a DB breach), an admin action should regenerate the secret and
;; invalidate existing MCP-backed core_session rows. See also: premium-embedding-token-signing-key.
;;
;; The getter is obfuscated so that the raw secret can never leak via settings APIs, the admin UI,
;; logs, or audit events — only a masked form is exposed. Internal callers that actually need to
;; HMAC with the secret must use `unobfuscated-mcp-embedding-signing-secret`.
(defsetting mcp-embedding-signing-secret
  "Instance-wide secret used to derive embedding session keys for MCP sessions."
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

   ;; vscode-webview:// handled by metabase.mcp.core/sandbox-origin?
   "cursor-vscode"  []})

(def ^:private client-key-aliases
  "Other names accepted for a client key in [[mcp-apps-cors-enabled-clients]].
   Cursor and VS Code share one key: both render MCP Apps in a vscode-webview, so CORS can't tell them apart."
  {"cursor" "cursor-vscode"
   "vscode" "cursor-vscode"})

(defn- canonical-client-key
  "The client key that `entry` names, ignoring case and surrounding spaces and resolving aliases, or nil when it
   names no client."
  [entry]
  (let [k (u/lower-case-en (str/trim (str entry)))]
    (if (contains? mcp-client-apps-sandbox-domains k)
      k
      (client-key-aliases k))))

(defn- accepted-client-names-text []
  (str/join ", " (concat (keys mcp-client-apps-sandbox-domains) (keys client-key-aliases))))

(defn- parse-enabled-clients
  "Splits `entries` into `:keys`, the distinct client keys they name, and `:unknown`, the entries that name none.
   Blank entries are ignored."
  [entries]
  (let [entries (remove (comp str/blank? str) entries)]
    {:keys    (into [] (comp (keep canonical-client-key) (distinct)) entries)
     :unknown (into [] (remove canonical-client-key) entries)}))

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

(def ^:private ^:const default-query-handle-ttl-hours
  "Default for [[mcp-query-handle-ttl-hours]]. One source, referenced by both the setting's `:default`
   and its getter's fallback, so the two can't drift."
  24)

(defsetting mcp-query-handle-ttl-hours
  "Hours a stored MCP query handle is kept before the scheduled GC task deletes it."
  ;; `:positive-integer` rather than `:integer`: the GC deletes handles created before `now - ttl`,
  ;; so 0 puts the cutoff at *now* and clears the whole table on the next run, and a negative takes
  ;; handles minted seconds ago. The type guards the read path too, which a `:setter` cannot —
  ;; env vars are read straight through `get-raw-value` and never pass through one.
  :type       :positive-integer
  :default    default-query-handle-ttl-hours
  :visibility :internal
  :export?    false
  :doc        false
  ;; The read predicate yields nil for a stored non-positive rather than falling back to the
  ;; default, and the GC would then `(long nil)`. Fall back here, as `attachment-table-row-limit`
  ;; does for the same reason.
  :getter     (fn []
                ;; `get-raw-value` rethrows a parse failure (e.g. MB_MCP_QUERY_HANDLE_TTL_HOURS=forever),
                ;; which would kill the GC task on every run — an unreadable value means the default,
                ;; same as a non-positive one.
                (or (try
                      (setting/get-value-of-type :positive-integer :mcp-query-handle-ttl-hours)
                      (catch Exception _ nil))
                    default-query-handle-ttl-hours)))

(defn- bad-request [message]
  (ex-info message {:status-code 400}))

(defn- setter-entries
  "The entries in `new-value`, a list of names or a CSV string of one line.
   Throws a 400 for any other value."
  [new-value]
  (cond
    (or (nil? new-value) (sequential? new-value))
    new-value

    ;; The API and config.yml can both pass a CSV string. Parse it as the :csv type will, to check its names first.
    (string? new-value)
    (setting/csv-string-entries new-value)

    :else
    (throw (bad-request (tru "MCP clients must be a list of names, or a comma-separated string.")))))

(defn- -mcp-apps-cors-enabled-clients!
  "The setter for [[mcp-apps-cors-enabled-clients]].
   Stores the canonical keys.
   Throws a 400 when the value is malformed or an entry names no client."
  [new-value]
  (let [{client-keys :keys, unknown :unknown} (parse-enabled-clients (setter-entries new-value))]
    (when (seq unknown)
      (throw (bad-request (tru "Unknown MCP clients: {0}. Accepted values: {1}."
                               (str/join ", " unknown)
                               (accepted-client-names-text)))))
    (setting/set-value-of-type! :csv :mcp-apps-cors-enabled-clients (not-empty client-keys))))

(defsetting mcp-apps-cors-enabled-clients
  (deferred-tru "MCP clients whose MCP Apps may call Metabase across origins, as comma-separated keys: claude, chatgpt, and cursor-vscode (for both Cursor and VS Code).")
  :type       :csv
  :default    []
  :visibility :admin
  :export?    false
  :encryption :when-encryption-key-set
  :audit      :getter
  :setter     #'-mcp-apps-cors-enabled-clients!
  ;; Env vars skip the setter, so the getter normalizes too. It drops unknown entries rather than keeping them:
  ;; the admin page writes back the whole list, and the setter would reject every save. The startup logic below
  ;; logs what was dropped. Reads happen on every HTTP response, so an unparsable value means no clients
  ;; rather than a throw.
  :getter     (fn []
                (try
                  (:keys (parse-enabled-clients (setting/get-value-of-type :csv :mcp-apps-cors-enabled-clients)))
                  (catch Exception _ []))))

(defmethod startup/def-startup-logic! ::warn-about-unknown-mcp-apps-cors-enabled-clients [_]
  (let [source (or (first (setting/env-var-source :mcp-apps-cors-enabled-clients))
                   "mcp-apps-cors-enabled-clients")]
    (try
      (when-let [unknown (not-empty (:unknown (parse-enabled-clients
                                               (setting/get-value-of-type :csv :mcp-apps-cors-enabled-clients))))]
        (log/warnf "Ignoring unknown MCP clients in %s: %s. Accepted values: %s."
                   source
                   (str/join ", " unknown)
                   (accepted-client-names-text)))
      ;; Startup skips settings with a custom getter. This one reads the value as :csv, so it ignores later lines too.
      (setting/warn-about-ignored-csv-lines! :mcp-apps-cors-enabled-clients)
      (catch Exception _
        ;; The getter already treats this value as no clients; say so once, without a stack trace.
        (log/warnf "Could not parse %s as comma-separated MCP clients, so all MCP clients are disabled."
                   source)))))

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
  :encryption :when-encryption-key-set
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

(defn inline-ui-enabled-for-client?
  "Whether `client-key`, from [[metabase.mcp.usage/detect-client]], may render MCP Apps UI.
   Clients without a toggle are not gated."
  [client-key]
  ;; An iframe from a client the admin switched off fails its CORS preflight, so it would show a broken card.
  (if-let [setting-key (some-> client-key canonical-client-key)]
    (boolean (some #{setting-key} (mcp-apps-cors-enabled-clients)))
    true))
