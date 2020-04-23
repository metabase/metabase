(ns metabase.query-processor.middleware.resolve-joins
  "Middleware that fetches tables that will need to be joined, referred to by `fk->` clauses, and adds information to
  the query about what joins should be done and how they should be performed."
  (:refer-clojure :exclude [alias])
  (:require [metabase.mbql
             [schema :as mbql.s]
             [util :as mbql.u]]
            [metabase.query-processor.middleware.add-implicit-clauses :as add-implicit-clauses]
            [metabase.query-processor.store :as qp.store]
            [metabase.util :as u]
            [metabase.util
             [i18n :refer [tru]]
             [schema :as su]]
            [schema.core :as s]))

(def ^:private Joins
  "Schema for a non-empty sequence of Joins. Unlike `mbql.s/Joins`, this does not enforce the constraint that all join
  aliases be unique; that is not guaranteeded until `mbql.u/deduplicate-join-aliases` transforms the joins."
  (su/non-empty [mbql.s/Join]))

(def ^:private UnresolvedMBQLQuery
  "Schema for the parts of the query we're modifying. For use in the various intermediate transformations in the
  middleware."
  {:joins                   [mbql.s/Join]
   (s/optional-key :fields) mbql.s/Fields
   s/Keyword                s/Any})

(def ^:private ResolvedMBQLQuery
  "Schema for the final results of this middleware."
  (s/constrained
   mbql.s/MBQLQuery
   (fn [{:keys [joins]}]
     (every?
      (fn [{:keys [fields]}]
        (or
         (empty? fields)
         (sequential? fields)))
      joins))
   "Valid MBQL query where `:joins` `:fields` is sequence of Fields or removed"))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                 Resolving Tables & Fields / Saving in QP Store                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(s/defn ^:private resolve-fields! :- (s/eq nil)
  [joins :- Joins]
  (qp.store/fetch-and-store-fields! (mbql.u/match joins [:field-id id] id)))

(s/defn ^:private resolve-tables! :- (s/eq nil)
  "Add Tables referenced by `:joins` to the Query Processor Store. This is only really needed for implicit joins,
  because their Table references are added after `resolve-source-tables` runs."
  [joins :- Joins]
  (qp.store/fetch-and-store-tables! (remove nil? (map :source-table joins))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             :joins Transformations                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(s/defn ^:private merge-defaults :- mbql.s/Join
  [join]
  (merge {:strategy :left-join} join))

(defn- source-metadata->fields [{:keys [alias], :as join} source-metadata]
  (when-not (seq source-metadata)
    (throw (ex-info (tru "Cannot use :fields :all in join against source query unless it has :source-metadata.")
             {:join join})))
  (for [{field-name :name, base-type :base_type} source-metadata]
    [:joined-field alias [:field-literal field-name base-type]]))

(s/defn ^:private handle-all-fields :- mbql.s/Join
  "Replace `:fields :all` in a join with an appropriate list of Fields."
  [{:keys [source-table source-query alias fields source-metadata], :as join} :- mbql.s/Join]
  (merge
   join
   (when (= fields :all)
     {:fields (if source-query
               (source-metadata->fields join source-metadata)
               (for [field (add-implicit-clauses/sorted-implicit-fields-for-table source-table)]
                 (mbql.u/->joined-field alias field)))})))


(s/defn ^:private resolve-references-and-deduplicate :- mbql.s/Joins
  [joins :- Joins]
  (resolve-tables! joins)
  (u/prog1 (->> joins
                mbql.u/deduplicate-join-aliases
                (map merge-defaults)
                (mapv handle-all-fields))
    (resolve-fields! <>)))

(declare resolve-joins-in-mbql-query-all-levels)

(s/defn ^:private resolve-join-source-queries :- mbql.s/Joins
  [joins :- mbql.s/Joins]
  (for [{:keys [source-query], :as join} joins]
    (cond-> join
      source-query resolve-joins-in-mbql-query-all-levels)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           MBQL-Query Transformations                                           |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- joins->fields
  "Return a flattened list of all `:fields` referenced in `joins`."
  [joins]
  (reduce concat (filter sequential? (map :fields joins))))

(defn- remove-joins-fields [joins]
  (vec (for [join joins]
         (dissoc join :fields))))

(defn- should-add-join-fields?
  "Should we append the `:fields` from `:joins` to the parent-level query's `:fields`? True unless the parent-level
  query has breakouts or aggregations."
  [{breakouts :breakout, aggregations :aggregation}]
  (every? empty? [aggregations breakouts]))

(s/defn ^:private merge-joins-fields :- UnresolvedMBQLQuery
  "Append the `:fields` from `:joins` into their parent level as appropriate so joined columns appear in the final
  query results, and remove the `:fields` entry for all joins.

  If the parent-level query has breakouts and/or aggregations, this function won't append the joins fields to the
  parent level, because we should only be returning the ones from the ags and breakouts in the final results."
  [{:keys [joins], :as inner-query} :- UnresolvedMBQLQuery]
  (let [join-fields (when (should-add-join-fields? inner-query)
                      (joins->fields joins))
        inner-query(update inner-query :joins remove-joins-fields)]
    (cond-> inner-query
      (seq join-fields) (update :fields (comp vec distinct concat) join-fields))))

(defn- check-join-aliases [{:keys [joins], :as query}]
  (let [aliases (set (map :alias joins))]
    (doseq [alias (mbql.u/match query [:joined-field alias _] alias)]
      (when-not (aliases alias)
        (throw
         (IllegalArgumentException.
           (tru "Bad :joined-field clause: join with alias ''{0}'' does not exist. Found: {1}"
                alias aliases)))))))

(s/defn ^:private resolve-joins-in-mbql-query :- ResolvedMBQLQuery
  [{:keys [joins], :as query} :- mbql.s/MBQLQuery]
  (u/prog1 (-> query
               (update :joins resolve-references-and-deduplicate)
               (update :joins resolve-join-source-queries)
               merge-joins-fields)
    (check-join-aliases (dissoc <> :source-query))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                Middleware & Boring Recursive Application Stuff                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- ^:deprecated maybe-resolve-source-table
  "Resolve the `source-table` of any `source-query` inside a join.

  TODO - this is no longer needed. `resolve-source-tables` middleware handles all table resolution."
  [{:keys [source-table], :as query}]
  (qp.store/fetch-and-store-tables! [source-table])
  query)

(defn- resolve-joins-in-mbql-query-all-levels
  [{:keys [joins source-query source-table], :as query}]
  (cond-> query
    (seq joins)
    resolve-joins-in-mbql-query

    source-table
    maybe-resolve-source-table

    source-query
    (update :source-query resolve-joins-in-mbql-query-all-levels)))

(defn- resolve-joins* [{inner-query :query, :as outer-query}]
  (cond-> outer-query
    inner-query (update :query resolve-joins-in-mbql-query-all-levels)))

(defn resolve-joins
  "Add any Tables and Fields referenced by the `:joins` clause to the QP store."
  [qp]
  (fn [query rff context]
    (qp (resolve-joins* query) rff context)))
