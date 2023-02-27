(ns metabase.lib.core
  (:refer-clojure :exclude [remove replace =])
  (:require
   [metabase.lib.field :as lib.field]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.join :as lib.join]
   [metabase.lib.order-by :as lib.order-by]
   [metabase.lib.query :as lib.query]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.shared.util.namespaces :as shared.ns]))

(comment lib.field/keep-me
         lib.filter/keep-me
         lib.join/keep-me
         lib.order-by/keep-me
         lib.query/keep-me
         lib.temporal-bucket/keep-me)

(shared.ns/import-fns
 [lib.field
  field]
 [lib.filter
  =]
 [lib.join
  join
  join-clause
  joins]
 [lib.order-by
  order-by
  order-by-clause
  order-bys]
 [lib.query
  metadata
  native-query
  query
  saved-question-query]
 [lib.temporal-bucket
  temporal-bucket])
