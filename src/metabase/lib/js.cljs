(ns metabase.lib.js
  "JavaScript-friendly interface to the entire Metabase lib? This stuff will probably change a bit as MLv2 evolves."
  (:require
   [medley.core :as m]
   [metabase.lib.convert :as convert]
   [metabase.lib.core :as lib.core]
   [metabase.lib.js.metadata :as js.metadata]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
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
  (lib.core/suggested-name query))

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
    (lib.core/query (metadataProvider database-id metadata) query-map)))

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
  (-> query-map convert/->legacy-MBQL fix-namespaced-values (clj->js :keyword-fn u/qualified-name)))

(defn ^:export append-stage
  "Adds a new blank stage to the end of the pipeline"
  [a-query]
  (lib.core/append-stage a-query))

(defn ^:export drop-stage
  "Drops the final stage in the pipeline"
  [a-query]
  (lib.core/drop-stage a-query))

(defn ^:export orderable-columns
  "Return a sequence of Column metadatas about the columns you can add order bys for in a given stage of `a-query.` To
  add an order by, pass the result to [[order-by]]."
  ([a-query]
   (orderable-columns a-query -1))
  ([a-query stage-number]
   (to-array (lib.core/orderable-columns a-query stage-number))))

(defn ^:export display-info
  "Given an opaque Cljs object, return a plain JS object with info you'd need to implement UI for it.
  See `:metabase.lib.metadata.calculation/display-info` for the keys this might contain. Note that the JS versions of
  the keys are converted to the equivalent `camelCase` strings from the original `:kebab-case`."
  ([a-query x]
   (display-info a-query -1 x))
  ([a-query stage-number x]
   (-> (lib.core/display-info a-query stage-number x)
       (update-keys u/->camelCaseEn)
       (update :table update-keys u/->camelCaseEn)
       (clj->js :keyword-fn u/qualified-name))))

(defn ^:export order-by-clause
  "Create an order-by clause independently of a query, e.g. for `replace` or whatever."
  ([a-query stage-number x]
   (order-by-clause a-query stage-number x nil))
  ([a-query stage-number x direction]
   (lib.core/order-by-clause a-query stage-number (lib.core/normalize (js->clj x :keywordize-keys true)) direction)))

(defn ^:export order-by
  "Add an `order-by` clause to `a-query`. Returns updated query."
  ([a-query x]
   (order-by a-query -1 x nil))

  ([a-query x direction]
   (order-by a-query -1 x direction))

  ([a-query stage-number x direction]
   (lib.core/order-by a-query stage-number x (keyword direction))))

(defn ^:export order-bys
  "Get the order-by clauses (as an array of opaque objects) in `a-query` at a given `stage-number`.
  Returns an empty array if there are no order bys in the query."
  ([a-query]
   (order-bys a-query -1))
  ([a-query stage-number]
   (to-array (lib.core/order-bys a-query stage-number))))

(defn ^:export change-direction
  "Flip the direction of `current-order-by` in `a-query`."
  [a-query current-order-by]
  (lib.core/change-direction a-query current-order-by))

(defn ^:export breakoutable-columns
  "Return an array of Column metadatas about the columns that can be broken out by in a given stage of `a-query.`
  To break out by a given column, the corresponding element of the result has to be added to the query using
  [[breakout]]."
  ([a-query]
   (breakoutable-columns a-query -1))
  ([a-query stage-number]
   (to-array (lib.core/breakoutable-columns a-query stage-number))))

(defn ^:export breakouts
  "Get the breakout clauses (as an array of opaque objects) in `a-query` at a given `stage-number`.
  Returns an empty array if there are no order bys in the query."
  ([a-query]
   (breakouts a-query -1))
  ([a-query stage-number]
   (to-array (lib.core/breakouts a-query stage-number))))

(defn ^:export breakout
  "Add an `order-by` clause to `a-query`. Returns updated query."
  ([a-query x]
   (breakout a-query -1 x))
  ([a-query stage-number x]
   (lib.core/breakout a-query stage-number (lib.core/ref x))))

(defn ^:export binning
  "Retrieve the current binning state of a `:field` clause, field metadata, etc. as an opaque object, or `nil` if it
  does not have binning options set."
  [x]
  (lib.core/binning x))

(defn ^:export with-binning
  "Given `x` (a field reference) and a `binning` value, return a new `:field` clause with its `:binning` options set.

  If `binning` is `nil`, removes any `:binning` options currently present.

  `binning` can be one of the opaque values returned by [[available-binning-strategies]], or a literal
  [[metabase.lib.schema.binning/binning]] value."
  [x binning-option]
  (lib.core/with-binning x binning-option))

(defn ^:export available-binning-strategies
  "Get a list of available binning strategies for `x` (a field reference, generally) in the context of `a-query` and
  optionally `stage-number`. The returned list contains opaque objects which should be passed to [[display-info]]."
  ([a-query x]
   (-> (lib.core/available-binning-strategies a-query x)
       to-array))
  ([a-query stage-number x]
   (-> (lib.core/available-binning-strategies a-query stage-number x)
       to-array)))

(defn ^:export temporal-bucket
  "Get the current temporal bucketing options associated with something, if any."
  [x]
  (lib.core/temporal-bucket x))

(defn ^:export with-temporal-bucket
  "Add a temporal bucketing option to an MBQL clause (or something that can be converted to an MBQL clause)."
  [x bucketing-option]
  (lib.core/with-temporal-bucket x bucketing-option))

(defn ^:export available-temporal-buckets
  "Get a list of available temporal bucketing options for `x` (a field reference, generally) in the context of `a-query`
  and optionally `stage-number`. The returned list contains opaque objects which should be passed to [[display-info]]."
  ([a-query x]
   (-> (lib.core/available-temporal-buckets a-query x)
       to-array))
  ([a-query stage-number x]
   (-> (lib.core/available-temporal-buckets a-query stage-number x)
       to-array)))

