(ns metabase.mcp.v2.write
  "Write-path machinery shared by v2 `_write` tools. Landed with its first consumers: [[readback]] with
   `bookmark_content`, `_write` method dispatch with `collection_write`."
  (:require
   [clojure.string :as str]
   [metabase.mcp.scope :as mcp.scope]
   [metabase.mcp.v2.common :as common]))

(set! *warn-on-reflection* true)

(defn readback
  "`row` when `token-scopes` could read the entity back through the read tools, else a
   minimal `{id, url?, note}` acknowledgement plus `ack-keys` — a write succeeding must never
   double as a read, or the write scope becomes a read oracle for content the token's read
   scopes deny (a no-op update would return the full entity). `read-scopes` is everything the
   read path would demand: the read tool's own scope plus any per-type extra. `ack-keys` are
   keys of `row` the caller already supplied (and are thus not read-gated) that should survive
   the degradation — e.g. `bookmark_content`'s `:bookmarked`. Unscoped callers (cookie sessions
   bind the unrestricted sentinel) always get the row."
  ([token-scopes read-scopes row] (readback token-scopes read-scopes row nil))
  ([token-scopes read-scopes row ack-keys]
   (let [missing (remove #(mcp.scope/matches? token-scopes %) read-scopes)]
     (if (empty? missing)
       row
       (assoc (select-keys row (into [:id :url] ack-keys))
              :note (format "Written. Reading it back requires the %s scope%s this token doesn't have."
                            (str/join " and " missing)
                            (if (next missing) "s" "")))))))

(defn- expand-clear
  "Turn a `clear` list of property names into explicit nils on `args`. Null can't carry this
   meaning itself: the registry strips nulls at the boundary because strict clients flood every
   declared property with null, so `description: null` cannot be told apart from \"didn't touch
   it\". A list of names survives that stripping and says it unambiguously. The nils are what the
   tools' update paths already read — they test `contains?` (or `select-keys`), so a present-but-nil
   key sets the column to nil without any per-tool change."
  [args clearable clear]
  (if (empty? clear)
    (dissoc args :clear)
    (let [clearable (set clearable)
          fields    (map keyword clear)]
      (doseq [field fields]
        (when-not (contains? clearable field)
          (common/throw-teaching-error
           (if (seq clearable)
             (format "`%s` can't be cleared. This tool can clear: %s."
                     (name field) (str/join ", " (sort (map name clearable))))
             (format "`%s` can't be cleared — this tool has no clearable properties."
                     (name field)))))
        (when (some? (get args field))
          (common/throw-teaching-error
           (format "`%s` is both set and cleared in the same call — pass one or the other."
                   (name field)))))
      (reduce #(assoc %1 %2 nil) (dissoc args :clear) fields))))

(defn dispatch-write
  "Shared `method` dispatch for `_write` tools. `entry` carries the tool's write contract:
   `:create-required` (arg keys enforced at create with teaching errors — the \"(create)\" markers
   in the spec) and `:clearable` (the property names `clear` may name — see [[expand-clear]]). The
   tool's single write `:scope` is enforced at the registry gate, so dispatch itself does no scope
   checking.

   Returns `[:create args]` or `[:update id args]` (with `:method`/`:id`/`:clear` stripped, and any
   cleared property present as an explicit nil), or throws a teaching error. Does not itself touch
   the DB — the tool handler consumes the result."
  [{:keys [create-required clearable]} {:keys [method id clear] :as args}]
  (case method
    "create"
    (do
      (when (seq clear)
        (common/throw-teaching-error
         "`clear` applies to method \"update\" only — a new object has nothing set to clear."))
      (doseq [k create-required]
        (when (nil? (get args k))
          (common/throw-teaching-error (format "`%s` is required when method is \"create\"." (name k)))))
      [:create (dissoc args :method :clear)])

    "update"
    (do
      (when (nil? id)
        (common/throw-teaching-error "`id` is required when method is \"update\"."))
      [:update id (-> (dissoc args :method :id)
                      (expand-clear clearable clear))])

    (common/throw-teaching-error (format "Invalid method %s — use \"create\" or \"update\"." (pr-str method)))))
