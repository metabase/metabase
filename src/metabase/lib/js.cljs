(ns metabase.lib.js
  "JavaScript-friendly interface to the entire Metabase lib? This stuff will probably change a bit as MLv2 evolves."
  (:require
   [metabase.lib.convert :as convert]
   [metabase.lib.core :as lib.core]
   [metabase.lib.js.metadata :as js.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.query :as lib.query]
   [metabase.mbql.normalize :as mbql.normalize]
   [metabase.util.log :as log]))

;;; this is mostly to ensure all the relevant namespaces with multimethods impls get loaded.
(comment lib.core/keep-me)

(defn ^:export suggestedName
  "Return a nice description of a query."
  [query]
  (lib.metadata.calculation/suggested-name query))

(defn- pMBQL [query-map]
  (as-> query-map <>
    (js->clj <> :keywordize-keys true)
    (if (:type <>)
      <>
      (assoc <> :type :query))
    (mbql.normalize/normalize <>)
    (convert/->pMBQL <>)))

(defn ^:export metadataProvider
  "Convert metadata to a metadata provider if it is not one already."
  [database-id metadata]
  (if (lib.metadata.protocols/metadata-provider? metadata)
    metadata
    (js.metadata/metadata-provider database-id metadata)))

(defn ^:export query
  "Coerce a plain map `query` to an actual query object that you can use with MLv2."
  [database-id metadata query-map]
  (let [query-map (pMBQL query-map)]
    (log/debugf "query map: %s" (pr-str query-map))
    (lib.query/query (metadataProvider database-id metadata) query-map)))

(defn- fix-namespaced-values
  "This converts namespaced keywords to strings as `\"foo/bar\"`.

  `clj->js` supports overriding how keyword map keys get transformed, but it doesn't let you override how values are
  handled. So this function runs first and turns them into strings.

  As an example of such a value, `(get-in card [:template-tags \"some-tag\" :widget-type])` can be `:date/all-options`."
  [x]
  (cond
    (qualified-keyword? x)    (str (namespace x) "/" (name x))
    (map? x)                  (update-vals x fix-namespaced-values)
    (sequential? x)           (map fix-namespaced-values x)
    :else                     x))

(defn ^:export legacy-query
  "Coerce a CLJS pMBQL query back to (1) a legacy query (2) in vanilla JS."
  [query-map]
  (-> query-map convert/->legacy-MBQL fix-namespaced-values clj->js))
