(ns metabase-enterprise.sandbox.api.column-filter
  "Centralized helpers for filtering column metadata returned to sandboxed users.

  A sandbox can be backed by a saved question (Card) that selects a subset of the columns
  in the sandboxed table. When that happens, any UI surface that lists columns must hide
  the columns the sandbox doesn't expose. This namespace provides the lookup + filter
  primitives used by every such endpoint.

  ## Fail-closed semantics

  If `find-sandbox-source-cards` returns a card for the given (user, table) but that
  card's `:result_metadata` is `nil` or `[]`, the allowed-column set is empty and every
  field is filtered out. This is intentional.

  *Fail-open* (returning all columns when the allowed set is unknowable) would silently
  degrade a sandbox stuck in failed-metadata-extraction state into no column restriction
  at all — a security regression. *Fail-loud* (throwing 503) would require every FE
  surface to handle a new error state. Fail-closed is the conservative middle.

  In the legitimate case (card was just created, async metadata computation hasn't
  finished) sandboxed users see zero columns until the metadata lands. For permanently
  failed extractions, sandboxed users will see zero columns until an admin fixes the source
  card — which is what we want, given the alternative is leaking every column."
  (:require
   [metabase.lib.core :as lib]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn find-sandbox-source-cards :- [:map-of ms/PositiveInt :map]
  "Return `{table-id => sandbox-source-card}` for the `table-ids` that have a Card-backed sandbox for the current user.
  Tables with no sandbox, or with attribute-only sandboxes (no `card_id`), are absent. Reads `perms/sandboxes-for-user`,
  the per-request cache, so returns `{}` outside a request (background tasks, REPL) even when sandboxes are configured."
  [table-ids :- [:set ms/PositiveInt]]
  (let [sandboxes (filter (comp table-ids :table_id) (perms/sandboxes-for-user))
        card-ids  (into #{} (keep :card_id) sandboxes)]
    (if (seq card-ids)
      (let [cards-by-id (t2/select-pk->fn identity [:model/Card :id :dataset_query :result_metadata :card_schema]
                                          :id [:in card-ids])]
        (into {}
              (keep (fn [{:keys [table_id card_id]}]
                      (when-let [card (get cards-by-id card_id)]
                        [table_id card])))
              sandboxes))
      {})))

(defn- allowed-id-set [{result-metadata :result_metadata}]
  (into #{} (keep u/id) result-metadata))

(defn- allowed-name-set [{result-metadata :result_metadata}]
  (into #{} (map :name) result-metadata))

(mu/defn filter-fields-by-card
  "Filter `fields` to those exposed by `card`, by field id for MBQL sandboxes and by name for native ones.
  Returns `fields` unchanged when `card` is nil or has no `:dataset_query`, and an empty seq when its
  `:result_metadata` is nil/empty (fail-closed; see ns docstring)."
  [card   :- [:maybe :map]
   fields :- [:sequential :map]]
  (let [sandbox-query (:dataset_query card)]
    (cond
      (nil? card)          fields
      (nil? sandbox-query) fields
      (lib/native-only-query? sandbox-query)
      (let [allowed (allowed-name-set card)]
        (filter #(contains? allowed (:name %)) fields))
      :else
      (let [allowed (allowed-id-set card)]
        (filter #(contains? allowed (:id %)) fields)))))

(mu/defn filter-fields-for-table
  "Return the `fields` for `table-id` that are visible to the current user under their sandbox configuration.
  Non-sandboxed tables and superusers receive `fields` unchanged."
  [table-id :- ms/PositiveInt
   fields   :- [:sequential :map]]
  (if-let [card (get (find-sandbox-source-cards #{table-id}) table-id)]
    (filter-fields-by-card card fields)
    fields))

(mu/defn batch-filter-fields-by-table
  "Return the `{table-id => fields}` map with each table's fields filtered to those visible to the current user.
  Filters per the user's sandbox configuration, using a single DB query for all sandbox source cards."
  [fields-by-table :- [:map-of ms/PositiveInt [:sequential :map]]]
  (let [card-by-table (find-sandbox-source-cards (set (keys fields-by-table)))]
    (into {}
          (map (fn [[table-id fields]]
                 [table-id (if-let [card (get card-by-table table-id)]
                             (filter-fields-by-card card fields)
                             fields)]))
          fields-by-table)))

;;; ----------------------------- defenterprise wrappers -----------------------------
;;;
;;; The OSS stubs (no-ops) live in metabase.warehouse-schema.table. Consumers that need
;;; this filter (db-metadata, /fks, /idfields, etc.) call the OSS stubs; loading EE
;;; replaces the implementation with the real filtering.

(defenterprise filter-sandboxed-fields
  "Filter `fields` to those visible to the current user under their column-restricting sandbox on `table-id`.
  No-op for OSS / non-sandboxed users."
  :feature :sandboxes
  [table-id fields]
  (filter-fields-for-table table-id fields))

(defenterprise batch-filter-sandboxed-fields
  "Filter the `{table-id => fields}` map per the current user's sandbox configuration.
  No-op for OSS / non-sandboxed users."
  :feature :sandboxes
  [fields-by-table]
  (batch-filter-fields-by-table fields-by-table))
