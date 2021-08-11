(ns metabase.driver.sql.query-processor.preprocess.add-references
  (:require [clojure.math.combinatorics :as math.combo]
            [metabase.driver.sql.query-processor.preprocess.alias :as sql.qp.alias]
            [metabase.mbql.util :as mbql.u]))

(def source-query-alias
  "Alias to use for source queries, e.g.:

    SELECT source.*
    FROM ( SELECT * FROM some_table ) source"
  "source")

(defn- best-matching-info [[_ id-or-name opts :as field-clause] select]
  (or (some
       (fn [field-clause]
         (some
          (fn [{:keys [clause], :as info}]
            (when (mbql.u/is-clause? :field clause)
              (when (= clause field-clause)
                info)))
          select))
       (for [keys-to-remove (math.combo/subsets (vec (disj (set (keys opts)) :base-type)))]
         (apply mbql.u/update-field-options field-clause dissoc keys-to-remove)))
      (some
       (fn [{:keys [clause], :as info}]
         (when (mbql.u/is-clause? :field clause)
           (let [[_ an-id-or-name] clause]
             (when (= an-id-or-name id-or-name)
               info))))
       select)))

(defn extra-field-info
  [driver
   {:keys [joins source-query], :sql.qp/keys [select]}
   [_ id-or-name {:keys [join-alias], :as opts} :as field-clause]]
  (merge
   {:source-alias (sql.qp.alias/clause-alias driver field-clause)}
   (when source-query
     (when-let [info (extra-field-info driver source-query field-clause)]
       (merge
        info
        {:source-table source-query-alias})))
   (when (and joins join-alias)
     (when-let [matching-join (some
                               (fn [join]
                                 (when (= (:alias join) join-alias)
                                   join))
                               joins)]
       (merge
        (extra-field-info driver matching-join (mbql.u/update-field-options field-clause dissoc :join-alias))
        {:source-table join-alias})))
   (when-let [info (best-matching-info field-clause select)]
     {:source-alias (:alias info)})))

(defn- resolve-source [driver inner-query clause]
  (extra-field-info driver (dissoc inner-query :sql.qp/select) clause))

(defn references [driver inner-query]
  (into {} (mbql.u/match (dissoc inner-query :joins :source-query)
             :field
             [&match (resolve-source driver inner-query &match)])))

(defn add-references
  [driver {:keys [source-query joins], :as inner-query}]
  (let [add-references* (partial add-references driver)
        inner-query     (cond-> inner-query
                          source-query (update :source-query add-references*)
                          (seq joins)  (update :joins (partial mapv add-references*)))
        references      (references driver inner-query)]
    (cond-> inner-query
      (seq references) (assoc :sql.qp/references references))))