(defn ^:export remove-clause
  "Removes the `target-clause` in the filter of the `query`."
  ([a-query clause]
   (remove-clause a-query -1 clause))
  ([a-query stage-number clause]
   (lib.core/remove-clause
     a-query stage-number
     (lib.core/normalize (js->clj clause :keywordize-keys true)))))

(defn ^:export replace-clause
  "Replaces the `target-clause` with `new-clause` in the `query` stage."
  ([a-query target-clause new-clause]
   (replace-clause a-query -1 target-clause new-clause))
  ([a-query stage-number target-clause new-clause]
   (lib.core/replace-clause
     a-query stage-number
     (lib.core/normalize (js->clj target-clause :keywordize-keys true))
     (lib.core/normalize (js->clj new-clause :keywordize-keys true)))))

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

(defn ^:export group-columns
  "Given a group of columns returned by a function like [[metabase.lib.js/orderable-columns]], group the columns
  by Table or equivalent (e.g. Saved Question) so that they're in an appropriate shape for showing in the Query
  Builder. e.g a sequence of columns like

    [venues.id
     venues.name
     venues.category-id
     ;; implicitly joinable
     categories.id
     categories.name]

  would get grouped into groups like

    [{::columns [venues.id
                 venues.name
                 venues.category-id]}
     {::columns [categories.id
                 categories.name]}]

  Groups have the type `:metadata/column-group` and can be passed directly
  to [[metabase.lib.js/display-info]].
  Use [[metabase.lib.js/columns-group-columns]] to extract the columns from a group."
  [column-metadatas]
  (to-array (lib.core/group-columns column-metadatas)))

(defn ^:export columns-group-columns
  "Get the columns associated with a column group"
  [column-group]
  (to-array (lib.core/columns-group-columns column-group)))

(defn ^:export describe-temporal-unit
  "Get a translated description of a temporal bucketing unit."
  [n unit]
  (let [unit (if (string? unit) (keyword unit) unit)]
    (lib.core/describe-temporal-unit n unit)))

(defn ^:export describe-temporal-interval
  "Get a translated description of a temporal bucketing interval."
  [n unit]
  (let [n    (if (string? n) (keyword n) n)
        unit (if (string? unit) (keyword unit) unit)]
    (lib.core/describe-temporal-interval n unit)))

(defn ^:export describe-relative-datetime
  "Get a translated description of a relative datetime interval."
  [n unit]
  (let [n    (if (string? n) (keyword n) n)
        unit (if (string? unit) (keyword unit) unit)]
      (lib.core/describe-relative-datetime n unit)))

(defn ^:export available-aggregation-operators
  "Get the available aggregation operators for the stage with `stage-number` of
  the query `a-query`.
  If `stage-number` is omitted, the last stage is used."
  ([a-query]
   (available-aggregation-operators a-query -1))
  ([a-query stage-number]
   (to-array (lib.core/available-aggregation-operators a-query stage-number))))

(defn ^:export aggregation-operator-columns
  "Get the columns `aggregation-operator` can be applied to.
  The columns are valid for the stage of the query that was used in
  [[available-binning-strategies]] to get `available-aggregation`."
  [aggregation-operator]
  (to-array (lib.core/aggregation-operator-columns aggregation-operator)))

(defn ^:export selected-aggregation-operators
  "Mark the operator and the column (if any) in `agg-operators` selected by `agg-clause`."
  [agg-operators agg-clause]
  (to-array (lib.core/selected-aggregation-operators (seq agg-operators) agg-clause)))

(defn ^:export filterable-columns
  "Get the available filterable columns for the stage with `stage-number` of
  the query `a-query`.
  If `stage-number` is omitted, the last stage is used."
  ([a-query]
   (filterable-columns a-query -1))
  ([a-query stage-number]
   (to-array (lib.core/filterable-columns a-query stage-number))))

(defn ^:export filterable-column-operators
  "Returns the operators for which `filterable-column` is applicable."
  [filterable-column]
  (to-array (lib.core/filterable-column-operators filterable-column)))

(defn ^:export filter-clause
  "Returns a standalone filter clause for a `filter-operator`,
  a `column`, and arguments."
  [filter-operator column & args]
  (apply lib.core/filter-clause filter-operator column args))

(defn ^:export fields
  "Get the current `:fields` in a query. Unlike the lib core version, this will return an empty sequence if `:fields` is
  not specified rather than `nil` for JS-friendliness."
  ([a-query]
   (fields a-query -1))
  ([a-query stage-number]
   (to-array (lib.core/fields a-query stage-number))))

(defn ^:export with-fields
  "Specify the `:fields` for a query. Pass an empty sequence or `nil` to remove `:fields`."
  ([a-query new-fields]
   (with-fields a-query -1 new-fields))
  ([a-query stage-number new-fields]
   (lib.core/with-fields a-query stage-number new-fields)))

(defn join-strategy
  "Get the strategy (type) of a given join as a plain string like `left-join`."
  [a-join]
  (u/qualified-name (lib.core/join-strategy a-join)))

(defn with-join-strategy
  "Return a copy of `a-join` with its `:strategy` set to `strategy`."
  [a-join strategy]
  (lib.core/with-join-strategy a-join (keyword strategy)))

(defn available-join-strategies
  "Get available join strategies for the current Database (based on the Database's
  supported [[metabase.driver/driver-features]]) as strings like `left-join`."
  [a-query stage-number]
  (to-array (map u/qualified-name (lib.core/available-join-strategies a-query stage-number))))
