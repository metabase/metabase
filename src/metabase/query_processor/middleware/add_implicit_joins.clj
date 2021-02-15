(ns metabase.query-processor.middleware.add-implicit-joins
  "Middleware that creates corresponding `:joins` for Tables referred to by `:fk->` clauses and replaces those clauses
  with `:joined-field` clauses."
  (:refer-clojure :exclude [alias])
  (:require [clojure.set :as set]
            [medley.core :as m]
            [metabase.db.util :as mdb.u]
            [metabase.driver :as driver]
            [metabase.mbql.util :as mbql.u]
            [metabase.models.field :refer [Field]]
            [metabase.models.table :refer [Table]]
            [metabase.query-processor.error-type :as error-type]
            [metabase.query-processor.middleware.add-implicit-clauses :as add-implicit-clauses]
            [metabase.query-processor.store :as qp.store]
            [metabase.util :as u]
            [metabase.util.i18n :refer [tru]]
            [toucan.db :as db]))

(defn- fk-references [x]
  (set (mbql.u/match x :fk-> &match)))

(defn- join-alias [dest-table-name source-fk-field-name]
  (apply str (take 30 (str dest-table-name "__via__" source-fk-field-name))))

(defn- fk-ids->join-infos
  "Given `fk-field-ids`, return a sequence of maps containing IDs and and other info needed to generate corresponding
  `joined-field` and `:joins` clauses."
  [fk-field-ids]
  (when (seq fk-field-ids)
    (let [infos (db/query {:select    [[:source-fk.id    :fk-field-id]
                                       [:source-fk.name  :fk-name]
                                       [:target-pk.id    :pk-id]
                                       [:target-table.id :source-table]
                                       [:target-table.name :table-name]]
                           :from      [[Field :source-fk]]
                           :left-join [[Field :target-pk]    [:= :source-fk.fk_target_field_id :target-pk.id]
                                       [Table :target-table] [:= :target-pk.table_id :target-table.id]]
                           :where     [:and
                                       [:in :source-fk.id (set fk-field-ids)]
                                       [:= :target-table.db_id (u/the-id (qp.store/database))]
                                       (mdb.u/isa :source-fk.semantic_type :type/FK)]})]
      (for [{:keys [pk-id fk-name table-name fk-field-id], :as info} infos]
        (let [join-alias (join-alias table-name fk-name)]
          (-> info
              (assoc :alias join-alias
                     :fields :none
                     :strategy :left-join
                     :condition [:= [:field-id fk-field-id] [:joined-field join-alias [:field-id pk-id]]])
              (dissoc :fk-name :table-name :pk-id)
              (vary-meta assoc ::needs [:field-id fk-field-id])))))))

(defn- fk-references->joins
  "Create implicit join maps for a set of `fk->clauses`."
  [fk->clauses]
  (distinct
   (let [fk-field-ids (set (for [clause fk->clauses]
                             (mbql.u/match-one clause [:field-id id] id)))]
     (fk-ids->join-infos fk-field-ids))))

(defn- visible-joins
  "Set of all joins that are visible in the current level of the query or in a nested source query."
  [{:keys [source-query joins]}]
  (distinct
   (into joins
         (when source-query
           (visible-joins source-query)))))

(defn- replace-fk-forms
  "Replace `:fk->` forms in `form` with `:joined-field` forms using the corresponding join."
  [form]
  (let [fk-field-id->join-alias (reduce
                                 (fn [m {:keys [fk-field-id], join-alias :alias}]
                                   (if (or (not fk-field-id)
                                           (get m fk-field-id))
                                     m
                                     (assoc m fk-field-id join-alias)))
                                 {}
                                 (visible-joins form))]
    (cond-> (mbql.u/replace form
              [:fk-> [:field-id fk-field-id] dest-field]
              (let [join-alias (or (fk-field-id->join-alias fk-field-id)
                                   (throw (ex-info (tru "Cannot find Table ID for Field {0}" fk-field-id)
                                                   {:resolving  &match
                                                    :candidates fk-field-id->join-alias})))]
                [:joined-field (fk-field-id->join-alias fk-field-id) dest-field]))
      (sequential? (:fields form)) (update :fields distinct))))

(defn- already-has-join? [{:keys [joins source-query]} {join-alias :alias, :as join}]
  (or (some #(= (:alias %) join-alias)
            joins)
      (when source-query
        (recur source-query join))))

(defn- add-condition-fields-to-source
  "Add any fields that are needed for newly-added join conditions to source query `:fields` if they're not already
  present."
  [{{source-query-fields :fields} :source-query, :keys [joins], :as form}]
  (if (empty? source-query-fields)
    form
    (let [needed (set (filter some? (map (comp ::needs meta) joins)))]
      (update-in form [:source-query :fields] (fn [existing-fields]
                                                (distinct
                                                 (concat existing-fields needed)))))))

(defn- add-referenced-fields-to-source [form reused-joins]
  (let [reused-join-alias? (set (map :alias reused-joins))
        referenced-fields  (set (mbql.u/match (dissoc form :source-query :joins)
                                  [:joined-field (_ :guard reused-join-alias?) _]
                                  &match))]
    (update-in form [:source-query :fields] (fn [existing-fields]
                                              (distinct
                                               (concat existing-fields referenced-fields))))))

(defn- add-fields-to-source
  [{{source-query-fields :fields, :as source-query} :source-query, :as form} reused-joins]
  (cond
    (not source-query)
    form

    (:native source-query)
    form

    (seq ((some-fn :aggregation :breakout) source-query))
    form

    :else
    (let [form (cond-> form
                 (empty? source-query-fields) (update :source-query add-implicit-clauses/add-implicit-mbql-clauses))]
      (if (empty? (get-in form [:source-query :fields]))
        form
        (-> form
            add-condition-fields-to-source
            (add-referenced-fields-to-source reused-joins))))))

(defn- resolve-implicit-joins-this-level
  "Add new `:joins` for tables referenced by `:fk->` forms. Replace `fk->` forms with `:joined-field` forms. Add
  additional `:fields` to source query if needed to perform the join."
  [form]
  (let [fk-references  (fk-references form)
        new-joins      (fk-references->joins fk-references)
        required-joins (remove (partial already-has-join? form) new-joins)
        reused-joins   (set/difference (set new-joins) (set required-joins))]
    (cond-> form
      (seq required-joins) (update :joins (fn [existing-joins]
                                            (m/distinct-by
                                             :alias
                                             (concat existing-joins required-joins))))
      true                 replace-fk-forms
      ;; true            add-condition-fields-to-source
      true                 (add-fields-to-source reused-joins))))

(defn- resolve-implicit-joins [{:keys [source-query joins], :as inner-query}]
  (let [recursively-resolved (cond-> inner-query
                               source-query (update :source-query resolve-implicit-joins)
                               (seq joins)  (update :joins (partial map resolve-implicit-joins)))]
    (resolve-implicit-joins-this-level recursively-resolved)))


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
      (update query :query resolve-implicit-joins))
    query))

(defn add-implicit-joins
  "Fetch and store any Tables other than the source Table referred to by `fk->` clauses in an MBQL query, and add a
  `:join-tables` key inside the MBQL inner query containing information about the `JOIN`s (or equivalent) that need to
  be performed for these tables.

  This middleware also replaces all `fk->` clauses with `joined-field` clauses, which are easier to work with."
  [qp]
  (fn [query rff context]
    (qp (add-implicit-joins* query) rff context)))
