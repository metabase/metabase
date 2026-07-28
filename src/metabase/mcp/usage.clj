(ns metabase.mcp.usage
  "MCP usage logging.

  Three write points feed the MCP analytics tables: the session row at the `initialize`
  handshake, its `ended_at` stamp at session teardown, and one lean tool-call row per
  `tools/call`. All three are `defenterprise` no-ops in OSS — an OSS instance records
  nothing — with the real inserts in `metabase-enterprise.mcp.usage`. Like `ai_usage_log`,
  collection runs on every EE instance (`:feature :none`); the `:audit-app` feature gates
  the surfaces that read these rows (the audit view + page), not the writing.

  PII columns are populated only when `analytics-pii-retention-enabled` is on — a setting
  that is itself `:audit-app`-gated and defaults off, so PII is never collected without
  `:audit-app`. `client_name` is derived from the `initialize` handshake `clientInfo`
  (authoritative), never from User-Agent parsing."
  (:require
   [clojure.string :as str]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util :as u]))

(def supported-client-keys
  "Canonical MCP client keys [[detect-client]] classifies into for analytics. Keep in sync with
  the `client_name` CASE in the `v_mcp_tool_calls` view SQL (the enum-<->-CASE sync footgun)."
  #{"claude" "chatgpt" "cursor-vscode" "vscode" "zed"})

(def ^:private client-name-matchers
  "Ordered `[substring canonical-key]` pairs matched against the lowercased handshake
  `clientInfo.name` (after stripping any mcp-remote wrapper). First match wins. Both the
  spelled-out and compact forms of multi-word clients are listed so the fuzzy pass can catch
  abbreviations (e.g. `\"VS Code\"`)."
  [["claude"             "claude"]
   ["chatgpt"            "chatgpt"]
   ["openai"             "chatgpt"]
   ["cursor"             "cursor-vscode"]
   ["visual studio code" "vscode"]
   ["vscode"             "vscode"]
   ["zed"                "zed"]])

(def ^:private mcp-remote-wrapper-re
  "`mcp-remote` rewrites the handshake name to `\"<name> (via mcp-remote x.y.z)\"`; the strict
  pass strips that suffix so the real client name is what gets classified."
  #"\s*\(via mcp-remote[^)]*\)\s*$")

(def ^:private proxy-wrapper-re
  "A generic `\"(via <proxy> …)\"` suffix that MCP proxies append to the client name; the fuzzy
  pass strips any such wrapper so an unfamiliar proxy format never hides the client name."
  #"\s*\(via[^)]*\)\s*$")

(defn- normalize-client-name
  "Lowercase and drop everything but letters/digits, so spacing/punctuation variants
  (`\"VS Code\"`, `\"chat-gpt\"`) collapse to one comparable token."
  [s]
  (some-> s u/lower-case-en (str/replace #"[^a-z0-9]+" "")))

(def ^:private proxy-probe-client-name
  "`mcp-remote` opens a throwaway probe connection under this exact name while negotiating
  transports. It is never a real client and must not be recorded as a session."
  "mcp-remote-fallback-test")

(defn proxy-probe?
  "True when the `initialize` handshake is `mcp-remote`'s transport-probe connection, which is
  not a real client session and should be ignored for analytics."
  [client-info-name]
  (= (some-> client-info-name u/lower-case-en) proxy-probe-client-name))

(defn detect-client
  "Classify the `initialize`-handshake `clientInfo` name into a canonical client key (one of
  [[supported-client-keys]]), or `\"other\"` when nothing matches. Runs a strict substring match
  first (mcp-remote wrapper stripped); when that finds nothing, falls back to a fuzzier match
  that ignores spacing/punctuation and strips any generic `(via …)` proxy wrapper, so variant
  spellings and unfamiliar proxy formats still classify. Identity comes from the handshake name,
  never User-Agent parsing."
  [client-info-name]
  (let [strict (some-> client-info-name u/lower-case-en (str/replace mcp-remote-wrapper-re ""))
        fuzzy  (some-> client-info-name (str/replace proxy-wrapper-re "") normalize-client-name)]
    (or (when strict
          (some (fn [[needle k]] (when (str/includes? strict needle) k)) client-name-matchers))
        (when fuzzy
          (some (fn [[needle k]]
                  (when (str/includes? fuzzy (normalize-client-name needle)) k))
                client-name-matchers))
        "other")))

(defenterprise record-mcp-session!
  "Upsert an `mcp_session_log` row at the MCP `initialize` handshake. Identity + PII are
  written once and never overwritten. OSS no-op."
  metabase-enterprise.mcp.usage
  [_session-info]
  nil)

(defenterprise record-mcp-session-end!
  "Stamp `ended_at` on an `mcp_session_log` row at session teardown. OSS no-op."
  metabase-enterprise.mcp.usage
  [_session-id]
  nil)

(defenterprise record-mcp-tool-call!
  "Write a lean `mcp_tool_call_log` row for a `tools/call`. OSS no-op."
  metabase-enterprise.mcp.usage
  [_tool-call-info]
  nil)
