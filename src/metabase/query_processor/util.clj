(ns metabase.query-processor.util
  "Utility functions used by the global query processor and middleware functions."
  (:refer-clojure :exclude [select-keys get-in])
  (:require
   [buddy.core.codecs :as codecs]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.driver :as driver]
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
  the metadata from a run from the query, and `old-metadata` should be the metadata from the database we wish to
  ensure survives."
  {:deprecated "0.57.0"}
  [new-metadata old-metadata]
  #_{:clj-kondo/ignore [:deprecated-var]}
  (let [old-cols-by-desired-col-alias (m/index-by :lib/desired-column-alias (filter :lib/desired-column-alias old-metadata))
        old-cols-by-name (m/index-by :name old-metadata)]
    (for [new-col new-metadata]
      (if-let [old-col (or (get old-cols-by-desired-col-alias (:lib/desired-column-alias new-col))
                           ;; Only match by name if a desired column alias is missing,
                           ;; otherwise we could match different columns with the same name
                           (let [old-col (get old-cols-by-name (:name new-col))]
                             (when (not-every? :lib/desired-column-alias [new-col old-col])
                               old-col)))]
        (merge new-col (select-keys old-col preserved-keys))
        new-col))))

(def ^:dynamic *execute-async?*
  "Whether to save QueryExecutions (and other post-execution side effects) asynchronously via the batch-processing
  queue. Bind (or redef, when the query runs on another thread) to `false` in tests to save synchronously on the
  calling thread."
  true)

(mu/defn userland-query? :- :boolean
  "Returns true if the query is an userland query, else false."
  [query :- ::qp.schema/any-query]
  (boolean (get-in query [:middleware :userland-query?])))

(mu/defn internal-query? :- :boolean
  "Returns `true` if query is an internal query."
  [{query-type :type} :- :map]
  (= :internal (keyword query-type)))
