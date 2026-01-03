(ns metabase.lib.normalize
  (:refer-clojure :exclude [mapv some])
  (:require
   [malli.core :as mc]
   [malli.error :as me]
   [malli.transform :as mtx]
   [medley.core :as m]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.mbql-clause :as lib.schema.mbql-clause]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.util :as lib.util]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :refer [mapv some]]))

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

    (and (sequential? x)
         ((some-fn simple-keyword? string?) (first x)))
    (lib.schema.mbql-clause/tag->registered-schema-name (first x))

    :else
    :any))

(defn- default-error-fn
  "If normalization errors somewhere, just log the error and return the partially-normalized result. Easier to debug
  this way."
  [error]
  (log/debugf "Error normalizing MBQL 5: %s\n%s"
              (pr-str (me/humanize (:explain error)))
              (u/pprint-to-str (dissoc error :explain)))
  (:value error))

(def ^:private ^:dynamic *error-fn*
  default-error-fn)

(defn- coercer [schema]
  (mr/cached ::coercer
             schema
             (fn []
               (let [respond identity
                     raise   #'*error-fn*] ; capture var rather than the bound value at the time this is eval'ed
                 (log/debugf "Building :normalize coercer for schema %s" (pr-str schema))
                 (mc/coercer schema (mtx/transformer mtx/default-value-transformer {:name :normalize}) respond raise)))))

;;; ---------------------------------- Pre-normalization expression flattening ----------------------------------
;;; Flatten deeply nested expressions before Malli validation to avoid excessive memory allocation.
;;; Nested :case/:if/:and/:or/:coalesce/:+/:*/:concat expressions are semantically equivalent when flattened.

(defn- clause-tag
  "Get the tag of a clause as keyword. Handles both keyword and string tags. Returns nil if not a clause."
  [x]
  (when (vector? x)
    (let [tag (get x 0)]
      (cond
        (keyword? tag) tag
        (string? tag)  (keyword tag)
        :else          nil))))

(defn- clause-opts-and-args
  "Parse a clause into [opts args-vector]. Handles both pMBQL [tag opts & args] and legacy [tag & args]."
  [clause]
  (if (map? (get clause 1))
    [(get clause 1) (subvec clause 2)]
    [nil (subvec clause 1)]))

(declare flatten-expression)

(defn- flatten-case
  "Flatten a :case or :if clause by merging nested case/if from the default branch.
  Structure: [tag opts? [[pred1 expr1] ...] default?]"
  [clause]
  (let [tag           (clause-tag clause)
        [opts [pairs default & _more]] (clause-opts-and-args clause)
        pairs'        (mapv (fn [[pred expr]]
                              [(flatten-expression pred) (flatten-expression expr)])
                            pairs)
        default'      (some-> default flatten-expression)
        [nested-opts nested-args] (when (= tag (clause-tag default'))
                                    (clause-opts-and-args default'))
        ;; Preserve opts from outer clause, or use nested opts if outer had none
        merged-opts   (or opts nested-opts)]
    (if nested-args
      ;; Flatten: merge nested case/if branches
      (let [[nested-pairs nested-default & _] nested-args]
        (cond-> (if merged-opts [tag merged-opts] [tag])
          true                     (conj (into pairs' nested-pairs))
          (some? nested-default)   (conj nested-default)))
      ;; No flattening needed
      (cond-> (if opts [tag opts] [tag])
        true             (conj pairs')
        (some? default') (conj default')))))

(defn- flatten-variadic
  "Flatten a variadic clause (:and, :or, :coalesce) by merging nested clauses of the same type.
  Structure: [tag opts? & args]"
  [clause]
  (let [tag        (clause-tag clause)
        [opts args] (clause-opts-and-args clause)]
    (into (if opts [tag opts] [tag])
          (mapcat (fn [arg]
                    (let [arg' (flatten-expression arg)]
                      (if (= (clause-tag arg') tag)
                        ;; Same tag: splice in the nested args
                        (second (clause-opts-and-args arg'))
                        [arg']))))
          args)))

(defn- flatten-clause
  "Flatten a single clause, recursing into its arguments."
  [clause]
  (case (clause-tag clause)
    (:case :if)
    (flatten-case clause)

    (:and :or :coalesce :+ :* :concat)
    (flatten-variadic clause)

    ;; Other clause: just recurse into args
    (let [tag        (clause-tag clause)
          [opts args] (clause-opts-and-args clause)]
      (into (if opts [tag opts] [tag]) (map flatten-expression) args))))

(defn- flatten-expression
  "Flatten a single expression (clause). Handles both keyword and string tags."
  [x]
  (if (clause-tag x)
    (flatten-clause x)
    x))

(defn- flatten-expression-list
  "Flatten a sequence of expressions."
  [exprs]
  (mapv flatten-expression exprs))

(declare flatten-stage)

(defn- flatten-join
  "Flatten expressions within a join. Joins have :stages and :conditions.

  NOTE: Keep in sync with [[metabase.lib.schema.join/join]] - if expression-containing keys
  are added there, they must be added here too."
  [join]
  (cond-> join
    (:stages join)     (update :stages #(mapv flatten-stage %))
    (:conditions join) (update :conditions flatten-expression-list)))

(defn- flatten-stage
  "Flatten expressions within a single MBQL stage. Only processes known expression-containing
  keys to avoid converting non-expression data like parameter values.

  NOTE: Keep in sync with [[metabase.lib.schema/stage.mbql]] - if expression-containing keys
  are added there, they must be added here too."
  [stage]
  (if-not (map? stage)
    stage
    (cond-> stage
      (:expressions stage) (update :expressions flatten-expression-list)
      (:breakout stage)    (update :breakout flatten-expression-list)
      (:aggregation stage) (update :aggregation flatten-expression-list)
      (:fields stage)      (update :fields flatten-expression-list)
      (:filters stage)     (update :filters flatten-expression-list)
      (:order-by stage)    (update :order-by flatten-expression-list)
      (:joins stage)       (update :joins #(mapv flatten-join %)))))

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
         ;; Only flatten within known expression-containing keys in :stages.
         ;; For non-map inputs, only flatten if the schema indicates an MBQL clause.
         flatten-stages #(mapv flatten-stage %)
         ;; :query is a legacy query map that has :query (MBQL) or :native inside
         flatten-query  (fn [q]
                          (cond-> q
                            (:query q)      (update :query flatten-stage)
                            (get q "query") (update "query" flatten-stage)))
         x      (cond
                  (map? x)
                  (-> x
                      (m/update-existing :stages flatten-stages)
                      (m/update-existing "stages" flatten-stages)
                      (m/update-existing :query flatten-query)
                      (m/update-existing "query" flatten-query))

                  (and (qualified-keyword? schema)
                       (= (namespace schema) "mbql.clause"))
                  (flatten-expression x)

                  :else
                  x)
         thunk  (^:once fn* []
                  ((coercer schema) x))]
     (if throw?
       (binding [*error-fn* (fn [error]
                              (throw (ex-info (i18n/tru "Normalization error")
                                              {:schema schema, :x x, :error error})))]
         (thunk))
       (thunk)))))

(mu/defn ->normalized-stage-metadata :- ::lib.schema.metadata/stage
  "Take a sequence of legacy or Lib metadata maps, convert to Lib-style if needed, then normalize them.

  Note that this returns a map with `:columns` rather than a sequence of columns like the input."
  [cols :- [:sequential :map]]
  (->> cols
       lib.util/->stage-metadata
       (normalize ::lib.schema.metadata/stage)))
