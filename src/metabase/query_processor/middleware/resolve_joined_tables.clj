(ns metabase.query-processor.middleware.resolve-joined-tables
  "Middleware that fetches tables that will need to be joined, referred to by `fk->` clauses, and adds information to
  the query about what joins should be done and how they should be performed."
  (:require [metabase
             [db :as mdb]
             [driver :as driver]]
            [metabase.mbql
             [schema :as mbql.s]
             [util :as mbql.u]]
            [metabase.models
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.query-processor
             [interface :as qp.i]
             [store :as qp.store]]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]))

(defn- both-args-are-field-id-clauses? [[_ x y]]
  (and
   (mbql.u/is-clause? :field-id x)
   (mbql.u/is-clause? :field-id y)))

(def ^:private FKClauseWithFieldIDArgs
  (s/constrained mbql.s/fk-> both-args-are-field-id-clauses? "fk-> clause where both args are field-id clauses"))


;;; ------------------------------------------------ Fetching PK Info ------------------------------------------------

(def ^:private PKInfo
  [{:fk-id     su/IntGreaterThanZero
    :pk-id    su/IntGreaterThanZero
    :table-id su/IntGreaterThanZero}])

(s/defn ^:private fk-clauses->pk-info :- PKInfo
  "Given a `source-table-id` and collection of `fk-field-ids`, return a sequence of maps containing IDs and identifiers
  for those FK fields and their target tables and fields. `fk-field-ids` are IDs of fields that belong to the source
  table. For example, `source-table-id` might be 'checkins' and `fk-field-ids` might have the IDs for 'checkins.user_id'
  and the like."
  [source-table-id :- su/IntGreaterThanZero, fk-clauses :- [FKClauseWithFieldIDArgs]]
  (let [fk-field-ids (set (for [[_ [_ source-id]] fk-clauses]
                            source-id))]
    (when (seq fk-field-ids)
      (db/query {:select    [[:source-fk.id    :fk-id]
                             [:target-pk.id    :pk-id]
                             [:target-table.id :table-id]]
                 :from      [[Field :source-fk]]
                 :left-join [[Field :target-pk]    [:= :source-fk.fk_target_field_id :target-pk.id]
                             [Table :target-table] [:= :target-pk.table_id :target-table.id]]
                 :where     [:and
                             [:in :source-fk.id (set fk-field-ids)]
                             [:=  :source-fk.table_id source-table-id]
                             (mdb/isa :source-fk.special_type :type/FK)]}))))


;;; -------------------------------- Fetching join Tables & adding them to the Store  --------------------------------

(s/defn ^:private fks->dest-table-ids :- #{su/IntGreaterThanZero}
  [fk-clauses :- [FKClauseWithFieldIDArgs]]
  (set (for [[_ _ [_ dest-id]] fk-clauses]
         (:table_id (qp.store/field dest-id)))))

(s/defn ^:private store-join-tables! [fk-clauses :- [FKClauseWithFieldIDArgs]]
  (let [table-ids-to-fetch (fks->dest-table-ids fk-clauses)]
    (when (seq table-ids-to-fetch)
      (doseq [table (db/select (vec (cons Table qp.store/table-columns-to-fetch)), :id [:in table-ids-to-fetch])]
        (qp.store/store-table! table)))))


;;; ------------------------------------ Adding join Table PK fields to the Store ------------------------------------

(s/defn ^:private store-join-table-pk-fields!
  [pk-info :- PKInfo]
  (let [pk-field-ids (set (map :pk-id pk-info))
        pk-fields    (when (seq pk-field-ids)
                       (db/select (vec (cons Field qp.store/field-columns-to-fetch)) :id [:in pk-field-ids]))]
    (doseq [field pk-fields]
      (qp.store/store-field! field))))


;;; -------------------------------------- Adding :join-tables key to the query --------------------------------------

(s/defn fks->join-information :- [mbql.s/JoinTableInfo]
  [fk-clauses :- [FKClauseWithFieldIDArgs], pk-info :- PKInfo]
  (distinct
   (for [[_ [_ source-id] [_ dest-id]] fk-clauses
         :let [source-field (qp.store/field source-id)
               dest-field   (qp.store/field dest-id)
               table-id     (:table_id dest-field)
               table        (qp.store/table table-id)
               pk-id        (some (fn [info]
                                    (when (and (= (:table-id info) table-id)
                                               (= (:fk-id info) source-id))
                                      (:pk-id info)))
                                  pk-info)]]
     ;; some DBs like Oracle limit the length of identifiers to 30 characters so only take
     ;; the first 30 here
     {:join-alias  (apply str (take 30 (str (:name table) "__via__" (:name source-field))))
      :table-id    table-id
      :fk-field-id source-id
      :pk-field-id pk-id})))

(s/defn ^:private add-join-info-to-query :- mbql.s/Query
  [query fk-clauses pk-info]
  (assoc-in query [:query :join-tables] (fks->join-information fk-clauses pk-info)))


;;; -------------------------------------------- PUTTING it all together ---------------------------------------------

(defn- resolve-joined-tables-in-top-level-query
  "Resolve JOINs at the top-level of the query."
  [{mbql-query :query, :as query}]
  ;; find fk-> clauses in the query AT THE TOP LEVEL
  (let [fk-clauses      (mbql.u/match (dissoc mbql-query :source-query) [:fk-> [:field-id _] [:field-id _]])
        source-table-id (mbql.u/query->source-table-id query)]
    ;; if there are none, or `source-table` isn't resolved for some reason or another (which we need in order to fetch
    ;; FK info), return query as-is
    (if-not (and (seq fk-clauses) source-table-id)
      query
      ;; otherwise fetch PK info, add relevant Tables & Fields to QP store, and add the `:join-tables` key to the query
      (let [pk-info (fk-clauses->pk-info source-table-id fk-clauses)]
        (store-join-tables! fk-clauses)
        (store-join-table-pk-fields! pk-info)
        (add-join-info-to-query query fk-clauses pk-info)))))

(defn- resolve-joined-tables-in-query-all-levels
  "Resolve JOINs at all levels of the query, including the top level and nested queries at any level of nesting."
  [{{source-query :source-query} :query, :as query}]
  ;; first, resolve JOINs for the top-level
  (let [query                          (resolve-joined-tables-in-top-level-query query)
        ;; then recursively resolve JOINs for any nested queries by pulling the query up a level and then getting the
        ;; result
        {resolved-source-query :query} (when source-query
                                         (resolve-joined-tables-in-query-all-levels (assoc query :query source-query)))]
    ;; finally, merge the resolved source-query into the top-level query as appropriate
    (cond-> query
      resolved-source-query (assoc-in [:query :source-query] resolved-source-query))))

(defn- resolve-joined-tables* [{query-type :type, :as query}]
  (if (or (= query-type :native)
          (and qp.i/*driver*
               (not (driver/driver-supports? qp.i/*driver* :foreign-keys))))
    query
    (resolve-joined-tables-in-query-all-levels query)))

(defn resolve-joined-tables
  "Fetch and store any Tables other than the source Table referred to by `fk->` clauses in an MBQL query, and add a
  `:join-tables` key inside the MBQL inner query dictionary containing information about the `JOIN`s (or equivalent)
  that need to be performed for these tables."
  [qp]
  (comp qp resolve-joined-tables*))
