(ns metabase.lib.normalize
  (:require
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.mbql-clause :as lib.schema.mbql-clause]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]))

(defn- lib-type [x]
  (when (map? x)
    (keyword (some #(get x %) [:lib/type "lib/type"]))))

;;; TODO -- we are missing some stuff for sure.
(def ^:private lib-type->schema
  {:mbql/query             ::lib.schema/query
   :mbql.stage/mbql        ::lib.schema/stage.mbql
   :mbql.stage/native      ::lib.schema/stage.native
   :metadata/database      ::lib.schema.metadata/database
   :metadata/table         ::lib.schema.metadata/table
   :metadata/column        ::lib.schema.metadata/column
   :metadata/card          ::lib.schema.metadata/card
   :metadata/segment       ::lib.schema.metadata/segment
   :metadata/legacy-metric ::lib.schema.metadata/legacy-metric})

(defn- infer-schema [x]
  (cond
    (map? x)
    (or (-> x lib-type lib-type->schema)
        :map)

    (and (vector? x)
         ((some-fn simple-keyword? string?) (first x)))
    (lib.schema.mbql-clause/tag->registered-schema-name (first x))

    :else
    :any))

(defn- default-error-fn
  "If normalization errors somewhere, just log the error and return the partially-normalized result. Easier to debug
  this way."
  [error]
  (log/warnf "Error normalizing pMBQL:\n%s" (u/pprint-to-str error))
  (:value error))

(def ^:private ^:dynamic *error-fn*
  default-error-fn)

(defn- coercer [schema]
  (mr/cached ::coercer
             schema
             (fn []
               (let [respond identity
                     raise   #'*error-fn*] ; capture var rather than the bound value at the time this is eval'ed
                 (mc/coercer schema (mtx/transformer {:name :normalize}) respond raise)))))

(defn normalize
  "Ensure some part of an MBQL query `x`, e.g. a clause or map, is in the right shape after coming in from JavaScript or
  deserialized JSON (from the app DB or a REST API request). This is intended for things that are already in a
  generally correct pMBQL; to 'normalize' things from legacy MBQL, use [[metabase.lib.convert]].

  Normalization logic is defined in various schemas; grep for `:decode/normalize` in the `metabase.lib.schema*`
  namespaces.

  The default implementation will keywordize keys for maps, and convert some known keys
  using [[default-map-value-fns]]; for MBQL clauses, it will convert the clause name to a keyword and recursively
  normalize its options and arguments. Implement this method if you need custom behavior for something.

  Pass in a `nil` schema to automatically attempt to infer the schema based on `x` itself.

  By default, does not throw Exceptions -- just logs them and returns what it was able to normalize, but you can pass
  in the option `{:throw? true}` to have it throw exceptions when normalization fails."
  ([x]
   (normalize nil x))

  ([schema x]
   (normalize schema x nil))

  ([schema x {:keys [throw?], :or {throw? false}, :as _options}]
   (let [schema (or schema (infer-schema x))
         thunk  (^:once fn* []
                 ((coercer schema) x))]
     (if throw?
       (binding [*error-fn* (fn [error]
                              (throw (ex-info (i18n/tru "Normalization error")
                                              {:schema schema, :x x, :error error})))]
         (thunk))
       (thunk)))))
