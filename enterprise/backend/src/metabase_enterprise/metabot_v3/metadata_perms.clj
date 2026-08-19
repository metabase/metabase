(ns metabase-enterprise.metabot-v3.metadata-perms
  "Memo for the app-DB reads Metabot's metadata permission gates repeat within one tool call.

  Three questions get asked over and over: how far into these tables may the current user reach, which
  of them restrict columns by sandbox, and which table does this field belong to. A single
  `get-table-details` call asks all three once for the table's own columns, once to find its FK
  neighbours, and once per expanded neighbour.

  Answers are memoized per id in an atom bound by [[with-cache]]. The memo is a point-in-time
  snapshot: a permission written after a check has run is not seen by later checks in the same scope.
  That widens no window — the permission cache these answers derive from is bound by
  `with-current-user` and already spans the whole request. When no cache is bound every call reads
  through to the app DB, so callers outside a [[with-cache]] scope behave exactly as they did before.

  (Upstream 63 keys `queryable-table-ids` on `mi/can-query?` and primes a table-granular cache via
  `prime-table-perms-cache`; neither exists on this branch, so this port asks
  `metabase.query-permissions.core/can-query-table?` per table instead, and the sandbox lookup is
  implemented here directly since this namespace is EE-only.)"
  (:require
   [metabase.api.common :as api]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features]
   [metabase.query-permissions.core :as query-perms]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:dynamic *cache*
  "Atom of `{cache-key {id answer}}`, or nil to read through to the app DB on every call.

  Never give this a non-nil top-level value: a cache that outlives the scope [[with-cache]] establishes
  would answer from a snapshot taken before whatever changed the permissions."
  nil)

