(ns metabase.funnysql.core
  "The main API of Funny SQL, a closed Honey SQL compiler for app-DB queries: [[format]] compiles a query map or an
  expression to `[sql & args]` for `:h2`, `:postgres` or `:mysql`, with `::compiled` metadata."
  (:refer-clojure :exclude [format])
  (:require
   [metabase.funnysql.format]
   [metabase.util.namespaces :as shared.ns]))

(shared.ns/import-fns
 [metabase.funnysql.format
  format])
