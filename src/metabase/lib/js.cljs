(ns metabase.lib.js
  "JavaScript-friendly interface to the entire Metabase lib? This stuff will probably change a bit as MLv2 evolves."
  (:require
   [metabase.lib.convert :as convert]
   [metabase.lib.core :as lib.core]
   [metabase.lib.js.metadata :as js.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.lib.order-by :as lib.order-by]
   [metabase.lib.query :as lib.query]
   [metabase.mbql.normalize :as mbql.normalize]
   [metabase.util :as u]
   [metabase.util.log :as log]))

;;; this is mostly to ensure all the relevant namespaces with multimethods impls get loaded.
(comment lib.core/keep-me)

;; TODO: This pattern of "re-export some function and slap a `clj->js` at the end" is going to keep appearing.
;; Generalize the machinery in `metabase.domain-entities.malli` to handle this case, so we get schema-powered automatic
;; conversion for incoming args and outgoing return values. I'm imagining something like
;; `(mu/js-export lib.core/recognize-template-tags)` where that function has a Malli schema and it works like
;; `metabase.shared.util.namespaces/import-fn` plus wrapping it with conversion for all args and the return value.
(defn ^:export recognize-template-tags
  "Given the text of a native query, extract a possibly-empty set of template tag strings from it.

  These looks like mustache templates. For variables, we only allow alphanumeric characters, eg. `{{foo}}`.
  For snippets they start with `snippet:`, eg. `{{ snippet: arbitrary text here }}`.
  And for card references either `{{ #123 }}` or with the optional human label `{{ #123-card-title-slug }}`.

  Invalid patterns are simply ignored, so something like `{{&foo!}}` is just disregarded."
  [query-text]
  (-> query-text
      lib.core/recognize-template-tags
      clj->js))

(defn ^:export template-tags
  "Extract the template tags from a native query's text.

  If the optional map of existing tags previously parsed is given, this will reuse the existing tags where
  they match up with the new one (in particular, it will preserve the UUIDs).

  See [[recognize-template-tags]] for how the tags are parsed."
  ([query-text] (template-tags query-text {}))
  ([query-text existing-tags]
   (->> existing-tags
        lib.core/->TemplateTags
        (lib.core/template-tags query-text)
        lib.core/TemplateTags->)))

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
    (keyword? x)    (if-let [ns-part (namespace x)]
                      (str ns-part "/" (name x))
                      (name x))
    (map? x)        (update-vals x fix-namespaced-values)
    (sequential? x) (map fix-namespaced-values x)
    :else           x))

(defn ^:export legacy-query
  "Coerce a CLJS pMBQL query back to (1) a legacy query (2) in vanilla JS."
  [query-map]
  (-> query-map convert/->legacy-MBQL fix-namespaced-values clj->js))

(defn ^:export orderable-columns
  "Return a sequence of Column metadatas about the columns you can add order bys for in a given stage of `a-query.` To
  add an order by, pass the result to [[order-by]]."
  ([a-query]
   (orderable-columns a-query -1))
  ([a-query stage-number]
   (-> (lib.order-by/orderable-columns a-query stage-number)
       (clj->js :keyword-fn u/qualified-name))))

(defn ^:export order-by
  "Add an `order-by` clause to `a-query`. Returns updated query."
  ([a-query x]
   (order-by a-query -1 x nil))

  ([a-query x direction]
   (order-by a-query -1 x direction))

  ([a-query stage-number x direction]
   (lib.order-by/order-by
    a-query
    stage-number
    (lib.normalize/normalize (js->clj x :keywordize-keys true))
    (js->clj direction))))

(defn ^:export order-bys
  "Get the order-by clauses (as an array of opaque objects) in `a-query` at a given `stage-number`. Returns `nil` if
  there are no order bys in the query."
  ([a-query]
   (order-bys a-query -1))
  ([a-query stage-number]
   (some-> (lib.order-by/order-bys a-query stage-number)
           not-empty
           to-array)))
