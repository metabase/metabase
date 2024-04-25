(ns metabase.query-processor.middleware.resolve-joins
  "Middleware that fetches tables that will need to be joined, referred to by `:field` clauses with `:source-field`
  options, and adds information to the query about what joins should be done and how they should be performed."
  (:refer-clojure :exclude [alias])
  (:require
   [medley.core :as m]
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.query-processor.middleware.add-implicit-clauses :as qp.add-implicit-clauses]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.util.add-alias-info :as add]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(def ^:private Joins
  "Schema for a non-empty sequence of Joins. Unlike [[mbql.s/Joins]], this does not enforce the constraint that all join
  aliases be unique; that is handled by the [[metabase.query-processor.middleware.escape-join-aliases]] middleware."
  [:sequential {:min 1} mbql.s/Join])

(def ^:private UnresolvedMBQLQuery
  "Schema for the parts of the query we're modifying. For use in the various intermediate transformations in the
  middleware."
  [:map
   [:joins [:sequential mbql.s/Join]]
   [:fields {:optional true} mbql.s/Fields]])

(def ^:private ResolvedMBQLQuery
  "Schema for the final results of this middleware."
  [:and
   UnresolvedMBQLQuery
   [:fn
    {:error/message "Valid MBQL query where `:joins` `:fields` is sequence of Fields or removed"}
    (fn [{:keys [joins]}]
      (every?
       (fn [{:keys [fields]}]
         (or
          (empty? fields)
          (sequential? fields)))
       joins))]])

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                 Resolving Tables & Fields / Saving in QP Store                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(mu/defn ^:private resolve-fields! :- :nil
  [joins :- Joins]
  (lib.metadata/bulk-metadata-or-throw (qp.store/metadata-provider)
                                       :metadata/column
                                       (lib.util.match/match joins [:field (id :guard integer?) _] id))
  nil)

(mu/defn ^:private resolve-tables! :- :nil
  "Add Tables referenced by `:joins` to the Query Processor Store. This is only really needed for implicit joins,
  because their Table references are added after `resolve-source-tables` runs."
  [joins :- Joins]
  (lib.metadata/bulk-metadata-or-throw (qp.store/metadata-provider)
                                       :metadata/table
                                       (remove nil? (map :source-table joins)))
  nil)


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             :Joins Transformations                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private default-join-alias "__join")

(mu/defn ^:private merge-defaults :- mbql.s/Join
  [join]
  (merge {:alias default-join-alias, :strategy :left-join} join))

(defn- source-metadata->fields [{:keys [alias], :as join} source-metadata]
  (when-not (seq source-metadata)
    (throw (ex-info (tru "Cannot use :fields :all in join against source query unless it has :source-metadata.")
                    {:join join})))
  (let [duplicate-ids (into #{}
                            (keep (fn [[item freq]]
                                    (when (> freq 1)
                                      item)))
                            (frequencies (map :id source-metadata)))]
    (for [{field-name :name, base-type :base_type, field-id :id} source-metadata]
      (if (and field-id (not (contains? duplicate-ids field-id)))
        ;; field-id is a unique reference, use it
        [:field field-id   {:join-alias alias}]
        [:field field-name {:base-type base-type, :join-alias alias}]))))

(mu/defn ^:private handle-all-fields :- mbql.s/Join
  "Replace `:fields :all` in a join with an appropriate list of Fields."
  [{:keys [source-table source-query alias fields source-metadata], :as join} :- mbql.s/Join]
  (merge
   join
   (when (= fields :all)
     {:fields (if source-query
                (source-metadata->fields join source-metadata)
                (for [[_ id-or-name opts] (qp.add-implicit-clauses/sorted-implicit-fields-for-table source-table)]
                  [:field id-or-name (assoc opts :join-alias alias)]))})))

(mu/defn ^:private resolve-references :- Joins
  [joins :- Joins]
  (resolve-tables! joins)
  (u/prog1 (into []
                 (comp (map merge-defaults)
                       (map handle-all-fields))
                 joins)
    (resolve-fields! <>)))

(declare resolve-joins-in-mbql-query-all-levels)

(mu/defn ^:private resolve-join-source-queries :- Joins
  [joins :- Joins]
  (for [{:keys [source-query], :as join} joins]
    (cond-> join
      source-query resolve-joins-in-mbql-query-all-levels)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           MBQL-Query Transformations                                           |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- joins->fields
  "Return a flattened list of all `:fields` referenced in `joins`."
  [joins]
  (into []
        (comp (map :fields)
              (filter sequential?)
              cat)
        joins))

(defn- should-add-join-fields?
  "Should we append the `:fields` from `:joins` to the parent-level query's `:fields`? True unless the parent-level
  query has breakouts or aggregations."
  [{breakouts :breakout, aggregations :aggregation}]
  (every? empty? [aggregations breakouts]))

(defn- append-join-fields [fields join-fields]
  (into []
        (comp cat
              (m/distinct-by (fn [clause]
                               (-> clause
                                   ;; remove namespaced options and other things that are definitely irrelevant
                                   add/normalize-clause
                                   ;; we shouldn't consider different type info to mean two Fields are different even if
                                   ;; everything else is the same. So give everything `:base-type` of `:type/*` (it will
                                   ;; complain if we remove `:base-type` entirely from fields with a string name)
                                   (mbql.u/update-field-options (fn [opts]
                                                                  (-> opts
                                                                      (assoc :base-type :type/*)
                                                                      (dissoc :effective-type))))))))
        [fields join-fields]))

(defn append-join-fields-to-fields
  "Add the fields from join `:fields`, if any, to the parent-level `:fields`."
  [inner-query join-fields]
  (cond-> inner-query
    (seq join-fields) (update :fields append-join-fields join-fields)))

(mu/defn ^:private merge-joins-fields :- UnresolvedMBQLQuery
  "Append the `:fields` from `:joins` into their parent level as appropriate so joined columns appear in the final
  query results, and remove the `:fields` entry for all joins.

  If the parent-level query has breakouts and/or aggregations, this function won't append the joins fields to the
  parent level, because we should only be returning the ones from the ags and breakouts in the final results."
  [{:keys [joins], :as inner-query} :- UnresolvedMBQLQuery]
  (let [join-fields (when (should-add-join-fields? inner-query)
                      (joins->fields joins))
        ;; remove remaining keyword `:fields` like `:none` from joins
        inner-query (update inner-query :joins (fn [joins]
                                                 (mapv (fn [{:keys [fields], :as join}]
                                                         (cond-> join
                                                           (keyword? fields) (dissoc :fields)))
                                                       joins)))]
    (append-join-fields-to-fields inner-query join-fields)))

(mu/defn ^:private resolve-joins-in-mbql-query :- ResolvedMBQLQuery
  [query :- mbql.s/MBQLQuery]
  (-> query
      (update :joins (comp resolve-join-source-queries resolve-references))
      merge-joins-fields))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                Middleware & Boring Recursive Application Stuff                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- resolve-joins-in-mbql-query-all-levels
  [{:keys [joins source-query], :as query}]
  (cond-> query
    (seq joins)  resolve-joins-in-mbql-query
    source-query (update :source-query resolve-joins-in-mbql-query-all-levels)))

(defn resolve-joins
  "Add any Tables and Fields referenced by the `:joins` clause to the QP store."
  [{inner-query :query, :as outer-query}]
  (cond-> outer-query
    inner-query (update :query resolve-joins-in-mbql-query-all-levels)))
