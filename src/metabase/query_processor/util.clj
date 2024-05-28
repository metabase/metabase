(ns metabase.query-processor.util
  "Utility functions used by the global query processor and middleware functions."
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [cheshire.core :as json]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.lib.convert :as lib.convert]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

;; TODO - I think most of the functions in this namespace that we don't remove could be moved to [[metabase.legacy-mbql.util]]

(defn query-without-aggregations-or-limits?
  "Is the given query an MBQL query without a `:limit`, `:aggregation`, or `:page` clause?"
  [{{aggregations :aggregation, :keys [limit page]} :query}]
  (and (not limit)
       (not page)
       (empty? aggregations)))

(defn default-query->remark
  "Generates the default query remark. Exists as a separate function so that overrides of the query->remark multimethod
   can access the default value."
  [{{:keys [executed-by query-hash], :as _info} :info, query-type :type}]
  (str "Metabase" (when executed-by
                    (assert (bytes? query-hash) "If info includes executed-by it should also include query-hash")
                    (format ":: userID: %s queryType: %s queryHash: %s"
                            executed-by
                            (case (keyword query-type)
                              :query  "MBQL"
                              :native "native")
                            (codecs/bytes->hex query-hash)))))

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


;;; ------------------------------------------------- Normalization --------------------------------------------------

;; TODO - this has been moved to `metabase.legacy-mbql.util`; use that implementation instead.
(mu/defn ^:deprecated normalize-token :- :keyword
  "Convert a string or keyword in various cases (`lisp-case`, `snake_case`, or `SCREAMING_SNAKE_CASE`) to a lisp-cased
  keyword."
  [token :- [:or :keyword :string]]
  (-> (name token)
      u/lower-case-en
      (str/replace #"_" "-")
      keyword))


;;; ---------------------------------------------------- Hashing -----------------------------------------------------

(defn- walk-query-sort-maps
  "We don't want two queries to have different hashes because their map keys are in different orders, now do we? Convert
  all the maps to sorted maps so queries are serialized to JSON in an identical order."
  [x]
  (walk/postwalk
   (fn [x]
     (if (and (map? x)
              (not (sorted? x)))
       (into (sorted-map) x)
       x))
   x))

(defn- remove-lib-uuids
  "Two queries should be the same even if they have different :lib/uuids, because they might have both been converted
  from the same legacy query."
  [x]
  (walk/postwalk
   (fn [x]
     (if (map? x)
       (dissoc x :lib/uuid)
       x))
   x))

(mu/defn ^:private select-keys-for-hashing
  "Return `query` with only the keys relevant to hashing kept.
  (This is done so irrelevant info or options that don't affect query results doesn't result in the same query
  producing different hashes.)"
  [query :- [:maybe :map]]
  (let [{:keys [constraints parameters], :as query} (select-keys query [:database :lib/type :stages :parameters :constraints])]
    (cond-> query
      (empty? constraints) (dissoc :constraints)
      (empty? parameters)  (dissoc :parameters)
      true                 remove-lib-uuids
      true                 walk-query-sort-maps)))

(mu/defn query-hash :- bytes?
  "Return a 256-bit SHA3 hash of `query` as a key for the cache. (This is returned as a byte array.)"
  ^bytes [query :- [:maybe :map]]
  ;; convert to pMBQL first if this is a legacy query.
  (let [query (try
                (cond-> query
                  (#{"query" "native"} (:type query)) (#(lib.convert/->pMBQL (mbql.normalize/normalize %)))
                  (#{:query :native} (:type query))   lib.convert/->pMBQL)
                (catch Throwable e
                  (throw (ex-info "Error hashing query. Is this a valid query?"
                                  {:query query}
                                  e))))]
    (buddy-hash/sha3-256 (json/generate-string (select-keys-for-hashing query)))))


;;; --------------------------------------------- Query Source Card IDs ----------------------------------------------

(defn query->source-card-id
  "Return the ID of the Card used as the \"source\" query of this query, if applicable; otherwise return `nil`."
  ^Integer [outer-query]
  (let [source-table (get-in outer-query [:query :source-table])]
    (when (string? source-table)
      (when-let [[_ card-id-str] (re-matches #"^card__(\d+$)" source-table)]
        (Integer/parseInt card-id-str)))))

;;; ------------------------------------------- Metadata Combination Utils --------------------------------------------

(defn field-ref->key
  "A standard and repeatable way to address a column. Names can collide and sometimes are not unique. Field refs should
  be stable, except we have to exclude the last part as extra information can be tucked in there. Names can be
  non-unique at times, numeric ids are not guaranteed."
  [[tyype identifier]]
  [tyype identifier])

(def ^:private field-options-for-identification
  "Set of FieldOptions that only mattered for identification purposes." ;; base-type is required for field that use name instead of id
  #{:source-field :join-alias :base-type})

(defn- field-normalizer
  [field]
  (let [[type id-or-name options ] (mbql.normalize/normalize-tokens field)]
    [type id-or-name (select-keys options field-options-for-identification)]))

(defn field->field-info
  "Given a field and result_metadata, return a map of information about the field if result_metadata contains a matched field. "
  [field result-metadata]
  (let [[_ttype id-or-name options :as field] (field-normalizer field)]
    (or
      ;; try match field_ref first
      (first (filter (fn [field-info]
                       (= field
                          (-> field-info
                              :field_ref
                              field-normalizer)))
                     result-metadata))
      ;; if not match name and base type for aggregation or field with string id
      (first (filter (fn [field-info]
                       (and (= (:name field-info)
                               id-or-name)
                            (= (:base-type options)
                               (:base_type field-info))))
                     result-metadata)))))

(def preserved-keys
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
  [fresh pre-existing]
  (let [by-key (m/index-by (comp field-ref->key :field_ref) pre-existing)]
    (for [{:keys [field_ref source] :as col} fresh]
      (if-let [existing (and (not= :aggregation source)
                             (get by-key (field-ref->key field_ref)))]
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

  Used for side effects during query execution like saving query execution info or capturing FieldUsages."
  [thunk]
  `(do-with-execute-async ~thunk))

(mu/defn userland-query? :- :boolean
  "Returns true if the query is an userland query, else false."
  [query :- ::qp.schema/qp]
  (boolean (get-in query [:middleware :userland-query?])))

(mu/defn internal-query? :- :boolean
  "Returns `true` if query is an internal query."
  [{query-type :type} :- ::qp.schema/qp]
  (= :internal (keyword query-type)))
