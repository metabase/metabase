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
            [metabase.query-processor.store :as qp.store]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]
            [metabase.util :as u]))

(s/defn ^:private all-joins :- (s/maybe mbql.s/Joins)
  [{{:keys [joins source-query]} :query, :as query} :- su/Map]
  (seq
   (concat
    joins
    (when source-query
      (all-joins (assoc query :query source-query))))))

(s/defn ^:private resolve-joined-tables
  [joins :- mbql.s/Joins]
  (when-let [source-table-ids (seq (filter some? (map :source-table joins)))]
    (doseq [table (db/select (into [Table] qp.store/table-columns-to-fetch), :id [:in source-table-ids])]
      (qp.store/store-table! table))))

(s/defn ^:private resolve-join-fields
  [joins :- mbql.s/Joins]
  (when-let [field-ids (mbql.u/match joins [:field-id id] id)]
    (doseq [field (db/select (into [Field] qp.store/field-columns-to-fetch) :id [:in field-ids])]
      (qp.store/store-field! field))))

(s/defn ^:private resolve-joined-tables-and-fields :- (s/maybe s/Bool)
  "Add referenced Tables and Fields to the QP store. Returns `true` if the query has joins."
  [query :- su/Map]
  (when-let [joins (seq (all-joins query))]
    (resolve-joined-tables joins)
    (resolve-join-fields joins)
    true))

(s/defn ^:private deduplicate-aliases :- mbql.s/Joins
  [joins :- [mbql.s/Join]]
  (let [unique-aliases (mbql.u/uniquify-names (map :alias joins))]
    (map
     (fn [join alias]
       (assoc join :alias alias))
     joins
     unique-aliases)))

(s/defn ^:private merge-defaults :- mbql.s/Joins
  [joins :- mbql.s/Joins]
  (for [{:keys [source-table], :as join} joins]
    (merge
     {:strategy :left-join
      :fields   :none
      :alias    (if source-table
                  (:name (qp.store/table source-table))
                  "source")}
     join)))

(s/defn ^:private merge-join-defaults :- mbql.s/Query
  [{{:keys [joins source-query]} :query, :as query} :- su/Map]
  (cond-> query
    (seq joins)
    (update-in [:query :joins] merge-defaults)

    ;; if we have a `source-query` wrap it in `:query` so we can use this function recursively. Then unwrap it.
    source-query
    (update :source-query (fn [source-query] (-> (assoc query :query source-query) merge-join-defaults :query)))))


(s/defn resolve-joins* :- su/Map
  [query]
  (if (resolve-joined-tables-and-fields query)
    (merge-join-defaults query)
    query))

(defn resolve-joins [qp]
  (fn
    ([query]
     (qp (resolve-joins* query)))

    ([query respond raise canceled-chan]
     (qp (resolve-joins* query) respond raise canceled-chan))))
