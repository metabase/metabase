(ns metabase-enterprise.sandbox.models.params.field-values
  (:require [clojure.core.memoize :as memoize]
            [metabase-enterprise.enhancements.ee-strategy-impl :as ee-strategy-impl]
            [metabase-enterprise.sandbox.api.table :as sandbox.api.table]
            [metabase.api.common :as api]
            [metabase.models.field :as field :refer [Field]]
            [metabase.models.field-values :as field-values :refer [FieldValues]]
            [metabase.models.params.field-values :as params.field-values]
            [metabase.public-settings.metastore :as settings.metastore]
            [metabase.util :as u]
            [pretty.core :as pretty]
            [toucan.db :as db]))

(def ^:private ^{:arglist '([user-id last-updated field])} fetch-sandboxed-field-values*
  (memoize/ttl
   ;; use a custom key fn for memoization so two Field maps with different keys but the same `:id` still have the same
   ;; cache key.
   ^{::memoize/args-fn (fn [[current-user-id updated-at field]]
                         [current-user-id updated-at (u/the-id field)])}
   (fn [_ _ field]
     {:values   (field-values/distinct-values field)
      :field_id (u/the-id field)})
   ;; TODO -- shouldn't we return sandboxed human-readable values as well??
   ;;
   ;; Expire entires older than 30 days so we don't have entries for users and/or fields that
   ;; no longer exists hanging around.
   ;; (`clojure.core.cache/TTLCacheQ` (which `memoize` uses underneath) evicts all stale entries on
   ;; every cache miss)
   :ttl/threshold (* 1000 60 60 24 30)))

(defn- fetch-sandboxed-field-values
  [field]
  (fetch-sandboxed-field-values*
   api/*current-user-id*
   (db/select-one-field :updated_at FieldValues :field_id (u/the-id field))
   field))

(defn- field-is-sandboxed? [field]
  (sandbox.api.table/only-segmented-perms? (field/table field)))

(defn- fetch-sandboxed-field-values-if-field-is-sandboxed [field]
  (when (field-is-sandboxed? field)
    (fetch-sandboxed-field-values field)))

(defn- field-id->field-values-for-current-user [field-ids]
  (let [fields                   (when (seq field-ids)
                                   (db/select Field :id [:in (set field-ids)]))
        {unsandboxed-fields false
         sandboxed-fields   true} (group-by (comp boolean field-is-sandboxed?) fields)]
    (merge
     ;; use the normal OSS batched implementation for any Fields that aren't subject to sandboxing.
     (when (seq unsandboxed-fields)
       (params.field-values/field-id->field-values-for-current-user*
        params.field-values/default-impl
        (set (map u/the-id unsandboxed-fields))))
     ;; for sandboxed fields, fetch the sandboxed values individually.
     (into {} (for [{field-id :id, :as field} sandboxed-fields]
                [field-id (fetch-sandboxed-field-values field)])))))

(def ^:private impl
  (reify
    pretty/PrettyPrintable
    (pretty [_]
      `impl)

    params.field-values/FieldValuesForCurrentUser
    (get-or-create-field-values-for-current-user!* [_ field]
      (or (when (field-is-sandboxed? field)
            (fetch-sandboxed-field-values field))
          (params.field-values/get-or-create-field-values-for-current-user!* params.field-values/default-impl field)))

    (field-id->field-values-for-current-user* [_ field-ids]
      (field-id->field-values-for-current-user field-ids))))

(def ee-strategy-impl
  "Enterprise version of the fetch FieldValues for current User logic. Uses our EE strategy pattern adapter: if EE
  features *are* enabled, forwards method invocations to `impl`; if EE features *are not* enabled, forwards method
  invocations to the default OSS impl."
  (ee-strategy-impl/reify-ee-strategy-impl #'settings.metastore/enable-sandboxes? impl params.field-values/default-impl
    params.field-values/FieldValuesForCurrentUser))
