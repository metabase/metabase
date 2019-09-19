(ns metabase.models.permissions.parse
  "Parses sets of permissions to create a permission graph. Strategy is:

  - Convert strings to parse tree
  - Convert parse tree to path, e.g. ['3' :all] or ['3' :schemas :all]
  - Convert set of paths to a map, the permission graph"
  (:require [instaparse.core :as insta]))

(comment
  (def expanded-grammar
    "Not used - splits grammar up into more parts so that it's maybe easier for hooman to read. Experimental"
    "permission = <'/db/'> db-id <'/'> ( native | schemas )?
db-id       = #'\\d+'
native      = <'native/'>
schemas     = <'schema/'> schema?
schema      = schema-name <'/'> table?
schema-name = #'[^/]*'
table       = <'table/'> table-id <'/'> (table-perm <'/'>)?
table-id    = #'\\d+'
table-perm  = ('read'|'query'|'query/segmented')")

  (def exp-parser (insta/parser expanded-grammar)))

(def grammar
  "A little less easy for hooman to read but easier to work with prse tree to create paths"
  "permission = <'/db/'> #'\\d+' <'/'> ( native | schemas )?
native      = <'native/'>
schemas     = <'schema/'> (#'[^/]*' <'/'> table?)?
table       = <'table/'> #'\\d+' <'/'> (table-perm <'/'>)?
table-perm  = ('read'|'query'|'query/segmented')")

(def parser (insta/parser grammar))

(defmulti path "returns a path for each node in the permission parse tree" first)

(defmethod path :permission
  [[_ db-id :as tree]]
  (let [db-id (Integer/parseInt db-id)]
    (case (count tree)
      2 [[db-id :native :write]
         [db-id :schemas :all]]
      3 (into [db-id] (path (last tree))))))

(defmethod path :schemas
  [[_ schema-name table :as tree]]
  (case (count tree)
    1 [:schemas :all]
    2 [:schemas schema-name :all]
    3 (into [:schemas schema-name] (path table))))

(defmethod path :table
  [[_ table-id table-perm :as tree]]
  (let [table-id (Integer/parseInt table-id)]
    (case (count tree)
      2 [table-id :all]
      3 (into [table-id] (path table-perm)))))

(defmethod path :native
  [_]
  [:native :write])

(defmethod path :table-perm
  [[_ perm]]
  (case perm
    "read"            [:read :all]
    "query"           [:query :all]
    "query/segmented" [:query :some]))

(defn graph
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
       (clojure.walk/prewalk (fn [x]
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
       (clojure.walk/prewalk (fn [x]
                               (if (and (map? x) (seq (filter x [:all :some :write])))
                                 (first (filter x [:all :some :write]))
                                 x)))))

(defn permissions->graph
  "Given a set of permission strings, return a graph that expresses the most permissions possible for the set"
  [permissions]
  (->> permissions
       (map (comp path parser))
       (reduce (fn [paths path]
                 (if (every? vector? path) ;; handle case wher /db/x/ returns two vectors
                   (into paths path)
                   (conj paths path)))
               [])
       (graph)))
