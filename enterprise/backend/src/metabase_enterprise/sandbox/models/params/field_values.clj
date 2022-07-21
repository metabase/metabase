(ns metabase-enterprise.sandbox.models.params.field-values
  (:require [metabase-enterprise.sandbox.api.table :as table]
            [metabase.api.common :as api]
            [metabase.models.field :as field :refer [Field]]
            [metabase.models.field-values :as field-values]
            [metabase.models.params.field-values :as params.field-values]
            [metabase.public-settings.premium-features :refer [defenterprise]]
            [toucan.db :as db]))

(comment api/keep-me)

(defn- field-is-sandboxed?
  [{:keys [table], :as field}]
  ;; slight optimization: for the `field-id->field-values` version we can batched hydrate `:table` to avoid having to
  ;; make a bunch of calls to fetch Table. For `get-or-create-field-values` we don't hydrate `:table` so we can fall
  ;; back to fetching it manually with `field/table`
  (table/only-segmented-perms? (or table (field/table field))))

(defenterprise get-or-create-field-values-for-current-user!*
  "Fetch cached FieldValues for a `field`, creating them if needed if the Field should have FieldValues. These
  should be filtered as appropriate for the current User (currently this only applies to the EE impl)."
  :feature :sandboxes
  [field]
  (if (field-is-sandboxed? field)
    (params.field-values/get-or-create-advanced-field-values! :sandbox field)
    (params.field-values/default-get-or-create-field-values-for-current-user! field)))

(defenterprise hash-key-for-linked-filters
  "Returns a hash-key for linked-filter FieldValues if the field is sandboxed, otherwise fallback to the OSS impl."
  :feature :sandboxes
  [field-id constraints]
  (if (field-is-sandboxed? (db/select-one Field :id field-id))
    (str (hash [api/*current-user-id*
                @api/*current-user-permissions-set*
                field-id
                constraints]))
    (field-values/default-hash-key-for-linked-filters field-id constraints)))

(defenterprise hash-key-for-sandbox
  "Returns a hash-key for linked-filter FieldValues if the field is sandboxed, otherwise fallback to the OSS impl."
  :feature :sandboxes
  [field-id]
  (when (field-is-sandboxed? (db/select-one Field :id field-id))
    (str (hash [field-id
                api/*current-user-id*
                @api/*current-user-permissions-set*]))))
