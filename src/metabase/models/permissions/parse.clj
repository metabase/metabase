(ns metabase.models.permissions.parse
  "Parses sets of permissions to create a permission graph. Strategy is:

  - Convert strings to parse tree
  - Convert parse tree to path, e.g. ['3' :all] or ['3' :schemas :all]
  - Convert set of paths to a map, the permission graph"
  (:require [clojure.core.match :as match]
            [clojure.walk :as walk]
            [instaparse.core :as insta]))

(def ^:private grammar
  "Describes permission strings like /db/3/ or /collection/root/read/"
  "permission = ( all | db | collection )
  all         = <'/'>
  db          = <'/db/'> #'\\d+' <'/'> ( native | schemas )?
  native      = <'native/'>
  schemas     = <'schema/'> schema?
  schema      = #'[^/]*' <'/'> table?
  table       = <'table/'> #'\\d+' <'/'> (table-perm <'/'>)?
  table-perm  = ('read'|'query'|'query/segmented')

  collection  = <'/collection/'> #'[^/]*' <'/'> ('read' <'/'>)?")

(def ^:private parser
  "Function that parses permission strings"
  (insta/parser grammar))

(defn- collection-id
  [id]
  (if (= id "root") :root (Integer/parseInt id)))

(defn- path
  "Recursively build permission path from parse tree"
  [tree]
  (match/match tree
    [:permission t]              (path t)
    [:all]                       [:all] ;; admin permissions
    [:db db-id]                  (let [db-id (Integer/parseInt db-id)]
                                   [[:db db-id :native :write]
                                    [:db db-id :schemas :all]])
    [:db db-id db-node]          (let [db-id (Integer/parseInt db-id)]
                                   (into [:db db-id] (path db-node)))
    [:schemas]                   [:schemas :all]
    [:schemas schema]            (into [:schemas] (path schema))
    [:schema schema-name]        [schema-name :all]
    [:schema schema-name table]  (into [schema-name] (path table))
    [:table table-id]            [(Integer/parseInt table-id) :all]
    [:table table-id table-perm] (into [(Integer/parseInt table-id)] (path table-perm))
    [:table-perm perm]           (case perm
                                   "read"            [:read :all]
                                   "query"           [:query :all]
                                   "query/segmented" [:query :segmented])
    [:native]                    [:native :write]

    [:collection id]             [:collection (collection-id id) :write]
    [:collection id "read"]      [:collection (collection-id id) :read]))

(defn- graph
  "Given a set of permission paths, return a graph that expresses the most permissions possible for the set

  Works by first doing a conversion like
  [[3 :schemas :all]
   [3 :schemas \"PUBLIC\" :all]
  ->
  {3 {:schemas {:all ()
                :public {:all ()}}}}

  Then converting that to
  {3 {:schemas :all}}"
  [paths]
  (->> paths
       (reduce (fn [paths path]
                 (if (every? vector? path) ;; handle case wher /db/x/ returns two vectors
                   (into paths path)
                   (conj paths path)))
               [])
       (walk/prewalk (fn [x]
                       (if (and (sequential? x)
                                (sequential? (first x))
                                (seq (first x)))
                         (->> x
                              (group-by first)
                              (reduce-kv (fn [m k v]
                                           (assoc m k (->> (map rest v)
                                                           (filter seq))))
                                         {}))
                         x)))
       (walk/prewalk (fn [x]
                       (if-let [terminal (and (map? x)
                                              (some #(and (= (% x) '()) %)
                                                    [:all :some :write :read :segmented]))]
                         terminal
                         x)))))

(defn permissions->graph
  "Given a set of permission strings, return a graph that expresses the most permissions possible for the set"
  [permissions]
  (->> permissions
       (map (comp path parser))
       (graph)))
