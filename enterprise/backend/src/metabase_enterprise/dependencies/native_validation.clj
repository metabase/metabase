(ns metabase-enterprise.dependencies.native-validation
  (:require
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.util.malli :as mu]))

(mu/defn- compile-query :- ::lib.schema/native-only-query
  [query :- ::lib.schema/query]
  (-> query
      lib/add-parameters-for-template-tags
      ;; to expand template tag parameters
      qp.preprocess/preprocess
      (as-> $query (if (lib/native-only-query? $query)
                     $query
                     (lib/native-query $query (:query (qp.compile/compile $query)))))))

(mu/defn validate-native-query
  "Compiles a (native) query and validates that the fields and tables it refers to really exist.

   Returns either nil or a list of errors."
  [driver :- :keyword
   query  :- ::lib.schema/query]
  (->> query
       compile-query
       (driver/validate-native-query-fields driver)))

(mu/defn native-result-metadata
  "Compiles a (native) query and calculates its result metadata"
  [driver :- :keyword
   query  :- ::lib.schema/query]
  (->> query
       compile-query
       (driver/native-result-metadata driver)))

(mu/defn native-query-deps :- [:set
                               [:or
                                ::driver/native-query-deps.table-dep
                                ::driver/native-query-deps.transform-dep
                                [:map {:closed true} [:snippet ::lib.schema.id/snippet]]
                                [:map {:closed true} [:card ::lib.schema.id/card]]]]
  "Returns the upstream dependencies of a native query, as a set of `{:kind id}` pairs."
  [driver :- :keyword
   query  :- ::lib.schema/native-only-query]
  (let [compiled (compile-query query)]
    (into (driver/native-query-deps driver compiled)
          ;; TODO (Cam 10/1/25) -- Even this much MBQL manipulation outside of Lib is illegal. Move this sort of stuff
          ;; into Lib.
          (keep #(case (:type %)
                   :snippet {:snippet (:snippet-id %)}
                   :card    {:card (:card-id %)}
                   nil))
          (lib/all-template-tags query))))
