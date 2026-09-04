(ns metabase.mcp.v2.write
  "Write-path machinery shared by v2 `_write` tools."
  (:require
   [clojure.string :as str]
   [metabase.mcp.scope :as mcp.scope]))

(set! *warn-on-reflection* true)

(defn readback
  "`row` when `token-scopes` could read the entity back through the read tools, else a
   minimal `{id, url?, note}` acknowledgement plus `ack-keys` — a write succeeding must never
   double as a read, or the write scope becomes a read oracle for content the token's read
   scopes deny (a no-op update would return the full entity). `read-scopes` is everything the
   read path would demand: the read tool's own scope plus any per-type extra. `ack-keys` are
   keys of `row` the caller already supplied (and are thus not read-gated) that should survive
   the degradation — e.g. `bookmark_content`'s `:bookmarked`. Unscoped callers (cookie sessions
   bind the unrestricted sentinel) always get the row. Throws when `read-scopes` is empty."
  [token-scopes read-scopes row ack-keys]
  ;; An empty `read-scopes` would make `missing` empty and hand back the ungated row, which is
  ;; indistinguishable from a gate that ran and passed. Every caller reads something back, so
  ;; there is no legitimate empty case -- refuse it rather than silently degrade to no gate.
  (when (empty? read-scopes)
    (throw (ex-info "readback needs at least one read scope; an empty read-scopes would skip the gate"
                    {:read-scopes read-scopes})))
  (let [missing (remove #(mcp.scope/matches? token-scopes %) read-scopes)]
    (if (empty? missing)
      row
      (assoc (select-keys row (into [:id :url] ack-keys))
             :note (format "Written. Reading it back requires the %s scope%s this token doesn't have."
                           (str/join " and " missing)
                           (if (next missing) "s" ""))))))
