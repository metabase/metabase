(ns metabase.query-processor.util
  "Utility functions used by the global query processor and middleware functions."
  (:refer-clojure :exclude [select-keys get-in])
  (:require
   [buddy.core.codecs :as codecs]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.driver :as driver]
   ;; legacy usage -- don't use Legacy MBQL utils in QP code going forward, prefer Lib. This will be updated to use
   ;; Lib only soon
   ^{:clj-kondo/ignore [:discouraged-namespace]} [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.lib-be.core]
   [metabase.lib.core :as lib]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [select-keys get-in]]
   [potemkin :as p]))

(set! *warn-on-reflection* true)

(comment metabase.lib-be.core/keep-me)

(p/import-vars
 [metabase.lib-be.core
  query-hash])

;; TODO - I think most of the functions in this namespace that we don't remove could be moved
;; to [[metabase.legacy-mbql.util]]

(mu/defn default-query->remark
  "Generates the default query remark. Exists as a separate function so that overrides of the query->remark multimethod
   can access the default value."
  [{{:keys [executed-by query-hash], :as _info} :info, :as query} :- ::qp.schema/any-query]
  (let [query-type (if (:lib/type query)
                     (case (keyword (:lib/type (lib/query-stage query -1)))
                       :mbql.stage/mbql   "MBQL"
                       :mbql.stage/native "native")
                     (case (keyword (:type query))
                       :query  "MBQL"
                       :native "native"))]
    (str "Metabase" (when executed-by
                      (assert (bytes? query-hash) "If info includes executed-by it should also include query-hash")
                      (format ":: userID: %s queryType: %s queryHash: %s"
                              executed-by
                              query-type
                              (codecs/bytes->hex query-hash))))))

(defmulti query->remark
  "Generate an appropriate remark `^String` to be prepended to a query to give DBAs additional information about the query
  being executed. See documentation for [[metabase.driver/mbql->native]] and #2386.
  for more information.

  So this turns your average 10, 20, 30 character query into a 110, 120, 130 etc character query.
  One leaky-abstraction part of this is that this will confuse the bejeezus out of
  people who first encounter their passed-through RDBMS error messages.

  'Hey, this is a 20 character query! What's it talking about, error at position 120?'
  This gets fixed, but in a spooky-action-at-a-distance way, in
  `frontend/src/metabase/query_builder/components/VisualizationError.jsx`"
  {:arglists '(^String [driver query])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod query->remark :default
  [_ query]
  (default-query->remark query))

;; TODO - this has been moved to `metabase.legacy-mbql.util`; use that implementation instead.
(mu/defn ^:deprecated normalize-token :- :keyword
  "Convert a string or keyword in various cases (`lisp-case`, `snake_case`, or `SCREAMING_SNAKE_CASE`) to a lisp-cased
  keyword."
  [token :- [:or :keyword :string]]
  (-> (name token)
      u/lower-case-en
      (str/replace #"_" "-")
      keyword))

(def ^:private ^{:deprecated "0.57.0"} field-options-for-identification
  "Set of FieldOptions that only mattered for identification purposes." ;; base-type is required for field that use name instead of id
  #{:source-field :join-alias})

(defn- field-normalizer
  {:deprecated "0.57.0"}
  [field]
  (let [[type id-or-name options] (lib/normalize ::mbql.s/field field)]
    #_{:clj-kondo/ignore [:deprecated-var]}
    [type id-or-name (select-keys options field-options-for-identification)]))

;;; TODO (Cam 9/10/25) -- this logic is all wrong and needs to use Lib instead
(defn field->field-info
  "Given a field ref and result_metadata, return a map of information about the field if result_metadata contains a
  matched field.

  DEPRECATED -- this is broken, please use Lib instead going forward."
  {:deprecated "0.57.0"}
  [field-ref cols]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (let [[_ttype id-or-name _options :as field-ref] (field-normalizer field-ref)]
    (or
     ;; try match field_ref first
     (first (filter (fn [field-info]
                      (= field-ref
                         (-> field-info
                             :field_ref
                             field-normalizer)))
                    cols))
     ;; if not match name for aggregation or field with string id
     (first (filter (fn [col]
                      (= (:name col)
                         id-or-name))
                    cols)))))

(def ^:private ^{:deprecated "0.57.0"} preserved-keys
  "Keys that can survive merging metadata from the database onto metadata computed from the query. When merging
  metadata, the types returned should be authoritative. But things like semantic_type, display_name, and description
  can be merged on top."
  ;; TODO: ideally we don't preserve :id but some notion of :user-entered-id or :identified-id
  [:id :description :display_name :semantic_type
   :fk_target_field_id :settings :visibility_type])

(defn combine-metadata
  "Blend saved metadata from previous runs into fresh metadata from an actual run of the query.

  Ensure that saved metadata from datasets or source queries can remain in the results metadata. We always recompute
  metadata in general, so need to blend the saved metadata on top of the computed metadata. First argument should be
  the metadata from a run from the query, and `pre-existing` should be the metadata from the database we wish to
  ensure survives."
  {:deprecated "0.57.0"}
  [fresh pre-existing]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (let [by-name (m/index-by :name pre-existing)]
    (for [{:keys [source] :as col} fresh]
      (if-let [existing (and (not= :aggregation source)
                             (get by-name (:name col)))]
        (merge col (select-keys existing preserved-keys))
        col))))

(def ^:dynamic *execute-async?*
  "Used to control `with-execute-async` to whether or not execute its body asynchronously."
  true)

(defn do-with-execute-async
  "Impl of `with-execute-async`"
  [thunk]
  (if *execute-async?*
    (.submit clojure.lang.Agent/pooledExecutor ^Runnable thunk)
    (thunk)))

(defmacro with-execute-async
  "Execute body asynchronously in a pooled executor.

  Used for side effects during query execution like saving query execution info."
  [thunk]
  `(do-with-execute-async ~thunk))

(mu/defn userland-query? :- :boolean
  "Returns true if the query is an userland query, else false."
  [query :- ::qp.schema/any-query]
  (boolean (get-in query [:middleware :userland-query?])))

(mu/defn internal-query? :- :boolean
  "Returns `true` if query is an internal query."
  [{query-type :type} :- :map]
  (= :internal (keyword query-type)))
