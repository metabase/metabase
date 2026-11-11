(ns metabase.toucan.core
  "Toucan 2 calls that bind every runtime value with `[:auto/param ...]` unless it is a `fragment`."
  (:require
   [metabase.toucan.impl]
   [potemkin :as p]))

(comment metabase.toucan.impl/keep-me)

(p/import-vars
 [metabase.toucan.impl
  delete!
  exists?
  fragment
  insert!
  query
  select
  select-one
  select-one-pk
  select-pk->fn
  update!
  value])
