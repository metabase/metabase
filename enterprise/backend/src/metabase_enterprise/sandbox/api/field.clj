(ns metabase-enterprise.sandbox.api.field
  (:require [clojure.core.memoize :as memoize]
            [compojure.core :refer [GET]]
            [metabase-enterprise.sandbox.api.table :as sandbox.api.table]
            [metabase.api.common :as api]
            [metabase.api.field :as api.field]
            [metabase.models.field :as field :refer [Field]]
            [metabase.models.field-values :as field-values :refer [FieldValues]]
            [metabase.util :as u]
            [toucan.db :as db]))

(def ^:private ^{:arglist '([user-id last-updated field])} fetch-sandboxed-field-values*
  (memoize/ttl
   (fn [_ _ field]
     {:values   (map vector (field-values/distinct-values field))
      :field_id (u/the-id field)})
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

(api/defendpoint GET "/:id/values"
  "Wrapper around OSS version of `GET /api/field/:id/values`; if the current user has segmented permissions, returns
  sandboxed values rather than the full set of values."
  [id]
  (let [field (api/check-404 (Field id))]
    (if (sandbox.api.table/only-segmented-perms? (field/table field))
      (fetch-sandboxed-field-values field)
      (api.field/check-perms-and-return-field-values id))))

(api/define-routes)