(defmacro with-cache
  "Memoize this namespace's lookups for the duration of `body`. Nesting reuses the enclosing cache."
  {:style/indent 0}
  [& body]
  `(binding [*cache* (or *cache* (atom {}))]
     ~@body))

(defn- memoized
  "Answer `ids` from cache `k`, computing whatever is missing with `(compute missing-ids)`.

  `compute` returns an id->answer map that may omit ids it found nothing for; `absent` is the answer
  stored for those, so a miss is never recomputed. Returns an id->answer map covering every id in
  `ids`."
  [k ids compute absent]
  (let [ids     (set ids)
        cache   *cache*
        ;; `*is-superuser?*` and not just the user id: `request/as-admin` keeps the id and flips the flag.
        k       [api/*current-user-id* api/*is-superuser?* k]
        known   (if cache (get @cache k {}) {})
        missing (into #{} (remove #(contains? known %)) ids)
        fresh   (when (seq missing)
                  (let [computed (compute missing)]
                    (into {} (map (fn [id] [id (get computed id absent)])) missing)))]
    (when (and cache (seq fresh))
      (swap! cache update k merge fresh))
    (select-keys (merge known fresh) ids)))

(defn- table-rows
  [table-ids]
  (memoized :table-row table-ids
            (fn [ids] (t2/select-fn->fn :id identity :model/Table :id [:in ids]))
            nil))

(defn- permitted-table-ids
  [k pred table-ids]
  (->> (memoized k table-ids
                 (fn [ids]
                   (let [tables (into [] (keep (table-rows ids)) ids)]
                     (into {} (comp (filter pred) (map (juxt :id (constantly true)))) tables)))
                 false)
       (into #{} (keep (fn [[id permitted?]] (when permitted? id))))))

(defn queryable-table-ids
  "The subset of `table-ids` the current user may run queries against. A table id with no
  `metabase_table` row is not queryable, so a caller that requires every id it passed in can compare
  sets and fail closed.

  The bar for a table the caller would have to join or query themselves to reach. Not `mi/can-read?`,
  which a `manage-table-metadata` grant satisfies with `view-data` still `:blocked`."
  [table-ids]
  (permitted-table-ids :queryable-table
                       (fn [table] (query-perms/can-query-table? (:db_id table) (:id table)))
                       table-ids))

(defn- data-accessible?
  [table]
  (perms/user-has-permission-for-table? api/*current-user-id*
                                        :perms/view-data :unrestricted
                                        (:db_id table) (:id table)))

(defn data-accessible-table-ids
  "The subset of `table-ids` the current user has `:perms/view-data :unrestricted` on. The bar for a
  table that an entity the caller may already read selects from: demanding `create-queries` on top
  would break a card published as a permissions boundary."
  [table-ids]
  (permitted-table-ids :data-accessible-table data-accessible? table-ids))

(defn- source-card-allowed-field-ids
  "Extract the set of allowed field IDs from a sandbox source card's result_metadata.
  Tries field IDs first; falls back to resolving column names against the table's fields
  (for native query source cards whose result_metadata lacks :id).
  Returns nil when result_metadata is absent (attribute-only sandbox or missing card)."
  [table-id {:keys [result_metadata]}]
  (when (seq result_metadata)
    (let [by-id (into #{} (keep u/id) result_metadata)]
      (if (seq by-id)
        by-id
        ;; Native card fallback: resolve column names → field IDs via the table
        (let [col-names (into #{} (keep :name) result_metadata)
              name->fid (when (seq col-names)
                          (into {}
                                (map (juxt :name :id))
                                (t2/select [:model/Field :id :name]
                                           :table_id table-id
                                           :name [:in col-names])))]
          (not-empty (set (vals name->fid))))))))

(defn- sandbox-restricted-fields*
  "For sandboxed tables, returns {table-id -> #{allowed-field-ids}} for tables with column-level
  sandbox restrictions. Tables not in the map have no column restriction. Returns nil if no
  sandboxes apply.

  When the :sandboxes feature is unavailable but sandboxes are configured, returns empty sets to
  block all columns from sandboxed tables (fail closed). When the feature is on, resolves allowed
  fields from source card result_metadata. (Upstream 63 reaches this logic through
  `metabase.metrics.core/sandbox-restricted-fields`, which does not exist on this branch; this
  namespace is EE-only so the implementation lives here.)"
  [table-ids]
  (when-let [sandboxes (seq (filter #(contains? table-ids (:table_id %))
                                    (perms/sandboxes-for-user)))]
    (if-not (premium-features/has-feature? :sandboxes)
      ;; Feature unavailable — block all columns from every sandboxed table
      (into {} (map (fn [{:keys [table_id]}] [table_id #{}])) sandboxes)
      ;; Feature available — resolve allowed fields from source cards
      (let [card-ids    (into #{} (keep :card_id) sandboxes)
            cards-by-id (when (seq card-ids)
                          (into {}
                                (map (juxt :id identity))
                                (t2/select [:model/Card :id :result_metadata :card_schema]
                                           :id [:in card-ids])))]
        (not-empty
         (into {}
               (keep (fn [{:keys [table_id card_id]}]
                       (if-not card_id
                         ;; Attribute-only sandbox — no column restriction
                         nil
                         ;; Source-card sandbox — resolve allowed fields, or block all if unresolvable
                         [table_id (or (source-card-allowed-field-ids table_id (get cards-by-id card_id))
                                       #{})])))
               sandboxes))))))

(defn sandbox-restricted-fields
  "`{table-id #{allowed-field-id}}` for the column-sandboxed subset of `table-ids`. A table absent from
  the result carries no column restriction."
  [table-ids]
  (->> (memoized :sandbox-fields table-ids
                 #(sandbox-restricted-fields* (set %))
                 ::unrestricted)
       (into {} (remove #(= ::unrestricted (val %))))))

(defn field-id->table-id
  "`{field-id table-id}` for `field-ids`. A field id with no `metabase_field` row is absent from the
  result."
  [field-ids]
  (->> (memoized :field-table field-ids
                 (fn [ids] (t2/select-fn->fn :id :table_id [:model/Field :id :table_id] :id [:in ids]))
                 nil)
       (into {} (remove #(nil? (val %))))))
