(ns metabase.query-processor.middleware.add-implicit-joins
  "Middleware that creates corresponding `:joins` for Tables referred to by `:field` clauses with `:source-field` info
  in the options and adds `:join-alias` info to those `:field` clauses."
  (:refer-clojure :exclude [alias])
  (:require
   [clojure.set :as set]
   [clojure.walk :as walk]
   [medley.core :as m]
   [metabase.db.query :as mdb.query]
   [metabase.db.util :as mdb.u]
   [metabase.driver :as driver]
   [metabase.mbql.util :as mbql.u]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.middleware.add-implicit-clauses
    :as qp.add-implicit-clauses]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]))

(defn- implicitly-joined-fields
  "Find fields that come from implicit join in form `x`, presumably a query.
  Fields from metadata are not considered. It is expected, that field which would cause implicit join is in the query
  and not just in it's metadata. Example of query having `:source-field` fields in `:source-metadata` and no use of
  `:source-field` field in corresponding `:source-query` would be the one, that uses remappings. See
  [[metabase.models.params.custom-values-test/with-mbql-card-test]]."
  [x]
  (set (mbql.u/match x [:field _ (_ :guard (every-pred :source-field (complement :join-alias)))]
                     (when-not (some #{:source-metadata} &parents)
                       &match))))

(defn- join-alias [dest-table-name source-fk-field-name]
  (str dest-table-name "__via__" source-fk-field-name))

(defn- fk-ids->join-infos
  "Given `fk-field-ids`, return a sequence of maps containing IDs and and other info needed to generate corresponding
  `joined-field` and `:joins` clauses."
  [fk-field-ids]
  (when (seq fk-field-ids)
    (let [infos (mdb.query/query {:select    [[:source-fk.id    :fk-field-id]
                                              [:source-fk.name  :fk-name]
                                              [:target-pk.id    :pk-id]
                                              [:target-table.id :source-table]
                                              [:target-table.name :table-name]]
                                  :from      [[:metabase_field :source-fk]]
                                  :left-join [[:metabase_field :target-pk]    [:= :source-fk.fk_target_field_id :target-pk.id]
                                              [:metabase_table :target-table] [:= :target-pk.table_id :target-table.id]]
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

(defn- distinct-fields [fields]
  (m/distinct-by mbql.u/remove-namespaced-options fields))

(defn- construct-fk-field-id->join-alias
  [form]
  ;; Build a map of FK Field ID -> alias used for IMPLICIT joins. Only implicit joins have `:fk-field-id`
  (reduce
   (fn [m {:keys [fk-field-id], join-alias :alias}]
     (if (or (not fk-field-id)
             (get m fk-field-id))
       m
       (assoc m fk-field-id join-alias)))
   {}
   (visible-joins form)))

(defn- add-implicit-joins-aliases-to-metadata
  "Add `:join-alias`es to fields containing `:source-field` in `:source-metadata` of `query`.
  It is required, that `:source-query` has already it's joins resolved. It is valid, when no `:join-alias` could be
  found. For examaple during remaps, metadata contain fields with `:source-field`, that are not used further in their
  `:source-query`."
  [{:keys [source-query] :as query}]
  (let [fk-field-id->join-alias (construct-fk-field-id->join-alias source-query)]
    (update query :source-metadata
            #(mbql.u/replace %
               [:field id-or-name (opts :guard (every-pred :source-field (complement :join-alias)))]
               (let [join-alias (fk-field-id->join-alias (:source-field opts))]
                 (if (some? join-alias)
                   [:field id-or-name (assoc opts :join-alias join-alias)]
                   &match))))))

(defn- add-join-alias-to-fields-with-source-field
  "Add `:field` `:join-alias` to `:field` clauses with `:source-field` in `form`. Ignore `:source-metadata`."
  [form]
  (let [fk-field-id->join-alias (construct-fk-field-id->join-alias form)]
    (cond-> (mbql.u/replace form
              [:field id-or-name (opts :guard (every-pred :source-field (complement :join-alias)))]
              (if-not (some #{:source-metadata} &parents)
                (let [join-alias (or (fk-field-id->join-alias (:source-field opts))
                                     (throw (ex-info (tru "Cannot find matching FK Table ID for FK Field {0}"
                                                          (fk-field-id->join-alias (:source-field opts)))
                                                     {:resolving  &match
                                                      :candidates fk-field-id->join-alias})))]
                  [:field id-or-name (assoc opts :join-alias join-alias)])
                &match))
      (sequential? (:fields form)) (update :fields distinct-fields))))

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
                                                (distinct-fields (concat existing-fields needed)))))))

(defn- add-referenced-fields-to-source [form reused-joins]
  (let [reused-join-alias? (set (map :alias reused-joins))
        referenced-fields  (set (mbql.u/match (dissoc form :source-query :joins)
                                  [:field _ (_ :guard (fn [{:keys [join-alias]}]
                                                        (reused-join-alias? join-alias)))]
                                  &match))]
    (update-in form [:source-query :fields] (fn [existing-fields]
                                              (distinct-fields
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
                 (empty? source-query-fields) (update :source-query qp.add-implicit-clauses/add-implicit-mbql-clauses))]
      (if (empty? (get-in form [:source-query :fields]))
        form
        (-> form
            add-condition-fields-to-source
            (add-referenced-fields-to-source reused-joins))))))

(defn- join-dependencies
  "Get a set of join aliases that `join` has an immediate dependency on."
  [join]
  (set
   (mbql.u/match (:condition join)
     [:field _ (opts :guard :join-alias)]
     (let [{:keys [join-alias]} opts]
       (when-not (= join-alias (:alias join))
         join-alias)))))

(defn- topologically-sort-joins
  "Sort `joins` by topological dependency order: joins that are referenced by the `:condition` of another will be sorted
  first. If no dependencies exist between joins, preserve the existing order."
  [joins]
  (let [ ;; make a map of join alias -> immediate dependencies
        join->immediate-deps (into {}
                                   (map (fn [join]
                                          [(:alias join) (join-dependencies join)]))
                                   joins)
        ;; make a map of join alias -> immediate and transient dependencies
        all-deps             (fn all-deps [join-alias]
                               (let [immediate-deps (set (get join->immediate-deps join-alias))]
                                 (into immediate-deps
                                       (mapcat all-deps)
                                       immediate-deps)))
        join->all-deps       (into {}
                                   (map (fn [[join-alias]]
                                          [join-alias (all-deps join-alias)]))
                                   join->immediate-deps)
        ;; now we can create a function to decide if one join depends on another
        depends-on?          (fn [join-1 join-2]
                               (contains? (join->all-deps (:alias join-1))
                                          (:alias join-2)))]
    (->> ;; add a key to each join to record its original position
         (map-indexed (fn [i join]
                        (assoc join ::original-position i)) joins)
         ;; sort the joins by topological order falling back to preserving original position
         (sort (fn [join-1 join-2]
                 (cond
                   (depends-on? join-1 join-2) 1
                   (depends-on? join-2 join-1) -1
                   :else                       (compare (::original-position join-1)
                                                        (::original-position join-2)))))
         ;; remove the keys we used to record original position
         (mapv (fn [join]
                 (dissoc join ::original-position))))))

(defn- resolve-implicit-joins-this-level
  "Add new `:joins` for tables referenced by `:field` forms with a `:source-field`. Add `:join-alias` info to those
  `:fields`. Add additional `:fields` to source query if needed to perform the join."
  [form]
  (let [implicitly-joined-fields (implicitly-joined-fields form)
        new-joins                (implicitly-joined-fields->joins implicitly-joined-fields)
        required-joins           (remove (partial already-has-join? form) new-joins)
        reused-joins             (set/difference (set new-joins) (set required-joins))]
    (cond-> form
      (seq required-joins) (update :joins (fn [existing-joins]
                                            (m/distinct-by
                                             :alias
                                             (concat existing-joins required-joins))))
      true                 add-join-alias-to-fields-with-source-field
      true                 (add-fields-to-source reused-joins)
      (seq required-joins) (update :joins topologically-sort-joins))))

(defn- resolve-implicit-joins [query]
  (let [has-source-query-and-metadata? (every-pred map? :source-query :source-metadata)
        query? (every-pred map? (some-fn :source-query :source-table) #(not (contains? % :condition)))]
    (walk/postwalk
     (fn [form]
       (cond-> form
         ;; `:source-metadata` of `:source-query` in this `form` are on this level. This `:source-query` has already
         ;;   its implicit joins resolved by `postwalk`. The following code updates its metadata too.
         (has-source-query-and-metadata? form)
         add-implicit-joins-aliases-to-metadata

         (query? form)
         resolve-implicit-joins-this-level))
     query)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   Middleware                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn add-implicit-joins
  "Fetch and store any Tables other than the source Table referred to by `:field` clauses with `:source-field` in an
  MBQL query, and add a `:join-tables` key inside the MBQL inner query containing information about the `JOIN`s (or
  equivalent) that need to be performed for these tables.

  This middleware also adds `:join-alias` info to all `:field` forms with `:source-field`s."
  [query]
  (if (mbql.u/match-one (:query query) [:field _ (_ :guard (every-pred :source-field (complement :join-alias)))])
    (do
      (when-not (driver/database-supports? driver/*driver* :foreign-keys (qp.store/database))
        (throw (ex-info (tru "{0} driver does not support foreign keys." driver/*driver*)
                        {:driver driver/*driver*
                         :type   qp.error-type/unsupported-feature})))
      (update query :query resolve-implicit-joins))
    query))
