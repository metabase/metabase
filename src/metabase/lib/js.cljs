(ns metabase.lib.js
  "JavaScript-friendly interface to the entire Metabase lib? This stuff will probably change a bit as MLv2 evolves."
  (:require
   [medley.core :as m]
   [metabase.lib.convert :as convert]
   [metabase.lib.core :as lib.core]
   [metabase.lib.js.metadata :as js.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.lib.order-by :as lib.order-by]
   [metabase.lib.query :as lib.query]
   [metabase.lib.remove-replace :as lib.remove-replace]
   [metabase.mbql.js :as mbql.js]
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
    (qualified-keyword? x)    (str (namespace x) "/" (name x))
    (map? x)                  (update-vals x fix-namespaced-values)
    (sequential? x)           (map fix-namespaced-values x)
    :else                     x))

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
   (to-array (lib.order-by/orderable-columns a-query stage-number))))

(defn ^:export display-info
  "Given an opaque Cljs object, return a plain JS object with info you'd need to implement UI for it.
  See `:metabase.lib.metadata.calculation/display-info` for the keys this might contain."
  ([a-query x]
   (display-info a-query -1 x))
  ([a-query stage-number x]
   (-> (lib.metadata.calculation/display-info a-query stage-number x)
       (clj->js :keyword-fn u/qualified-name))))

(defn ^:export order-by-clause
  "Create an order-by clause independently of a query, e.g. for `replace` or whatever."
  ([a-query stage-number x]
   (order-by-clause a-query stage-number x nil))
  ([a-query stage-number x direction]
   (lib.order-by/order-by-clause a-query stage-number (lib.normalize/normalize (js->clj x :keywordize-keys true)) direction)))

(defn ^:export order-by
  "Add an `order-by` clause to `a-query`. Returns updated query."
  ([a-query x]
   (order-by a-query -1 x nil))

  ([a-query x direction]
   (order-by a-query -1 x direction))

  ([a-query stage-number x direction]
   (lib.order-by/order-by a-query stage-number x (keyword direction))))

(defn ^:export order-bys
  "Get the order-by clauses (as an array of opaque objects) in `a-query` at a given `stage-number`.
  Returns an empty array if there are no order bys in the query."
  ([a-query]
   (order-bys a-query -1))
  ([a-query stage-number]
   (to-array (lib.order-by/order-bys a-query stage-number))))

(defn ^:export change-direction
  "Flip the direction of `current-order-by` in `a-query`."
  [a-query current-order-by]
  (lib.order-by/change-direction a-query current-order-by))

(defn ^:export remove-clause
  "Removes the `target-clause` in the filter of the `query`."
  ([a-query clause]
   (remove-clause a-query -1 clause))
  ([a-query stage-number clause]
   (lib.remove-replace/remove-clause
     a-query stage-number
     (lib.normalize/normalize (js->clj clause :keywordize-keys true)))))

(defn ^:export replace-clause
  "Replaces the `target-clause` with `new-clause` in the `query` stage."
  ([a-query target-clause new-clause]
   (replace-clause a-query -1 target-clause new-clause))
  ([a-query stage-number target-clause new-clause]
   (lib.remove-replace/replace-clause
     a-query stage-number
     (lib.normalize/normalize (js->clj target-clause :keywordize-keys true))
     (lib.normalize/normalize (js->clj new-clause :keywordize-keys true)))))

(defn- prep-query-for-equals [a-query field-ids]
  (-> a-query
      mbql.js/normalize-cljs
      ;; If `:native` exists, but it doesn't have `:template-tags`, add it.
      (m/update-existing :native #(merge {:template-tags {}} %))
      (m/update-existing :query (fn [inner-query]
                                  (let [fields (or (:fields inner-query)
                                                   (for [id field-ids]
                                                     [:field id nil]))]
                                    ;; We ignore the order of the fields in the lists, but need to make sure any dupes
                                    ;; match up. Therefore de-dupe with `frequencies` rather than simply `set`.
                                    (assoc inner-query :fields (frequencies fields)))))))

(defn ^:export query=
  "Returns whether the provided queries should be considered equal.

  If `field-ids` is specified, an input MBQL query without `:fields` set defaults to the `field-ids`.

  Currently this works only for legacy queries in JS form!
  It duplicates the logic formerly found in `query_builder/selectors.js`.

  TODO: This should evolve into a more robust, pMBQL-based sense of equality over time.
  For now it pulls logic that touches query internals into `metabase.lib`."
  ([query1 query2] (query= query1 query2 nil))
  ([query1 query2 field-ids]
   (let [n1 (prep-query-for-equals query1 field-ids)
         n2 (prep-query-for-equals query2 field-ids)]
     (= n1 n2))))
