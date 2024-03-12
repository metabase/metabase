(ns metabase.lib.normalize
  (:require
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.mbql-clause :as lib.schema.mbql-clause]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]))

(defn- lib-type [x]
  (when (map? x)
    (keyword (some #(get x %) [:lib/type "lib/type"]))))

;;; TODO -- we are missing some stuff for sure.
(def ^:private lib-type->schema
  {:mbql/query        ::lib.schema/query
   :mbql.stage/mbql   ::lib.schema/stage.mbql
   :mbql.stage/native ::lib.schema/stage.native
   :metadata/database ::lib.schema.metadata/database
   :metadata/table    ::lib.schema.metadata/table
   :metadata/column   ::lib.schema.metadata/column
   :metadata/card     ::lib.schema.metadata/card
   :metadata/segment  ::lib.schema.metadata/segment
   :metadata/metric   ::lib.schema.metadata/metric})

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

(defn normalize
  "Ensure some part of an MBQL query `x`, e.g. a clause or map, is in the right shape after coming in from JavaScript or
  deserialized JSON (from the app DB or a REST API request). This is intended for things that are already in a
  generally correct pMBQL; to 'normalize' things from legacy MBQL, use [[metabase.lib.convert]].

  The default implementation will keywordize keys for maps, and convert some known keys
  using [[default-map-value-fns]]; for MBQL clauses, it will convert the clause name to a keyword and recursively
  normalize its options and arguments. Implement this method if you need custom behavior for something."
  ([x]
   (normalize (infer-schema x) x))

  ([schema x]
   (try
     (let [respond identity
           ;; if normalization errors somewhere, just log the error and return the partially-normalized result. Easier
           ;; to debug this way
           raise   (fn [error]
                     (log/warnf "Error normalizing pMBQL:\n%s" (u/pprint-to-str error))
                     (:value error))]
       (mc/coerce schema x (mtx/transformer {:name :normalize}) respond raise))
     (catch #?(:clj Throwable :cljs :default) e
       (throw (ex-info (i18n/tru "Normalization error: {0}" (ex-message e))
                       {:x x, :schema schema}
                       e))))))
