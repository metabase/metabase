(ns metabase.dependencies.analysis
  "The helpers that the dependencies specs of the models analyze a row with: the errors of its query, and the columns
  that a query returns."
  (:require
   [metabase.dependencies.native :as dependencies.native]
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.validate :as lib.schema.validate]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(mu/defn query-errors :- [:set [:ref ::lib.schema.validate/error-with-source]]
  "The bad references of `query`, which reads the metadata of its own database, each with the entity it comes from
  when that is known."
  [query :- ::lib.schema/query]
  (if (lib/any-native-stage? query)
    (dependencies.native/native-query-errors query)
    (into #{} (remove :soft?) (lib/find-bad-refs-with-source query))))

(mu/defn query-returned-columns :- [:maybe [:sequential :map]]
  "The columns that `query` returns."
  [query :- ::lib.schema/query]
  (if (lib/any-native-stage? query)
    (dependencies.native/native-query-returned-columns query)
    (lib/returned-columns query)))
