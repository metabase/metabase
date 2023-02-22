(ns metabase.lib
  (:refer-clojure :exclude [remove replace])
  (:require
   [metabase.lib.append :as lib.append]
   [metabase.lib.field :as lib.field]
   [metabase.lib.order-by :as lib.order-by]
   [metabase.lib.query :as lib.query]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.shared.util.namespaces :as shared.ns]))

(comment lib.append/keep-me
         lib.field/keep-me
         lib.order-by/keep-me
         lib.query/keep-me
         lib.temporal-bucket/keep-me)

(shared.ns/import-fns
 [lib.append
  append]
 [lib.field
  field]
 [lib.order-by
  order-by
  order-bys]
 [lib.query
  native-query
  query
  saved-question-query]
 [lib.temporal-bucket
  temporal-bucket])
