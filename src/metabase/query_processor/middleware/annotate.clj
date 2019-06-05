(ns metabase.query-processor.middleware.annotate
  "Middleware for annotating (adding type information to) the results of a query, under the `:cols` column."
  (:require [clojure.string :as str]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.driver.common :as driver.common]
            [metabase.mbql
             [predicates :as mbql.preds]
             [schema :as mbql.s]
             [util :as mbql.u]]
            [metabase.models.humanization :as humanization]
            [metabase.query-processor.store :as qp.store]
            [metabase.util
             [i18n :refer [tru]]
             [schema :as su]]
            [schema.core :as s]))

(def ^:private Col
  "Schema for a valid map of column info as found in the `:cols` key of the results after this namespace has ran."
  ;; name and display name can be blank because some wacko DBMSes like SQL Server return blank column names for
  ;; unaliased aggregations like COUNT(*) (this only applies to native queries, since we determine our own names for
  ;; MBQL.)
  {:name                          s/Str
   :display_name                  s/Str
   ;; type of the Field. For Native queries we look at the values in the first 100 rows to make an educated guess
   :base_type                     su/FieldType
   (s/optional-key :special_type) (s/maybe su/FieldType)
   ;; where this column came from in the original query.
   :source                        (s/enum :aggregation :fields :breakout :native)
   ;; various other stuff from the original Field can and should be included such as `:settings`
   s/Any                          s/Any})


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                      Adding :cols info for native queries                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- native-cols
  "Infer the types of columns by looking at the first value for each in the results, which will be added to the results
  as `:cols`. This is used for native queries, which don't have the type information from the original `Field` objects
  used in the query."
  [{:keys [columns rows]}]
  (vec (for [i    (range (count columns))
             :let [col (nth columns i)]]
         {:name         (name col)
          :display_name (or (humanization/name->human-readable-name (u/keyword->qualified-name col))
                            (u/keyword->qualified-name col))
          :base_type    (or (driver.common/values->base-type (for [row rows]
                                                               (nth row i)))
                            :type/*)
          :source       :native})))

(defn- add-native-column-info
  [{:keys [columns], :as results}]
  (assoc results
    :columns (mapv name columns)
    :cols    (native-cols results)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                       Adding :cols info for MBQL queries                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(s/defn ^:private join-with-alias :- (s/maybe mbql.s/Join)
  [{:keys [joins]} :- su/Map, join-alias :- su/NonBlankString]
  (some
   (fn [{:keys [alias], :as join}]
     (when (= alias join-alias)
       join))
   joins))

;;; --------------------------------------------------- Field Info ---------------------------------------------------

(s/defn ^:private col-info-for-field-clause :- su/Map
  [inner-query :- su/Map, clause :- mbql.s/Field]
  ;; for various things that can wrap Field clauses recurse on the wrapped Field but include a little bit of info
  ;; about the clause doing the wrapping
  (mbql.u/match-one clause
    [:binning-strategy field strategy _ resolved-options]
    (assoc (col-info-for-field-clause inner-query field)
      :binning_info (assoc (u/snake-keys resolved-options)
                      :binning_strategy strategy))

    [:datetime-field field unit]
    (assoc (col-info-for-field-clause inner-query field) :unit unit)

    [:joined-field alias field]
    (let [{:keys [fk-field-id]} (join-with-alias inner-query alias)]
      (assoc (col-info-for-field-clause inner-query field) :fk_field_id fk-field-id))

    ;; TODO - should be able to remove this now
    [:fk-> [:field-id source-field-id] field]
    (assoc (col-info-for-field-clause inner-query field) :fk_field_id source-field-id)

    ;; TODO - should be able to remove this now
    ;; for FKs where source is a :field-literal don't include `:fk_field_id`
    [:fk-> _ field]
    (recur field)

    [:field-literal field-name field-type]
    {:name         field-name
     :base_type    field-type
     :display_name (humanization/name->human-readable-name field-name)}

    [:expression expression-name]
    {:name            expression-name
     :display_name    expression-name
     :base_type       :type/Float
     :special_type    :type/Number
     ;; provided so the FE can add easily add sorts and the like when someone clicks a column header
     :expression_name expression-name}

    [:field-id id]
    (let [{parent-id :parent_id, :as field} (dissoc (qp.store/field id) :database_type)]
      (if-not parent-id
        field
        (let [parent (col-info-for-field-clause inner-query [:field-id parent-id])]
          (update field :name #(str (:name parent) \. %)))))

    ;; we should never reach this if our patterns are written right so this is more to catch code mistakes than
    ;; something the user should expect to see
    _ (throw (ex-info (str (tru "Don't know how to get information about Field:") " " &match)
               {:field &match}))))


;;; ---------------------------------------------- Aggregate Field Info ----------------------------------------------

(def ^:private arithmetic-op->text
  {:+ "add"
   :- "sub"
   :/ "div"
   :* "mul"})

(declare aggregation-name)

(defn- expression-ag-arg->name
  "Generate an appropriate name for an `arg` in an expression aggregation."
  [arg]
  (mbql.u/match-one arg
    ;; if the arg itself is a nested expression, recursively find a name for it, and wrap in parens
    [(_ :guard #{:+ :- :/ :*}) & _]
    (str "(" (aggregation-name &match) ")")

    ;; if the arg is another aggregation, recurse to get its name. (Only aggregations, nested expressions, or numbers
    ;; are allowed as args to expression aggregations; thus anything that's an MBQL clause, but not a nested
    ;; expression, is a ag clause.)
    [(_ :guard keyword?) & _]
    (aggregation-name &match)

    ;; otherwise for things like numbers just use that directly
    _ &match))

(s/defn aggregation-name :- su/NonBlankString
  "Return an appropriate field *and* display name for an `:aggregation` subclause (an aggregation or
  expression). Takes an options map as schema won't support passing keypairs directly as a varargs. `{:top-level?
  true}` will cause a name to be generated that will appear in the results, other names with a leading __ will be
  trimmed on some backends."
  [ag-clause :- mbql.s/Aggregation & [{:keys [top-level?]}]]
  (when-not driver/*driver*
    (throw (Exception. (str (tru "*driver* is unbound.")))))
  (mbql.u/match-one ag-clause
    ;; if a custom name was provided use it
    [:named _ ag-name]
    (driver/format-custom-field-name driver/*driver* ag-name)

    ;; For unnamed expressions, just compute a name like "sum + count"
    ;; Top level expressions need a name without a leading __ as those are automatically removed from the results
    [(operator :guard #{:+ :- :/ :*}) & args]
    (str (when top-level?
           (str (arithmetic-op->text operator)
                "__"))
         (str/join (str " " (name operator) " ")
                   (map expression-ag-arg->name args)))

    ;; for unnamed normal aggregations, the column alias is always the same as the ag type except for `:distinct` which
    ;; is called `:count` (WHY?)
    [:distinct _]
    "count"

    ;; for any other aggregation just use the name of the clause e.g. `sum`
    [clause-name & _]
    (name clause-name)))

(defn- ag->name-info [ag]
  (let [ag-name (aggregation-name ag)]
    {:name         ag-name
     :display_name ag-name}))

(s/defn ^:private col-info-for-aggregation-clause
  "Return appropriate column metadata for an `:aggregation` clause."
  ; `clause` is normally an aggregation clause but this function can call itself recursively; see comments by the
  ; `match` pattern for field clauses below
  [inner-query :- su/Map, clause]
  (mbql.u/match-one clause
    ;; ok, if this is a named aggregation recurse so we can get information about the ag we are naming
    [:named ag _]
    (merge
     (col-info-for-aggregation-clause inner-query ag)
     (ag->name-info &match))

    ;; Always treat count or distinct count as an integer even if the DB in question returns it as something
    ;; wacky like a BigDecimal or Float
    [(_ :guard #{:count :distinct}) & args]
    (merge
     (col-info-for-aggregation-clause inner-query args)
     {:base_type    :type/Integer
      :special_type :type/Number}
     (ag->name-info &match))

    ; TODO - should we be doing this for `:sum-where` as well?
    [:count-where _]
    (merge
     {:base_type    :type/Integer
      :special_type :type/Number}
     (ag->name-info &match))

    [:share _]
    (merge
     {:base_type    :type/Float
      :special_type :type/Number}
     (ag->name-info &match))

    ;; get info from a Field if we can (theses Fields are matched when ag clauses recursively call
    ;; `col-info-for-ag-clause`, and this info is added into the results)
    (_ :guard mbql.preds/Field?)
    (select-keys (col-info-for-field-clause inner-query &match) [:base_type :special_type :settings])

    ;; For the time being every Expression is an arithmetic operator and returns a floating-point number, so
    ;; hardcoding these types is fine; In the future when we extend Expressions to handle more functionality
    ;; we'll want to introduce logic that associates a return type with a given expression. But this will work
    ;; for the purposes of a patch release.
    [(_ :guard #{:expression :+ :- :/ :*}) & _]
    (merge
     {:base_type    :type/Float
      :special_type :type/Number}
     (when (mbql.preds/Aggregation? &match)
       (ag->name-info &match)))

    ;; get name/display-name of this ag
    [(_ :guard keyword?) arg & args]
    (merge
     (col-info-for-aggregation-clause inner-query arg)
     (ag->name-info &match))))


;;; ----------------------------------------- Putting it all together (MBQL) -----------------------------------------

(defn- check-correct-number-of-columns-returned [returned-mbql-columns results]
  (let [expected-count (count returned-mbql-columns)
        actual-count   (count (:columns results))]
    (when (seq (:rows results))
      (when-not (= expected-count actual-count)
        (throw
         (Exception.
          (str (tru "Query processor error: mismatched number of columns in query and results.")
               " "
               (tru "Expected {0} fields, got {1}" expected-count actual-count)
               "\n"
               (tru "Expected: {0}" (mapv :name returned-mbql-columns))
               "\n"
               (tru "Actual: {0}" (vec (:columns results))))))))))

(s/defn ^:private cols-for-fields
  [{:keys [fields], :as inner-query} :- su/Map]
  (for [field fields]
    (assoc (col-info-for-field-clause inner-query field) :source :fields)))

(s/defn ^:private cols-for-ags-and-breakouts
  [{aggregations :aggregation, breakouts :breakout, :as inner-query} :- su/Map]
  (concat
   (for [breakout breakouts]
     (assoc (col-info-for-field-clause inner-query breakout) :source :breakout))
   (for [aggregation aggregations]
     (assoc (col-info-for-aggregation-clause inner-query aggregation) :source :aggregation))))

(s/defn cols-for-mbql-query
  "Return results metadata about the expected columns in an 'inner' MBQL query."
  [inner-query :- su/Map]
  (concat
   (cols-for-ags-and-breakouts inner-query)
   (cols-for-fields inner-query)))

(declare mbql-cols)

(defn- maybe-merge-source-metadata
  "Merge information from `source-metadata` into the returned `cols` for queries that return the columns of a source
  query as-is (i.e., the parent query does not have breakouts, aggregations, or an explicit`:fields` clause --
  excluding the one added automatically by `add-source-metadata`)."
  [source-metadata cols]
  (if (= (count cols) (count source-metadata))
    (map merge source-metadata cols)
    cols))

(defn- cols-for-source-query
  [{:keys [source-metadata], {native-source-query :native, :as source-query} :source-query} results]
  (if native-source-query
    (maybe-merge-source-metadata source-metadata (native-cols results))
    (mbql-cols source-query results)))

(defn ^:private mbql-cols
  "Return the `:cols` result metadata for an 'inner' MBQL query based on the fields/breakouts/aggregations in the query."
  [{:keys [source-metadata source-query fields], :as inner-query} results]
  (let [cols (cols-for-mbql-query inner-query)]
    (cond
      (and (empty? cols) source-query)
      (cols-for-source-query inner-query results)

      (every? (partial mbql.u/is-clause? :field-literal) fields)
      (maybe-merge-source-metadata source-metadata cols)

      :else
      cols)))

(defn- add-mbql-column-info [{inner-query :query, :as query} results]
  (let [cols (mbql-cols inner-query results)]
    (check-correct-number-of-columns-returned cols results)
    (assoc results :cols cols)))


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

(s/defn ^:private add-column-info* :- {:cols ColsWithUniqueNames, s/Keyword s/Any}
  [{query-type :type, :as query} {cols-returned-by-driver :cols, :as results}]
  (->
   ;; add `:cols` info to the query, using the appropriate function based on query type
   (if-not (= query-type :query)
     (add-native-column-info results)
     (add-mbql-column-info query results))
   ;; If the driver returned a `:cols` map with its results, which is completely optional, merge our `:cols` derived
   ;; from logic above with theirs. We'll prefer the values in theirs to ours. This is important for wacky drivers
   ;; like GA that use things like native metrics, which we have no information about.
   ;;
   ;; It's the responsibility of the driver to make sure the `:cols` are returned in the correct number and order.
   (update :cols (if (seq cols-returned-by-driver)
                   #(map merge % cols-returned-by-driver)
                   identity))
   ;; Finally, make sure the `:name` of each map in `:cols` is unique, since the FE uses it as a key for stuff like
   ;; column settings
   (update :cols deduplicate-cols-names)))

(defn add-column-info
  "Middleware for adding type information about the columns in the query results (the `:cols` key)."
  [qp]
  (fn [query]
    (add-column-info* query (qp query))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                     result-rows-maps-to-vectors middleware                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- uniquify-aggregations [inner-query]
  (update inner-query :aggregation (partial mbql.u/pre-alias-and-uniquify-aggregations aggregation-name)))

(s/defn ^:private expected-column-sort-order :- [s/Keyword]
  "Determine query result row column names (as keywords) sorted in the appropriate order based on a `query`."
  [{query-type :type, inner-query :query, :as query} {[first-row] :rows, :as results}]
  (if (= query-type :query)
    (map (comp keyword :name) (mbql-cols (uniquify-aggregations inner-query) results))
    (map keyword (keys first-row))))

(defn- result-rows-maps->vectors* [query {[first-row :as rows] :rows, columns :columns, :as results}]
  (when (or (map? first-row)
            ;; if no rows were returned and the driver didn't return `:columns`, go ahead and calculate them so we can
            ;; add them -- drivers that rely on this behavior still need us to do that for them for queries that
            ;; return no results
            (and (empty? rows)
                 (nil? columns)))
    (let [sorted-columns (expected-column-sort-order query results)]
      (assoc results
        ;; TODO - we don't really use `columns` any more and can remove this at some point
        :columns (map u/keyword->qualified-name sorted-columns)
        :rows    (for [row rows]
                   (for [col sorted-columns]
                     (get row col)))))))

(defn result-rows-maps->vectors
  "For drivers that return query result rows as a sequence of maps rather than a sequence of vectors, determine
  appropriate column sort order and convert rows to sequences (the expected MBQL result format).

  Certain databases like MongoDB and Druid always return result rows as maps, rather than something sequential (e.g.
  vectors). Rather than require those drivers to duplicate the logic in this and other QP middleware namespaces for
  determining expected column sort order, drivers have the option of leaving the `:rows` as a sequence of maps, and
  this middleware will handle things for them.

  Because the order of `:columns` is determined by this middleware, it adds `:columns` to the results as well as the
  updated `:rows`; drivers relying on this middleware should return a map containing only `:rows`.

  IMPORTANT NOTES:

  *  Determining correct sort order only works for MBQL queries. For native queries, the sort order is the result of
     calling `keys` on the first row. It is reccomended that you utilize Flatland `ordered-map` when possible to
     preserve key ordering in maps.

  *  For obvious reasons, drivers that returns rows as maps cannot support duplicate column names. Thus it is expected
     that drivers that use functionality provided by this middleware return deduplicated column names, e.g. `:sum` and
     `:sum_2` for queries with multiple `:sum` aggregations.

     Call `mbql.u/pre-alias-and-uniquify-aggregations` on your query before processing it tp add appropriate aliases to
     aggregations. Currently this assumes you are passing `annotate/aggregation-name` as the function to generate
     aggregation names; if your driver is doing something drastically different, you may need to tweak the keys in the
     result row maps so they match up with the keys generated by that function.

  *  For *nested* Fields, this namespace assumes result row maps will come back flattened, and Field name keys will
     come back qualified by names of their ancestors, e.g. `parent.child`, `grandparent.parent.child`, etc. This is done
     to remove any ambiguity between nested columns with the same name (e.g. a document with both `user.id` and
     `venue.id`). Be sure to follow this convention if your driver supports nested Fields (e.g., MongoDB)."
  [qp]
  (fn [query]
    (let [results (qp query)]
      (or
       (result-rows-maps->vectors* query results)
       results))))
