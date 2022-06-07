(ns metabase-enterprise.sandbox.models.params.field-values
  (:require [clojure.core.memoize :as memoize]
            [metabase-enterprise.sandbox.api.table :as table]
            [metabase.api.common :as api]
            [metabase.db.connection :as mdb.connection]
            [metabase.models.field :as field :refer [Field]]
            [metabase.models.field-values :as field-values :refer [FieldValues]]
            [metabase.models.params.field-values :as params.field-values]
            [metabase.public-settings.premium-features :refer [defenterprise]]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.hydrate :refer [hydrate]]))

(comment api/keep-me)
(comment mdb.connection/keep-me) ; used for [[memoize/ttl]]

(def ^:private ^{:arglist '([last-updated field])} fetch-sandboxed-field-values*
  (memoize/ttl
   ;; use a custom key fn for memoization. The custom key includes current User ID and a hash of their permissions
   ;; set, so we cache per-User (and so changes to that User's permissions will result in a cache miss), and Field ID
   ;; instead of an entire Field object (so maps with slightly different keys are still considered equal)
   ^{::memoize/args-fn (fn [[updated-at field]]
                         [(mdb.connection/unique-identifier)
                          api/*current-user-id*
                          (hash @api/*current-user-permissions-set*)
                          updated-at
                          (u/the-id field)])}
   (fn [_ field]
     {:values   (field-values/distinct-values field)
      :field_id (u/the-id field)})
   ;; TODO -- shouldn't we return sandboxed human-readable values as well??
   ;;
   ;; Expire entries older than 30 days so we don't have entries for users and/or fields that
   ;; no longer exists hanging around.
   ;; (`clojure.core.cache/TTLCacheQ` (which `memoize` uses underneath) evicts all stale entries on
   ;; every cache miss)
   :ttl/threshold (* 1000 60 60 24 30)))

(defn- fetch-sandboxed-field-values
  [field]
  (fetch-sandboxed-field-values*
   (db/select-one-field :updated_at FieldValues :field_id (u/the-id field))
   field))

(defn- field-is-sandboxed?
  [{:keys [table], :as field}]
  ;; slight optimization: for the `field-id->field-values` version we can batched hydrate `:table` to avoid having to
  ;; make a bunch of calls to fetch Table. For `get-or-create-field-values` we don't hydrate `:table` so we can fall
  ;; back to fetching it manually with `field/table`
  (table/only-segmented-perms? (or table (field/table field))))

(defenterprise field-id->field-values-for-current-user*
  "Fetch *existing* FieldValues for a sequence of `field-ids` for the current User. Values are returned as a map of

    {field-id FieldValues-instance}

  Returns `nil` if `field-ids` is empty of no matching FieldValues exist."
  :feature :sandboxes
  [field-ids]
  (let [fields                   (when (seq field-ids)
                                   (hydrate (db/select Field :id [:in (set field-ids)]) :table))
        {unsandboxed-fields false
         sandboxed-fields   true} (group-by (comp boolean field-is-sandboxed?) fields)]
    (merge
     ;; use the normal OSS batched implementation for any Fields that aren't subject to sandboxing.
     (when (seq unsandboxed-fields)
       (params.field-values/default-field-id->field-values-for-current-user
        (set (map u/the-id unsandboxed-fields))))
     ;; for sandboxed fields, fetch the sandboxed values individually.
     (into {} (for [{field-id :id, :as field} sandboxed-fields]
                [field-id (fetch-sandboxed-field-values field)])))))

(defenterprise get-or-create-field-values-for-current-user!*
  "Fetch cached FieldValues for a `field`, creating them if needed if the Field should have FieldValues. These
  should be filtered as appropriate for the current User (currently this only applies to the EE impl)."
  :feature :sandboxes
  [field]
  (if (field-is-sandboxed? field)
    ;; if sandboxing is in effect we never actually "save" the FieldValues the way the OSS/non-sandboxed impl does.
    (fetch-sandboxed-field-values field)
    (params.field-values/default-get-or-create-field-values-for-current-user! field)))
