(ns metabase.query-processor.middleware.add-implicit-joins
  "Middleware that creates corresponding `:joins` for Tables referred to by `:fk->` clauses and replaces those clauses
  with `:joined-field` clauses."
  (:refer-clojure :exclude [alias])
  (:require [metabase
             [db :as mdb]
             [driver :as driver]
             [util :as u]]
            [metabase.mbql
             [schema :as mbql.s]
             [util :as mbql.u]]
            [metabase.models
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.query-processor
             [error-type :as error-type]
             [store :as qp.store]]
            [metabase.util
             [i18n :refer [tru]]
             [schema :as su]]
            [schema.core :as s]
            [toucan.db :as db]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Resolving Join Info                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private JoinInfo
  {:fk-id      su/IntGreaterThanZero
   :fk-name    su/NonBlankString
   :pk-id      su/IntGreaterThanZero
   :table-id   su/IntGreaterThanZero
   :table-name su/NonBlankString
   :alias      su/NonBlankString})

(defn- join-alias [dest-table-name source-fk-field-name]
  (apply str (take 30 (str dest-table-name "__via__" source-fk-field-name))))

(s/defn ^:private fk-ids->join-infos :- (s/maybe [JoinInfo])
  "Given `fk-field-ids`, return a sequence of maps containing IDs and and other info needed to generate corresponding
  `joined-field` and `:joins` clauses."
  [fk-field-ids]
  (when (seq fk-field-ids)
    (let [infos (db/query {:select    [[:source-fk.id    :fk-id]
                                       [:source-fk.name  :fk-name]
                                       [:target-pk.id    :pk-id]
                                       [:target-table.id :table-id]
                                       [:target-table.name :table-name]]
                           :from      [[Field :source-fk]]
                           :left-join [[Field :target-pk]    [:= :source-fk.fk_target_field_id :target-pk.id]
                                       [Table :target-table] [:= :target-pk.table_id :target-table.id]]
                           :where     [:and
                                       [:in :source-fk.id (set fk-field-ids)]
                                       [:= :target-table.db_id (u/get-id (qp.store/database))]
                                       (mdb/isa :source-fk.special_type :type/FK)]})]
      (for [{:keys [fk-name table-name], :as info} infos]
        (assoc info :alias (join-alias table-name fk-name))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         Building the matching-info fn                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- query->fk-clause-ids [query]
  (let [ids (mbql.u/match query
              [:fk-> fk dest]
              [(mbql.u/field-clause->id-or-literal fk) (mbql.u/field-clause->id-or-literal dest)])]
    {:fk-ids   (filter integer? (map first  ids))
     :dest-ids (filter integer? (map second ids))}))

(defn- dest-ids->dest-id->table-id
  "Given a sequence of `dest-ids` (the IDs of Destination Fields in `fk->` clauses), return a map of `dest-id` -> its
  `table-id`."
  [dest-ids]
  (when (seq dest-ids)
    (let [results     (db/query {:select    [[:field.id :id] [:field.table_id :table]]
                                 :from      [[Field :field]]
                                 :left-join [[Table :table] [:= :field.table_id :table.id]]
                                 :where     [:and
                                             [:in :field.id (set dest-ids)]
                                             [:= :table.db_id (u/get-id (qp.store/database))]]})
          dest->table (zipmap (map :id results) (map :table results))]
      ;; validate that all our Fields are in the map
      (doseq [dest-id dest-ids]
        (when-not (get dest->table dest-id)
          (throw
            (ex-info (tru "Cannot resolve {0}: Field does not exist, or its Table belongs to a different Database."
                          [:fk '_ dest-id])
             {:dest-id dest-id}))))
      ;; ok, we're good to go
      dest->table)))

(defn- fields->ids [dest-id->table-id fk-field dest-field]
  (let [fk-id         (mbql.u/field-clause->id-or-literal fk-field)
        dest-id       (mbql.u/field-clause->id-or-literal dest-field)
        dest-table-id (dest-id->table-id dest-id)]
    (assert (and (integer? fk-id) (integer? dest-id))
      (tru "Cannot resolve :field-literal inside :fk-> unless inside join with explicit :alias."))
    (assert dest-table-id
      (tru "Cannot find Table ID for {0}" dest-field))
    {:fk-id fk-id, :dest-id dest-id, :dest-table-id dest-table-id}))

(defn- matching-info* [infos dest-id->table-id fk-field dest-field]
  (let [{:keys [fk-id dest-id dest-table-id]} (fields->ids dest-id->table-id fk-field dest-field)]
    (or
     (some
      (fn [{an-fk-id :fk-id, a-table-id :table-id, :as info}]
        (when (and (= fk-id an-fk-id)
                   (= dest-table-id a-table-id))
          info))
      infos)
     (throw
      (ex-info (tru "No matching info found for join against Table {0} ''{1}'' on Field {2} ''{3}'' via FK {4} ''{5}''"
                    dest-table-id (or (u/ignore-exceptions (:name (qp.store/table dest-table-id))) "?")
                    dest-id (or (u/ignore-exceptions (:name (qp.store/field dest-id))) "?")
                    fk-id (or (u/ignore-exceptions (:name (qp.store/field fk-id))) "?"))
        {:fk-id fk-id, :dest-id dest-id, :dest-table-id dest-table-id})))))

(defn- matching-info-fn
  "Given a `query`, return a function that takes the `fk-field` and `dest-field` from an `fk->` clause and returns the
  corresponding `JoinInfo` for the clause, if any."
  [query]
  (let [{:keys [fk-ids dest-ids]} (query->fk-clause-ids query)
        infos                     (fk-ids->join-infos fk-ids)
        dest-id->table-id         (dest-ids->dest-id->table-id dest-ids)
        matching-info             (partial matching-info* infos dest-id->table-id)]
    (fn [fk-field dest-field]
      (try
        (matching-info fk-field dest-field)
        ;; add a bunch of info to any Exceptions that get thrown here, useful for debugging things that go wrong
        (catch Exception e
          (throw
           (ex-info (tru "Could not resolve {0}" [:fk-> fk-field dest-field])
             {:clause                           [:fk-> fk-field dest-field]
              :resolved-info                    infos
              :resolved-dest-field-id->table-id dest-id->table-id}
             e)))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         Converting fk-> :joined-field                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(s/defn ^:private resolve-fk :- mbql.s/joined-field
  "Resolve a single `fk->` clause, returning a `:joined-field` clause to replace it, and adding a new join entry if
  appropriate."
  [{:keys [matching-info current-alias add-join!]} [_ source-field dest-field, :as fk-clause]]
  (if current-alias
    [:joined-field current-alias dest-field]
    (let [{:keys [alias], :as info} (matching-info source-field dest-field)]
      (add-join! info)
      [:joined-field alias dest-field])))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               Generating :joins                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(s/defn ^:private add-joins :- mbql.s/MBQLQuery
  "Add `:joins` to a `query` by converting `join-infos` to the appropriate format."
  [query, join-infos :- [JoinInfo]]
  (let [joins (distinct
               (for [{:keys [fk-id pk-id table-id alias]} join-infos]
                 {:source-table table-id
                  :alias        alias
                  :fields       :none
                  :strategy     :left-join
                  :fk-field-id  fk-id
                  :condition    [:= [:field-id fk-id] [:joined-field alias [:field-id pk-id]]]}))]
    (cond-> query
      (seq joins) (update :joins #(mbql.u/deduplicate-join-aliases (concat % joins))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          Transforming the whole query                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- can-add-joins-here? [m]
  (and (map? m)
       ((some-fn :source-table :source-query) m)
       (not (:condition m))))

(defn- join? [m]
  (and (map? m)
       (every? m [:condition :alias])))

(defn- default-context [query]
  {:matching-info (matching-info-fn query)
   :current-alias nil
   :add-join!     (fn [join-info]
                    (throw (ex-info (tru "Invalid fk-> clause: nowhere to add corresponding join.")
                             {:join-info join-info})))})

(declare resolve-fk-clauses)

(defn- recursive-resolve [form context]
  (-> (assoc form ::recursive? true)
      (resolve-fk-clauses context)
      (dissoc form ::recursive?)))

(s/defn ^:private resolve-fk-clauses
  "Resolve all `fk->` clauses in `query`. The basic idea is to recurse thru the query the usual way, using
  `mbql.u/replace`, keeping a little bit of state"
  ([query :- mbql.s/MBQLQuery]
   (resolve-fk-clauses query (default-context query)))

  ([form context]
   (mbql.u/replace form
     (query :guard (every-pred can-add-joins-here? (complement ::recursive?)))
     (let [joins     (atom [])
           add-join! (partial swap! joins conj)]
       (-> (recursive-resolve query (assoc context :add-join! add-join!))
           (add-joins @joins)))

     ;; join with an alias
     (join-clause :guard (every-pred join? (complement ::recursive?)))
     (recursive-resolve join-clause (assoc context :current-alias (:alias join-clause)))

     :fk->
     (resolve-fk context &match))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   Middleware                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- add-implicit-joins* [query]
  (if (mbql.u/match-one (:query query) :fk->)
    (do
      (when-not (driver/supports? driver/*driver* :foreign-keys)
        (throw (ex-info (tru "{0} driver does not support foreign keys." driver/*driver*)
                 {:driver driver/*driver*
                  :type   error-type/unsupported-feature})))
      (update query :query resolve-fk-clauses))
    query))

(defn add-implicit-joins
  "Fetch and store any Tables other than the source Table referred to by `fk->` clauses in an MBQL query, and add a
  `:join-tables` key inside the MBQL inner query containing information about the `JOIN`s (or equivalent) that need to
  be performed for these tables.

  This middleware also replaces all `fk->` clauses with `joined-field` clauses, which are easier to work with."
  [qp]
  (fn [query rff context]
    (qp (add-implicit-joins* query) rff context)))
