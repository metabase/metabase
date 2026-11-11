(ns metabase.toucan.core
  "Toucan 2 for app-DB callers: its query calls bind every runtime value with `[:auto/param ...]` unless it is a
  `fragment`, and take only literal table and column names. Define Toucan methods on `toucan2.core` itself."
  (:refer-clojure :exclude [compile count instance?])
  (:require
   [metabase.toucan.impl]
   [potemkin :as p]
   [toucan2.core]))

(comment metabase.toucan.impl/keep-me)

(p/import-vars
 [metabase.toucan.impl
  column-name
  count
  define-batched-hydrate
  define-model-for-automagic-hydration
  define-primary-keys
  define-simple-hydrate
  define-table-name
  delete!
  exists?
  fragment
  fragment?
  query
  query-one
  reducible-query
  reducible-select
  select
  select-fn->fn
  select-fn->pk
  select-fn-reducible
  select-fn-set
  select-fn-vec
  select-one
  select-one-fn
  select-one-pk
  select-pk->fn
  select-pks-set
  select-pks-vec
  table-name
  update!
  update-returning-pks!
  value]
 [toucan2.core
  changes
  compile
  current
  define-after-insert
  define-after-select
  define-after-update
  define-before-delete
  define-before-insert
  define-before-select
  define-before-update
  define-default-fields
  deftransforms
  hydrate
  insert!
  insert-returning-instance!
  insert-returning-instances!
  insert-returning-pk!
  insert-returning-pks!
  instance
  instance-of?
  instance?
  model
  original
  primary-key-values-map
  primary-keys
  resolve-model
  save!
  select-pks-fn
  transforms
  with-call-count
  with-connection
  with-transaction])
