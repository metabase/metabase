(ns metabase.query-processor.middleware.annotate
  "Middleware for annotating (adding type information to) the results of a query, under the `:cols` column."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.driver.common :as driver.common]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.mbql.normalize :as mbql.normalize]
   [metabase.mbql.schema :as mbql.s]
   [metabase.mbql.util :as mbql.u]
   [metabase.mbql.util.match :as mbql.match]
   [metabase.models.humanization :as humanization]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.middleware.escape-join-aliases
    :as escape-join-aliases]
   [metabase.query-processor.reducible :as qp.reducible]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.util :as qp.util]
   [metabase.sync.analyze.fingerprint.fingerprinters :as fingerprinters]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.malli :as mu]
   [metabase.util.schema :as su]
   [schema.core :as s]))

(def ^:private Col
  "Schema for a valid map of column info as found in the `:cols` key of the results after this namespace has ran."
  ;; name and display name can be blank because some wacko DBMSes like SQL Server return blank column names for
  ;; unaliased aggregations like COUNT(*) (this only applies to native queries, since we determine our own names for
  ;; MBQL.)
  {:name                           s/Str
   :display_name                   s/Str
   ;; type of the Field. For Native queries we look at the values in the first 100 rows to make an educated guess
   :base_type                      su/FieldType
   ;; effective_type, coercion, etc don't go here. probably best to rename base_type to effective type in the return
   ;; from the metadata but that's for another day
   ;; where this column came from in the original query.
   :source                         (s/enum :aggregation :fields :breakout :native)
   ;; a field clause that can be used to refer to this Field if this query is subsequently used as a source query.
   ;; Added by this middleware as one of the last steps.
   (s/optional-key :field_ref)     mbql.s/FieldOrAggregationReference
   ;; various other stuff from the original Field can and should be included such as `:settings`
   s/Any                           s/Any})

