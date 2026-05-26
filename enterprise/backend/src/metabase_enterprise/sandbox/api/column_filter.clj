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

  The vulnerable window for the legitimate case (card was just created, async metadata
  computation hasn't finished) is bounded by `metabase.queries.models.card.metadata/
  metadata-sync-wait-ms` (1.5 seconds) for live admin workflows. For permanently failed
  extractions, sandboxed users will see zero columns until an admin fixes the source card
  — which is what we want, given the alternative is leaking every column."
  (:require
   [metabase.lib.core :as lib]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn find-sandbox-source-cards :- [:map-of ms/PositiveInt :map]
  "For the given `user-id` and `table-ids`, return `{table-id => sandbox-source-card}` for
  tables that have an MBQL/native sandbox sourced from a Card for that user. Tables
  without a sandbox, or with attribute-only sandboxes (no card_id), are absent from the
  map."
  [user-id   :- [:maybe ms/PositiveInt]
   table-ids :- [:set ms/PositiveInt]]
  (if (and user-id (seq table-ids))
    (let [rows (t2/select :model/Card
                          {:select [:c.id :c.dataset_query :c.result_metadata :c.card_schema
                                    [:sandboxes.table_id :_sandbox_table_id]]
                           :from   [[:sandboxes]]
                           :join   [[:permissions_group_membership :pgm]
                                    [:= :sandboxes.group_id :pgm.group_id]
                                    [:report_card :c] [:= :c.id :sandboxes.card_id]]
                           :where  [:and
                                    [:in :sandboxes.table_id table-ids]
                                    [:= :pgm.user_id user-id]]})]
      (into {} (map (juxt :_sandbox_table_id #(dissoc % :_sandbox_table_id))) rows))
    {}))

(defn- allowed-id-set [{result-metadata :result_metadata}]
  (into #{} (keep u/id) result-metadata))

(defn- allowed-name-set [{result-metadata :result_metadata}]
  (into #{} (map :name) result-metadata))

(mu/defn filter-fields-by-card
  "Filter `fields` to those exposed by `card`.

  Uses field id for MBQL sandboxes and field name for native sandboxes. Returns `fields`
  unchanged if `card` is nil or has no `:dataset_query`. Returns an empty seq if `card`'s
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
  "Given a `table-id`, a `user-id`, and a collection of field maps for that table, return
  only the fields visible to the user under their sandbox configuration. Non-sandboxed
  tables and superusers receive `fields` unchanged."
  [table-id :- ms/PositiveInt
   user-id  :- [:maybe ms/PositiveInt]
   fields   :- [:sequential :map]]
  (if-let [card (get (find-sandbox-source-cards user-id #{table-id}) table-id)]
    (filter-fields-by-card card fields)
    fields))

(mu/defn batch-filter-fields-by-table
  "Given a `user-id` and a map of `{table-id => fields}`, return the same map with each
  table's fields filtered to those visible under the user's sandbox configuration.
  Performs a single DB query for all sandbox source cards."
  [user-id         :- [:maybe ms/PositiveInt]
   fields-by-table :- [:map-of ms/PositiveInt [:sequential :map]]]
  (let [card-by-table (find-sandbox-source-cards user-id (set (keys fields-by-table)))]
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
  "Filter `fields` to those visible to the user under their column-restricting sandbox
  on `table-id`. No-op for OSS / non-sandboxed users."
  :feature :sandboxes
  [table-id user-id fields]
  (filter-fields-for-table table-id user-id fields))

(defenterprise batch-filter-sandboxed-fields
  "Filter the `{table-id => fields}` map per the user's sandbox configuration. No-op
  for OSS / non-sandboxed users."
  :feature :sandboxes
  [user-id fields-by-table]
  (batch-filter-fields-by-table user-id fields-by-table))
