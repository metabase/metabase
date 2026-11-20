(ns metabase.transforms.dependencies
  "The functions of the dependencies spec of a Transform."
  (:require
   [metabase.dependencies.core :as dependencies]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.transforms.db :as transforms.db]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- transform-query
  "The normalized query of `transform`, nil unless it is a query transform."
  [transform]
  (when (transforms-base.u/query-transform? transform)
    (lib-be/normalize-query (-> transform :source :query))))

(defn hydrate
  "The Transforms `transforms` with the dependencies of their native queries."
  [transforms]
  (dependencies/with-native-dependencies transforms transform-query))

(defn dependencies
  "The dependencies of the hydrated `transform`: what its query reads, or the source tables of a Python transform."
  [transform]
  (cond
    (transforms-base.u/query-transform? transform)
    (dependencies/query-dependencies transform (transform-query transform))

    (transforms-base.u/python-transform? transform)
    {:table (into #{} (keep :table_id) (-> transform :source :source-tables))}

    :else
    (do (log/warnf "Don't know how to analyze the deps of Transform %d with source type '%s'"
                   (:id transform) (-> transform :source :type))
        {})))

(defn- output-name
  "The name of the output column `column`: its alias, so that `t1.name AS a` and `t2.name AS b` differ, or its name."
  [column]
  (or (:lib/desired-column-alias column) (:name column)))

(defn- duplicate-column-errors
  "The errors of the output columns of `query` that share a name."
  [query]
  (->> (dependencies/query-returned-columns query)
       (group-by output-name)
       vals
       (keep #(when (> (count %) 1)
                (lib/duplicate-column-error (output-name (first %)))))))

(defn analysis
  "The errors of `transform`: those of its query and of the output columns it duplicates, none for a transform without
  a query that has a source database, and an error for one without."
  [transform]
  (cond
    (transforms-base.u/query-transform? transform)
    (let [query (transform-query transform)]
      (into (dependencies/query-errors query) (duplicate-column-errors query)))

    (:source_database_id transform)
    #{}

    :else
    #{(lib/validation-exception-error "Could not resolve a database for this entity.")}))

(defn after-dependencies
  "The tables among the `dependents` of `transform` that are no longer its target: missing ones, and those of another
  name, schema or database."
  [{:keys [target] :as transform} {table-ids :table}]
  (let [db-id    (transforms-base.u/transform-source-database transform)
        tables   (when (seq table-ids) (transforms.db/tables (set table-ids)))
        target?  (fn [table]
                   (and (= (:schema table) (:schema target))
                        (= (:name table) (:name target))
                        (or (not db-id) (= db-id (:db_id table)))))
        current  (into #{} (comp (filter target?) (map :id)) tables)]
    {:table (into #{} (remove current) table-ids)}))