;; TODO - I think we should change the signature of this to `(column-info query cols rows)`
(defmulti column-info
  "Determine the `:cols` info that should be returned in the query results, which is a sequence of maps containing
  information about the columns in the results. Dispatches on query type. `results` is a map with keys `:cols` and,
  optionally, `:rows`, if available."
  {:arglists '([query results])}
  (fn [query _]
    (:type query)))

(defmethod column-info :default
  [{query-type :type, :as query} _]
  (throw (ex-info (tru "Unknown query type {0}" (pr-str query-type))
           {:type  qp.error-type/invalid-query
            :query query})))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                      Adding :cols info for native queries                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(s/defn ^:private check-driver-native-columns
  "Double-check that the *driver* returned the correct number of `columns` for native query results."
  [cols :- [{s/Any s/Any}], rows]
  (when (seq rows)
    (let [expected-count (count cols)
          actual-count   (count (first rows))]
      (when-not (= expected-count actual-count)
        (throw (ex-info (str (deferred-tru "Query processor error: number of columns returned by driver does not match results.")
                             "\n"
                             (deferred-tru "Expected {0} columns, but first row of resuls has {1} columns."
                               expected-count actual-count))
                 {:expected-columns (map :name cols)
                  :first-row        (first rows)
                  :type             qp.error-type/qp}))))))

(defn- annotate-native-cols [cols]
  (let [unique-name-fn (mbql.u/unique-name-generator)]
    (vec (for [{col-name :name, base-type :base_type, :as driver-col-metadata} cols]
           (let [col-name (name col-name)]
             (merge
              {:display_name (u/qualified-name col-name)
               :source       :native}
              ;; It is perfectly legal for a driver to return a column with a blank name; for example, SQL Server does
              ;; this for aggregations like `count(*)` if no alias is used. However, it is *not* legal to use blank
              ;; names in MBQL `:field` clauses, because `SELECT ""` doesn't make any sense. So if we can't return a
              ;; valid `:field`, omit the `:field_ref`.
              (when-not (str/blank? col-name)
                {:field_ref [:field (unique-name-fn col-name) {:base-type base-type}]})
              driver-col-metadata))))))

(defmethod column-info :native
  [_query {:keys [cols rows] :as _results}]
  (check-driver-native-columns cols rows)
  (annotate-native-cols cols))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                       Adding :cols info for MBQL queries                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(s/defn ^:private join-with-alias :- (s/maybe mbql.s/Join)
  [{:keys [joins source-query]} :- su/Map, join-alias :- su/NonBlankString]
  (or (some
       (fn [{:keys [alias], :as join}]
         (when (= alias join-alias)
           join))
       joins)
      (when source-query
        (join-with-alias source-query join-alias))))

;;; --------------------------------------------------- Field Info ---------------------------------------------------

(defn- display-name-for-joined-field
  "Return an appropriate display name for a joined field. For *explicitly* joined Fields, the qualifier is the join
  alias; for implicitly joined fields, it is the display name of the foreign key used to create the join."
  [field-display-name {:keys [fk-field-id], join-alias :alias}]
  (let [qualifier (if fk-field-id
                    ;; strip off trailing ` id` from FK display name
                    (str/replace (:display_name (qp.store/field fk-field-id))
                                 #"(?i)\sid$"
                                 "")
                    join-alias)]
    (format "%s → %s" qualifier field-display-name)))

(defn- datetime-arithmetics?
  "Helper for [[infer-expression-type]]. Returns true if a given clause returns a :type/DateTime type."
  [clause]
  (mbql.match/match-one clause
    #{:datetime-add :datetime-subtract :relative-datetime}
    true

    [:field _ (_ :guard :temporal-unit)]
    true

    :+
    (some (partial mbql.u/is-clause? :interval) (rest clause))

    _ false))

(declare col-info-for-field-clause)

(def type-info-columns
  "Columns to select from a field to get its type information without getting information that is specific to that
  column."
  [:base_type :effective_type :coercion_strategy :semantic_type])

(defn infer-expression-type
  "Infer base-type/semantic-type information about an `expression` clause."
  [expression]
  (cond
    (string? expression)
    {:base_type :type/Text}

    (number? expression)
    {:base_type :type/Number}

    (mbql.u/is-clause? :field expression)
    (col-info-for-field-clause {} expression)

    (mbql.u/is-clause? :coalesce expression)
    (select-keys (infer-expression-type (second expression)) type-info-columns)

    (mbql.u/is-clause? :length expression)
    {:base_type :type/BigInteger}

    (mbql.u/is-clause? :case expression)
    (let [[_ clauses] expression]
      (some
       (fn [[_ expression]]
         ;; get the first non-nil val
         (when (and (not= expression nil)
                    (or (not (mbql.u/is-clause? :value expression))
                        (let [[_ value] expression]
                          (not= value nil))))
           (select-keys (infer-expression-type expression) type-info-columns)))
       clauses))

    (mbql.u/is-clause? :convert-timezone expression)
    {:converted_timezone (nth expression 2)
     :base_type          :type/DateTime}

    (datetime-arithmetics? expression)
    ;; make sure converted_timezone survived if we do nested datetime operations
    ;; FIXME: this does not preverse converted_timezone for cases nested expressions
    ;; i.e:
    ;; {"expression" {"converted-exp" [:convert-timezone "created-at" "Asia/Ho_Chi_Minh"]
    ;;                "date-add-exp"  [:datetime-add [:expression "converted-exp"] 2 :month]}}
    ;; The converted_timezone metadata added for "converted-exp" will not be brought over
    ;; to ["date-add-exp"].
    ;; maybe this `infer-expression-type` should takes an `inner-query` and look up the
    ;; source expresison as well?
    (merge (select-keys (infer-expression-type (second expression)) [:converted_timezone])
     {:base_type :type/DateTime})

    (mbql.u/is-clause? mbql.s/string-functions expression)
    {:base_type :type/Text}

    (mbql.u/is-clause? mbql.s/numeric-functions expression)
    {:base_type :type/Float}

    :else
    {:base_type :type/*}))

(defn- col-info-for-expression
  [inner-query [_ expression-name :as clause]]
  (merge
   (infer-expression-type (mbql.u/expression-with-name inner-query expression-name))
   {:name            expression-name
    :display_name    expression-name
    ;; provided so the FE can add easily add sorts and the like when someone clicks a column header
    :expression_name expression-name
    :field_ref       clause}))

(s/defn ^:private col-info-for-field-clause*
  [{:keys [source-metadata source-card-id], :as inner-query} [_ id-or-name opts :as clause] :- mbql.s/field]
  (let [join                      (when (:join-alias opts)
                                    (join-with-alias inner-query (:join-alias opts)))
        join-is-at-current-level? (some #(= (:alias %) (:join-alias opts)) (:joins inner-query))
        ;; record additional information that may have been added by middleware. Sometimes pre-processing middleware
        ;; needs to add extra info to track things that it did (e.g. the
        ;; [[metabase.query-processor.middleware.add-dimension-projections]] pre-processing middleware adds keys to
        ;; track which Fields it adds or needs to remap, and then the post-processing middleware does the actual
        ;; remapping based on that info)
        namespaced-options        (not-empty (into {}
                                                   (filter (fn [[k _v]]
                                                             (and (keyword? k) (namespace k))))
                                                   opts))]
    ;; TODO -- I think we actually need two `:field_ref` columns -- one for referring to the Field at the SAME
    ;; level, and one for referring to the Field from the PARENT level.
    (cond-> {:field_ref (mbql.u/remove-namespaced-options clause)}
      (:base-type opts)
      (assoc :base_type (:base-type opts))

      namespaced-options
      (assoc :options namespaced-options)

      (string? id-or-name)
      (merge (or (some-> (some #(when (= (:name %) id-or-name) %) source-metadata)
                         (dissoc :field_ref))
                 {:name         id-or-name
                  :display_name (humanization/name->human-readable-name id-or-name)}))

      (integer? id-or-name)
      (merge (let [{parent-id :parent_id, :as field} (dissoc (qp.store/field id-or-name) :database_type)]
               (if-not parent-id
                 field
                 (let [parent (col-info-for-field-clause inner-query [:field parent-id nil])]
                   (update field :name #(str (:name parent) \. %))))))

      (:binning opts)
      (assoc :binning_info (-> (:binning opts)
                               (set/rename-keys {:strategy :binning-strategy})
                               u/snake-keys))

      (:temporal-unit opts)
      (assoc :unit (:temporal-unit opts))

      (or (:join-alias opts) (:alias join))
      (assoc :source_alias (or (:join-alias opts) (:alias join)))

      join
      (update :display_name display-name-for-joined-field join)

      ;; Join with fk-field-id => IMPLICIT JOIN
      ;; Join w/o fk-field-id  => EXPLICIT JOIN
      (:fk-field-id join)
      (assoc :fk_field_id (:fk-field-id join))

      ;; For IMPLICIT joins, remove `:join-alias` in the resulting Field ref -- it got added there during
      ;; preprocessing by us, and wasn't there originally. Make sure the ref has `:source-field`.
      (:fk-field-id join)
      (update :field_ref mbql.u/update-field-options (fn [opts]
                                                       (-> opts
                                                           (dissoc :join-alias)
                                                           (assoc :source-field (:fk-field-id join)))))

      ;; If source Field (for an IMPLICIT join) is specified in either the field ref or matching join, make sure we
      ;; return it as `fk_field_id`. (Not sure what situations it would actually be present in one but not the other
      ;; -- but it's in the tests :confused:)
      (or (:source-field opts)
          (:fk-field-id join))
      (assoc :fk_field_id (or (:source-field opts)
                              (:fk-field-id join)))

      ;; If the source query is from a saved question, remove the join alias as the caller should not be aware of joins
      ;; happening inside the saved question. The `not join-is-at-current-level?` check is to ensure that we are not
      ;; removing `:join-alias` from fields from the right side of the join.
      (and source-card-id
           (not join-is-at-current-level?))
      (update :field_ref mbql.u/update-field-options dissoc :join-alias))))

(s/defn ^:private col-info-for-field-clause :- {:field_ref mbql.s/Field, s/Keyword s/Any}
  "Return results column metadata for a `:field` or `:expression` clause, in the format that gets returned by QP results"
  [inner-query :- su/Map, clause :- mbql.s/Field]
  (mbql.u/match-one clause
    :expression
    (col-info-for-expression inner-query &match)

    :field
    (col-info-for-field-clause* inner-query &match)

    ;; we should never reach this if our patterns are written right so this is more to catch code mistakes than
    ;; something the user should expect to see
    _
    (throw (ex-info (tru "Don''t know how to get information about Field: {0}" &match)
                    {:field &match}))))

(defn- mlv2-query [inner-query]
  (qp.store/cached [:mlv2-query (hash inner-query)]
    (try
      (lib/query
       (qp.store/metadata-provider)
       (lib.convert/->pMBQL (lib.convert/legacy-query-from-inner-query
                             (:id (qp.store/database))
                             (mbql.normalize/normalize-fragment [:query] inner-query))))
      (catch Throwable e
        (throw (ex-info (tru "Error converting query to pMBQL: {0}" (ex-message e))
                        {:inner-query inner-query, :type qp.error-type/qp}
                        e))))))

(s/defn col-info-for-aggregation-clause
  "Return appropriate column metadata for an `:aggregation` clause."
  ;; `clause` is normally an aggregation clause but this function can call itself recursively; see comments by the
  ;; `match` pattern for field clauses below
  [inner-query :- su/Map clause]
  (let [mlv2-clause (lib.convert/->pMBQL clause)]
    (-> (lib.metadata.calculation/metadata (mlv2-query inner-query) -1 mlv2-clause)
        (update-keys u/->snake_case_en)
        (dissoc :lib/type))))

(mu/defn aggregation-name :- ::lib.schema.common/non-blank-string
  "Return an appropriate aggregation name/alias *used inside a query* for an `:aggregation` subclause (an aggregation
  or expression). Takes an options map as schema won't support passing keypairs directly as a varargs.

  These names are also used directly in queries, e.g. in the equivalent of a SQL `AS` clause."
  [inner-query :- [:and
                   [:map]
                   [:fn
                    {:error/message "legacy inner-query with :source-table or :source-query"}
                    (some-fn :source-table :source-query)]]
   ag-clause]
  (lib.metadata.calculation/column-name (mlv2-query inner-query) (lib.convert/->pMBQL ag-clause)))

(defn aggregation-display-name
  "Return an appropriate user-facing display name for an aggregation clause."
  [inner-query ag-clause]
  (lib.metadata.calculation/display-name (mlv2-query inner-query) (lib.convert/->pMBQL ag-clause)))


;;; ----------------------------------------- Putting it all together (MBQL) -----------------------------------------

(defn- check-correct-number-of-columns-returned [returned-mbql-columns results]
  (let [expected-count (count returned-mbql-columns)
        actual-count   (count (:cols results))]
    (when (seq (:rows results))
      (when-not (= expected-count actual-count)
        (throw
         (ex-info (str (tru "Query processor error: mismatched number of columns in query and results.")
                       " "
                       (tru "Expected {0} fields, got {1}" expected-count actual-count)
                       "\n"
                       (tru "Expected: {0}" (mapv :name returned-mbql-columns))
                       "\n"
                       (tru "Actual: {0}" (vec (:columns results))))
                  {:expected returned-mbql-columns
                   :actual   (:cols results)}))))))

(s/defn ^:private cols-for-fields
  [{:keys [fields], :as inner-query} :- su/Map]
  (for [field fields]
    (assoc (col-info-for-field-clause inner-query field)
           :source :fields)))

(s/defn ^:private cols-for-ags-and-breakouts
  [{aggregations :aggregation, breakouts :breakout, :as inner-query} :- su/Map]
  (concat
   (for [breakout breakouts]
     (assoc (col-info-for-field-clause inner-query breakout)
            :source :breakout))
   (for [[i aggregation] (m/indexed aggregations)]
     (assoc (col-info-for-aggregation-clause inner-query aggregation)
            :source    :aggregation
            :field_ref [:aggregation i]))))

(s/defn cols-for-mbql-query
  "Return results metadata about the expected columns in an 'inner' MBQL query."
  [inner-query :- su/Map]
  (concat
   (cols-for-ags-and-breakouts inner-query)
   (cols-for-fields inner-query)))

(s/defn ^:private merge-source-metadata-col :- (s/maybe su/Map)
  [source-metadata-col :- (s/maybe su/Map) col :- (s/maybe su/Map)]
  (merge
    {} ;; ensure the type is not FieldInstance
    (when-let [field-id (:id source-metadata-col)]
      (dissoc (qp.store/field field-id) :database_type))
   source-metadata-col
   col
   ;; pass along the unit from the source query metadata if the top-level metadata has unit `:default`. This way the
   ;; frontend will display the results correctly if bucketing was applied in the nested query, e.g. it will format
   ;; temporal values in results using that unit
   (when (= (:unit col) :default)
     (select-keys source-metadata-col [:unit]))))

(defn- maybe-merge-source-metadata
  "Merge information from `source-metadata` into the returned `cols` for queries that return the columns of a source
  query as-is (i.e., the parent query does not have breakouts, aggregations, or an explicit`:fields` clause --
  excluding the one added automatically by `add-source-metadata`)."
  [source-metadata cols]
  (if (= (count cols) (count source-metadata))
    (map merge-source-metadata-col source-metadata cols)
    cols))

(defn- flow-field-metadata
  "Merge information about fields from `source-metadata` into the returned `cols`."
  [source-metadata cols dataset?]
  (let [by-key (m/index-by (comp qp.util/field-ref->key :field_ref) source-metadata)]
    (for [{:keys [field_ref source] :as col} cols]
     ;; aggregation fields are not from the source-metadata and their field_ref
     ;; are not unique for a nested query. So do not merge them otherwise the metadata will be messed up.
     ;; TODO: I think the best option here is to introduce a parent_field_ref so that
     ;; we could preserve metadata such as :sematic_type or :unit from the source field.
      (if-let [source-metadata-for-field (and (not= :aggregation source)
                                              (get by-key (qp.util/field-ref->key field_ref)))]
        (merge-source-metadata-col source-metadata-for-field
                                   (merge col
                                          (when dataset?
                                            (select-keys source-metadata-for-field qp.util/preserved-keys))))
        col))))

(declare mbql-cols)

(defn- cols-for-source-query
  [{:keys [source-metadata], {native-source-query :native, :as source-query} :source-query} results]
  (let [columns       (if native-source-query
                        (maybe-merge-source-metadata source-metadata (column-info {:type :native} results))
                        (mbql-cols source-query results))]
    (qp.util/combine-metadata columns source-metadata)))

(defn mbql-cols
  "Return the `:cols` result metadata for an 'inner' MBQL query based on the fields/breakouts/aggregations in the
  query."
  [{:keys [source-metadata source-query :source-query/dataset? fields], :as inner-query}, results]
  (let [cols (cols-for-mbql-query inner-query)]
    (cond
      (and (empty? cols) source-query)
      (cols-for-source-query inner-query results)

      source-query
      (flow-field-metadata (cols-for-source-query inner-query results) cols dataset?)

      (every? #(mbql.u/match-one % [:field (field-name :guard string?) _] field-name) fields)
      (maybe-merge-source-metadata source-metadata cols)

      :else
      cols)))

(defmethod column-info :query
  [{inner-query :query} results]
  (u/prog1 (mbql-cols inner-query results)
    (check-correct-number-of-columns-returned <> results)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Deduplicating names                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private ColsWithUniqueNames
  (s/constrained [Col] #(su/empty-or-distinct? (map :name %)) ":cols with unique names"))

(s/defn ^:private deduplicate-cols-names :- ColsWithUniqueNames
  [cols :- [Col]]
  (map (fn [col unique-name]
         (assoc col :name unique-name))
       cols
       (mbql.u/uniquify-names (map :name cols))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           add-column-info middleware                                           |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- merge-col-metadata
  "Merge a map from `:cols` returned by the driver with the column metadata determined by the logic above."
  [our-col-metadata driver-col-metadata]
  ;; 1. Prefer our `:name` if it's something different that what's returned by the driver
  ;;    (e.g. for named aggregations)
  ;; 2. Prefer our inferred base type if the driver returned `:type/*` and ours is more specific
  ;; 3. Then, prefer any non-nil keys returned by the driver
  ;; 4. Finally, merge in any of our other keys
  (let [non-nil-driver-col-metadata (m/filter-vals some? driver-col-metadata)
        our-base-type               (when (= (:base_type driver-col-metadata) :type/*)
                                      (u/select-non-nil-keys our-col-metadata [:base_type]))
        ;; whatever type comes back from the query is by definition the effective type, fallback to our effective
        ;; type, fallback to the base_type
        effective-type              (when-let [db-base (or (:base_type driver-col-metadata)
                                                           (:effective_type our-col-metadata)
                                                           (:base_type our-col-metadata))]
                                      {:effective_type db-base})
        our-name                    (u/select-non-nil-keys our-col-metadata [:name])]
    (merge our-col-metadata
           non-nil-driver-col-metadata
           our-base-type
           our-name
           effective-type)))

(defn- merge-cols-returned-by-driver
  "Merge our column metadata (`:cols`) derived from logic above with the column metadata returned by the driver. We'll
  prefer the values in theirs to ours. This is important for wacky drivers like GA that use things like native
  metrics, which we have no information about.

  It's the responsibility of the driver to make sure the `:cols` are returned in the correct number and order."
  [our-cols cols-returned-by-driver]
  (if (seq cols-returned-by-driver)
    (mapv merge-col-metadata our-cols cols-returned-by-driver)
    our-cols))

(s/defn merged-column-info :- ColsWithUniqueNames
  "Returns deduplicated and merged column metadata (`:cols`) for query results by combining (a) the initial results
  metadata returned by the driver's impl of `execute-reducible-query` and (b) column metadata inferred by logic in
  this namespace."
  [query {cols-returned-by-driver :cols, :as result}]
  (deduplicate-cols-names
   (merge-cols-returned-by-driver (column-info query result) cols-returned-by-driver)))

(defn base-type-inferer
  "Native queries don't have the type information from the original `Field` objects used in the query.
  If the driver returned a base type more specific than :type/*, use that; otherwise look at the sample
  of rows and infer the base type based on the classes of the values"
  [{:keys [cols]}]
  (apply fingerprinters/col-wise
         (for [{driver-base-type :base_type} cols]
           (if (contains? #{nil :type/*} driver-base-type)
             (driver.common/values->base-type)
             (fingerprinters/constant-fingerprinter driver-base-type)))))

(defn- add-column-info-xform
  [query metadata rf]
  (qp.reducible/combine-additional-reducing-fns
   rf
   [(base-type-inferer metadata)
    ((take 1) conj)]
   (fn combine [result base-types truncated-rows]
     (let [metadata (update metadata :cols
                            (comp annotate-native-cols
                                  (fn [cols]
                                    (map (fn [col base-type]
                                           (-> col
                                               (assoc :base_type base-type)
                                               ;; annotate will add a field ref with type info
                                               (dissoc :field_ref)))
                                         cols
                                         base-types))))]
       (rf (cond-> result
             (map? result)
             (assoc-in [:data :cols]
                       (merged-column-info
                        query
                        (assoc metadata :rows truncated-rows)))))))))

(defn add-column-info
  "Middleware for adding type information about the columns in the query results (the `:cols` key)."
  [{query-type :type, :as query
    {:keys [:metadata/dataset-metadata :alias/escaped->original]} :info} rff]
  (fn add-column-info-rff* [metadata]
    (if (and (= query-type :query)
             ;; we should have type metadata eiter in the query fields
             ;; or in the result metadata for the following code to work
             (or (->> query :query keys (some #{:aggregation :breakout :fields}))
                 (every? :base_type (:cols metadata))))
      (let [query (cond-> query
                    (seq escaped->original) ;; if we replaced aliases, restore them
                    (escape-join-aliases/restore-aliases escaped->original))]
        (rff (cond-> (assoc metadata :cols (merged-column-info query metadata))
               (seq dataset-metadata)
               (update :cols qp.util/combine-metadata dataset-metadata))))
      ;; rows sampling is only needed for native queries! TODO ­ not sure we really even need to do for native
      ;; queries...
      (let [metadata (cond-> (update metadata :cols annotate-native-cols)
                       ;; annotate-native-cols ensures that column refs are present which we need to match metadata
                       (seq dataset-metadata)
                       (update :cols qp.util/combine-metadata dataset-metadata)
                       ;; but we want those column refs removed since they have type info which we don't know yet
                       :always
                       (update :cols (fn [cols] (map #(dissoc % :field_ref) cols))))]
        (add-column-info-xform query metadata (rff metadata))))))
