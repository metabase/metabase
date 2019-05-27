(ns metabase.query-processor.middleware.resolve-joins
  "Middleware that fetches tables that will need to be joined, referred to by `fk->` clauses, and adds information to
  the query about what joins should be done and how they should be performed."
  (:refer-clojure :exclude [alias])
  (:require [metabase.mbql
             [schema :as mbql.s]
             [util :as mbql.u]]
            [metabase.models
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.query-processor.middleware.add-implicit-clauses :as add-implicit-clauses]
            [metabase.query-processor.store :as qp.store]
            [metabase.util :as u]
            [metabase.util
             [i18n :refer [tru]]
             [schema :as su]]
            [schema.core :as s]
            [toucan.db :as db]))

(def ^:private Joins
  "Schema for a non-empty sequence of Joins. Unlike `mbql.s/Joins`, this does not enforce the constraint that all join
  aliases be unique; that is not guaranteeded until `deduplicate-aliases` transforms the joins."
  (su/non-empty [mbql.s/Join]))

(def ^:private MBQLQuery
  "Schema for the parts of the 'inner' query we're transforming in this middleware that we care about validating (no
  point in validating stuff we're not changing.)"
  {:joins                   (s/constrained mbql.s/Joins vector?)
   (s/optional-key :fields) (s/constrained mbql.s/Fields vector?)
   s/Keyword                s/Any})

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                 Resolving Tables & Fields / Saving in QP Store                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(s/defn ^:private resolve-fields! :- (s/eq nil)
  [joins :- Joins]
  (when-let [field-ids (->> (mbql.u/match joins [:field-id id] id)
                            (remove qp.store/has-field?)
                            seq)]
    (doseq [field (db/select (into [Field] qp.store/field-columns-to-fetch) :id [:in field-ids])]
      (qp.store/store-field! field))))

(s/defn ^:private resolve-tables! :- (s/eq nil)
  [joins :- Joins]
  (when-let [source-table-ids (->> (map :source-table joins)
                                   (filter some?)
                                   (remove qp.store/has-table?)
                                   seq)]
    (let [resolved-tables (db/select (into [Table] qp.store/table-columns-to-fetch)
                            :id    [:in source-table-ids]
                            :db_id (u/get-id (qp.store/database)))
          resolved-ids (set (map :id resolved-tables))]
      ;; make sure all IDs were resolved, otherwise someone is probably trying to Join a table that doesn't exist
      (doseq [id source-table-ids
              :when (not (resolved-ids id))]
        (throw
         (IllegalArgumentException.
          (str (tru "Could not find Table {0} in Database {1}." id (u/get-id (qp.store/database)))))))
      ;; cool, now store the Tables in the DB
      (doseq [table resolved-tables]
        (qp.store/store-table! table)))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             :joins Transformations                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(s/defn ^:private deduplicate-aliases :- mbql.s/Joins
  [joins :- Joins]
  (let [joins          (for [join joins]
                         (update join :alias #(or % "source")))
        unique-aliases (mbql.u/uniquify-names (map :alias joins))]
    (mapv
     (fn [join alias]
       (assoc join :alias alias))
     joins
     unique-aliases)))

(s/defn ^:private merge-defaults :- mbql.s/Join
  [join]
  (merge {:strategy :left-join} join))

(s/defn ^:private handle-all-fields :- mbql.s/Join
  [{:keys [source-table alias fields], :as join} :- mbql.s/Join]
  (merge
   join
   (if (= fields :all)
     (if source-table
       {:fields (for [field (add-implicit-clauses/sorted-implicit-fields-for-table source-table)]
                  [:joined-field alias field])}
       (throw
        (UnsupportedOperationException.
         "TODO - fields = all is not yet implemented for joins with source queries."))))))


(s/defn ^:private resolve-references-and-deduplicate :- mbql.s/Joins
  [joins :- Joins]
  (resolve-tables! joins)
  (let [joins (->> joins
                   deduplicate-aliases
                   (map merge-defaults)
                   (mapv handle-all-fields))]
    (resolve-fields! joins)
    joins))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           MBQL-Query Transformations                                           |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- joins->fields [joins]
  (for [{:keys [fields]} joins
        :when            (sequential? fields)
        field            fields]
    field))

(defn- remove-joins-fields [joins]
  (vec (for [join joins]
         (dissoc join :fields))))

(s/defn ^:private merge-joins-fields :- MBQLQuery
  [{:keys [joins], :as query} :- MBQLQuery]
  (let [join-fields (joins->fields joins)
        query       (update query :joins remove-joins-fields)]
    (cond-> query
      (seq join-fields) (update :fields (comp vec distinct concat) join-fields))))

(defn- check-join-aliases [{:keys [joins], :as query}]
  (let [aliases (set (map :alias joins))]
    (doseq [alias (mbql.u/match query [:joined-field alias _] alias)]
      (when-not (aliases alias)
        (throw
         (IllegalArgumentException.
          (str (tru "Bad :joined-field clause: join with alias ''{0}'' does not exist. Found: {1}"
                    alias aliases))))))))

(s/defn ^:private resolve-joins-in-mbql-query :- MBQLQuery
  [{:keys [joins], :as query} :- MBQLQuery]
  (u/prog1 (-> query
               (update :joins resolve-references-and-deduplicate)
               merge-joins-fields)
    (check-join-aliases <>)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                Middleware & Boring Recursive Application Stuff                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- resolve-joins-in-mbql-query-all-levels
  [{:keys [joins source-query], :as query}]
  (cond-> query
    (seq joins)
    resolve-joins-in-mbql-query

    source-query
    (update :source-query resolve-joins-in-mbql-query-all-levels)))

(defn- resolve-joins* [{inner-query :query, :as outer-query}]
  (cond-> outer-query
    inner-query (update :query resolve-joins-in-mbql-query-all-levels)))

(defn resolve-joins
  "Add any Tables and Fields referenced by the `:joins` clause to the QP store."
  [qp]
  (fn
    ([query]
     (qp (resolve-joins* query)))

    ([query respond raise canceled-chan]
     (qp (resolve-joins* query) respond raise canceled-chan))))
