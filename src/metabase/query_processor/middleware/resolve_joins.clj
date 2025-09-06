(ns metabase.query-processor.middleware.resolve-joins
  "Middleware that fetches tables that will need to be joined, referred to by `:field` clauses with `:source-field`
  options, and adds information to the query about what joins should be done and how they should be performed."
  (:refer-clojure :exclude [alias])
  (:require
   [clojure.string :as str]
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.lib.walk :as lib.walk]
   [metabase.util.malli :as mu]))

(mu/defn- resolve-join :- ::lib.schema.join/join
  [join  :- ::lib.schema.join/join]
  (merge
   join
   ;; this key is used just to tell [[metabase.lib.convert]] not to remove the default join alias e.g. `__join` upon
   ;; conversion back to legacy
   (when (str/starts-with? (:alias join) lib/legacy-default-join-alias)
     {:qp/keep-default-join-alias true})))

(mu/defn resolve-joins :- ::lib.schema/query
  "* Replace `:fields :all` inside joins with a sequence of field refs

  * Add default values for `:strategy`

  * Add join fields to parent stage `:fields` as needed."
  [query :- ::lib.schema/query]
  (lib.walk/walk
   query
   (fn [_query path-type _path join]
     (when (= path-type :lib.walk/join)
       (resolve-join join)))))
