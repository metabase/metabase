(ns metabase-enterprise.dependencies.native-validation
  (:require
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.util.malli :as mu]))

(mu/defn- compile-query :- ::lib.schema/native-only-query
  "Compile a query to native SQL with inline parameters (no JDBC placeholders).

  Uses compile-with-inline-parameters to produce valid SQL that SQLGlot can parse,
  rather than parameterized SQL with ? placeholders.

  Important: We don't preprocess before calling compile-with-inline-parameters because
  parameter substitution must happen INSIDE the *compile-with-inline-parameters* binding
  to produce inline literals instead of ? placeholders."
  [query :- ::lib.schema/query]
  (let [with-params (lib/add-parameters-for-template-tags query)
        compiled    (qp.compile/compile-with-inline-parameters with-params)]
    (lib/native-query with-params (:query compiled))))

(defn- has-card-template-tags?
  "Returns true if the query has any card-type template tags."
  [query]
  (some #(= (:type %) :card) (lib/all-template-tags query)))

(defn- table-deps
  "Returns the set of table IDs referenced directly in the compiled native query."
  [driver compiled]
  (into #{}
        (keep :table)
        (driver/native-query-deps driver compiled)))

(defn- enrich-error-with-source
  "Add source entity information to a validation error.
   If there's exactly one table source, attribute the error to that table.
   Otherwise, mark as :unknown."
  [source error]
  (merge error source))

(mu/defn validate-native-query
  "Compiles a (native) query and validates that the fields and tables it refers to really exist.

   Returns a set of errors, each enriched with source entity information when possible."
  [driver :- :keyword
   query  :- ::lib.schema/query]
  (let [compiled (compile-query query)
        errors   (driver/validate-native-query-fields driver compiled)]
    (if (or (empty? errors) (has-card-template-tags? query))
      errors
      (let [tables (table-deps driver compiled)
            source (cond
                     (empty? tables) nil
                     (= 1 (count tables)) {:source-entity-type :table
                                           :source-entity-id   (first tables)}
                     :else {:source-entity-type :unknown})]
        (if source
          (into #{} (map (partial enrich-error-with-source source)) errors)
          errors)))))

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
