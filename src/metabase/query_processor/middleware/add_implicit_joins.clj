(ns metabase.query-processor.middleware.add-implicit-joins
  "Middleware that creates corresponding `:joins` for Tables referred to by `:fk->` clauses and replaces those clauses
  with `:joined-field` clauses."
  (:require [metabase
             [db :as mdb]
             [driver :as driver]]
            [metabase.mbql
             [schema :as mbql.s]
             [util :as mbql.u]]
            [metabase.models
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.query-processor.store :as qp.store]
            [metabase.util
             [i18n :refer [tru]]
             [schema :as su]]
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
  {:fk-id    su/IntGreaterThanZero
   :pk-id    su/IntGreaterThanZero
   :table-id su/IntGreaterThanZero})

(s/defn ^:private fk-clauses->pk-info :- [PKInfo]
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


;;; ---------------------------------------- Resolving Join Alias & Condition ----------------------------------------

(def ^:private ResolvedJoinInfo
  {:fk-clause    FKClauseWithFieldIDArgs
   :source-table su/IntGreaterThanZero
   :alias        su/NonBlankString
   :fk-field-id  su/IntGreaterThanZero
   :pk-field-id  su/IntGreaterThanZero})

(s/defn ^:private resolve-one-join-info :- ResolvedJoinInfo
  [[_ [_ source-id] [_ dest-id] :as fk-clause] :- FKClauseWithFieldIDArgs, pk-info :- [PKInfo]]
  (let [source-field (qp.store/field source-id)
        dest-field   (qp.store/field dest-id)
        table-id     (:table_id dest-field)
        table        (qp.store/table table-id)
        pk-id        (some (fn [info]
                             (when (and (= (:table-id info) table-id)
                                        (= (:fk-id info) source-id))
                               (:pk-id info)))
                           pk-info)
        ;; some DBs like Oracle limit the length of identifiers to 30 characters so only take the first 30 here
        alias        (apply str (take 30 (str (:name table) "__via__" (:name source-field))))]
    {:fk-clause    fk-clause
     :source-table table-id
     :alias        alias
     :fk-field-id  source-id
     :pk-field-id  pk-id}))

(s/defn ^:private resolve-join-info :- [ResolvedJoinInfo]
  [fk-clauses :- [FKClauseWithFieldIDArgs], pk-info :- [PKInfo]]
  (distinct
   (for [clause (distinct fk-clauses)]
     (resolve-one-join-info clause pk-info))))


;;; ------------------------------------------- Adding :joins to the query -------------------------------------------

(s/defn ^:private resolved-join-info->join-clause :- mbql.s/Join
  [{:keys [source-table alias fk-field-id pk-field-id]} :- ResolvedJoinInfo]
  {:source-table source-table
   :alias        alias
   :strategy     :left-join
   :condition    [:= [:field-id fk-field-id] [:joined-field alias [:field-id pk-field-id]]]

   :fk-field-id fk-field-id
   :fields      :none})

(s/defn ^:private add-implicit-join-clauses :- mbql.s/Query
  [query, resolved-join-infos :- [ResolvedJoinInfo]]
  (let [join-clauses (map resolved-join-info->join-clause resolved-join-infos)]
    (update-in query [:query :joins] (comp distinct concat) join-clauses)))


;;; --------------------------------------------- Replacing fk-> clauses ---------------------------------------------

(s/defn ^:private matching-resolved-info :- ResolvedJoinInfo
  [query-fk-clause :- mbql.s/fk->, resolved-join-info :- [ResolvedJoinInfo]]
  (or (some
       (fn [{info-fk-clause :fk-clause, :as info}]
         (when (= query-fk-clause info-fk-clause)
           info))
       resolved-join-info)
      (throw (Exception. (str (tru "Did not find match for {0} in resolved info." query-fk-clause))))))

(s/defn ^:private replace-fk-clauses :- mbql.s/Query
  [query, resolved-join-info :- [ResolvedJoinInfo]]
  (mbql.u/replace-in query [:query]
    [:fk-> _ [_ dest-id]] (let [{:keys [alias]} (matching-resolved-info &match resolved-join-info)]
                            [:joined-field alias [:field-id dest-id]])))


;;; -------------------------------------------- PUTTING it all together ---------------------------------------------

(defn- add-implicit-joins-in-top-level-query
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
        (let [resolved-join-info (resolve-join-info fk-clauses pk-info)]
          (-> query
              (add-implicit-join-clauses resolved-join-info)
              (replace-fk-clauses resolved-join-info)))))))

(defn- add-implicit-joins-in-query-all-levels
  "Resolve JOINs at all levels of the query, including the top level and nested queries at any level of nesting."
  [{{source-query :source-query} :query, :as query}]
  ;; first, resolve JOINs for the top-level
  (let [query                          (add-implicit-joins-in-top-level-query query)
        ;; then recursively resolve JOINs for any nested queries by pulling the query up a level and then getting the
        ;; result
        {resolved-source-query :query} (when source-query
                                         (add-implicit-joins-in-query-all-levels (assoc query :query source-query)))]
    ;; finally, merge the resolved source-query into the top-level query as appropriate
    (cond-> query
      resolved-source-query (assoc-in [:query :source-query] resolved-source-query))))

(defn- add-implicit-joins* [{query-type :type, :as query}]
  ;; if this is a native query, or if `driver/*driver*` is bound *and* it DOES NOT support `:foreign-keys`, return
  ;; query as is. Otherwise add implicit joins for `fk->` clauses
  (if (or (= query-type :native)
          (some-> driver/*driver* ((complement driver/supports?) :foreign-keys)))
    query
    (add-implicit-joins-in-query-all-levels query)))

(defn add-implicit-joins
  "Add `:joins` for any Tables referenced by an `fk->` clause. Replace all `fk->` clauses with `joined-field` clauses."
  [qp]
  (comp qp add-implicit-joins*))
