(ns metabase.query-processor.middleware.add-implicit-joins
  "Middleware that creates corresponding `:joins` for Tables referred to by `:field` clauses with `:source-field` info
  in the options and adds `:join-alias` info to those `:field` clauses."
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

(defn- implicitly-joined-fields [x]
  (set (mbql.u/match x [:field _ (_ :guard (every-pred :source-field (complement :join-alias)))] &match)))

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
                     :condition [:= [:field fk-field-id nil] [:field pk-id {:join-alias join-alias}]])
              (dissoc :fk-name :table-name :pk-id)
              (vary-meta assoc ::needs [:field fk-field-id nil])))))))

(defn- implicitly-joined-fields->joins
  "Create implicit join maps for a set of `field-clauses-with-source-field`."
  [field-clauses-with-source-field]
  (distinct
   (let [fk-field-ids (->> field-clauses-with-source-field
                           (map (fn [clause]
                                  (mbql.u/match-one clause
                                    [:field (id :guard integer?) (opts :guard (every-pred :source-field (complement :join-alias)))]
                                    (:source-field opts))))
                           (filter integer?)
                           set
                           not-empty)]
     (fk-ids->join-infos fk-field-ids))))

(defn- visible-joins
  "Set of all joins that are visible in the current level of the query or in a nested source query."
  [{:keys [source-query joins]}]
  (distinct
   (into joins
         (when source-query
           (visible-joins source-query)))))

(defn- add-join-alias-to-fields-with-source-field
  "Add `:field` `:join-alias` to `:field` clauses with `:source-field` in `form`."
  [form]
  ;; Build a map of FK Field ID -> alias used for IMPLICIT joins. Only implicit joins have `:fk-field-id`
  (let [fk-field-id->join-alias (reduce
                                 (fn [m {:keys [fk-field-id], join-alias :alias}]
                                   (if (or (not fk-field-id)
                                           (get m fk-field-id))
                                     m
                                     (assoc m fk-field-id join-alias)))
                                 {}
                                 (visible-joins form))]
    (cond-> (mbql.u/replace form
              [:field id-or-name (opts :guard (every-pred :source-field (complement :join-alias)))]
              (let [join-alias (or (fk-field-id->join-alias (:source-field opts))
                                   (throw (ex-info (tru "Cannot find matching FK Table ID for FK Field {0}"
                                                        (fk-field-id->join-alias (:source-field opts)))
                                                   {:resolving  &match
                                                    :candidates fk-field-id->join-alias})))]
                [:field id-or-name (assoc opts :join-alias join-alias)]))
      (sequential? (:fields form)) (update :fields distinct))))

(defn- already-has-join?
  "Whether the current query level already has a join with the same alias."
  [{:keys [joins source-query]} {join-alias :alias, :as join}]
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
                                                (distinct (concat existing-fields needed)))))))

(defn- add-referenced-fields-to-source [form reused-joins]
  (let [reused-join-alias? (set (map :alias reused-joins))
        referenced-fields  (set (mbql.u/match (dissoc form :source-query :joins)
                                  [:field _ (_ :guard (fn [{:keys [join-alias]}]
                                                        (reused-join-alias? join-alias)))]
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
  "Add new `:joins` for tables referenced by `:field` forms with a `:source-field`. Add `:join-alias` info to those
  `:fields`. Add additional `:fields` to source query if needed to perform the join."
  [form]
  (let [implicitly-joined-fields  (implicitly-joined-fields form)
        new-joins      (implicitly-joined-fields->joins implicitly-joined-fields)
        required-joins (remove (partial already-has-join? form) new-joins)
        reused-joins   (set/difference (set new-joins) (set required-joins))]
    (cond-> form
      (seq required-joins) (update :joins (fn [existing-joins]
                                            (m/distinct-by
                                             :alias
                                             (concat existing-joins required-joins))))
      true                 add-join-alias-to-fields-with-source-field
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
  (if (mbql.u/match-one (:query query) [:field _ (_ :guard (every-pred :source-field (complement :join-alias)))])
    (do
      (when-not (driver/supports? driver/*driver* :foreign-keys)
        (throw (ex-info (tru "{0} driver does not support foreign keys." driver/*driver*)
                 {:driver driver/*driver*
                  :type   error-type/unsupported-feature})))
      (update query :query resolve-implicit-joins))
    query))

(defn add-implicit-joins
  "Fetch and store any Tables other than the source Table referred to by `:field` clauses with `:source-field` in an
  MBQL query, and add a `:join-tables` key inside the MBQL inner query containing information about the `JOIN`s (or
  equivalent) that need to be performed for these tables.

  This middleware also adds `:join-alias` info to all `:field` forms with `:source-field`s."
  [qp]
  (fn [query rff context]
    (qp (add-implicit-joins* query) rff context)))
