(ns metabase.models.permissions.parse
  "Parses sets of permissions to create a permission graph. Strategy is:

  - Convert strings to parse tree
  - Convert parse tree to path, e.g. ['3' :all] or ['3' :schemas :all]

  Convert set of paths to a map, the permission graph"
  (:require [instaparse.core :as insta]))


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

(def grammar
  "A little less easy for hooman to read but easier to work with prse tree to create paths"
  "permission = <'/db/'> #'\\d+' <'/'> ( native | schemas )?
native      = <'native/'>
schemas     = <'schema/'> (#'[^/]*' <'/'> table?)?
table       = <'table/'> #'\\d+' <'/'> (table-perm <'/'>)?
table-perm  = ('read'|'query'|'query/segmented')")

(def exp-parser (insta/parser expanded-grammar))
(def parser (insta/parser grammar))


(defmulti path first)

(defmethod path :permission
  [[_ db-id :as tree]]
  (case (count tree)
    2 [[db-id :native :all]
       [db-id :schemas :all]]
    3 (into [db-id] (path (last tree)))))

(defmethod path :schemas
  [[_ schema-name table :as tree]]
  (case (count tree)
    1 [:schemas :all]
    2 [:schemas schema-name :all]
    3 (into [:schemas schema-name] (path table))))

(defmethod path :table
  [[_ table-id table-perm :as tree]]
  (case (count tree)
    2 [table-id :all]
    3 (into [table-id] (path table-perm))))

(defmethod path :native
  [_]
  [:native :all])

(defmethod path :table-perm
  [[_ perm]]
  (case perm
    "read"            [:read :all]
    "query"           [:query :all]
    "query/segmented" [:query :some]))

(defn graph
  [paths]
  (->> paths
       (clojure.walk/prewalk (fn [x]
                               (if (and (sequential? x)
                                        (sequential? (first x))
                                        (not (empty? (first x))))
                                 (->> x
                                      (group-by first)
                                      (reduce-kv (fn [m k v]
                                                   (assoc m k (->> (map rest v)
                                                                   (filter seq))))
                                                 {}))
                                 x)))
       (clojure.walk/prewalk (fn [x]
                               (if (and (map? x) (seq (filter x [:all :some])))
                                 (first (filter x [:all :some]))
                                 x)))))


(defn permissions->graph
  [permissions]
  (->> permissions
       (map (comp path parser))
       (reduce (fn [paths path]
                 (if (every? vector? path) ;; handle case wher /db/x/ returns two vectors
                   (into paths path)
                   (conj paths path)))
               [])
       (graph)))

;; The key should get transformed to the value
(def graphs
  {"/db/3/"                                       {3 {:native  :all
                                                      :schemas :all}}
   "/db/3/schema/"                                {3 {:schemas :all}}
   "/db/3/schema/PUBLIC/"                         {3 {:schemas {"PUBLIC" :all}}}
   "/db/3/schema/PUBLIC/table/3/"                 {3 {:schemas {"PUBLIC" {3 :all}}}}
   "/db/3/schema/PUBLIC/table/3/read/"            {3 {:schemas {"PUBLIC" {3 {:read :all}}}}}
   "/db/3/schema/PUBLIC/table/3/query/"           {3 {:schemas {"PUBLIC" {3 {:query :all}}}}}
   "/db/3/schema/PUBLIC/table/3/query/segmented/" {3 {:schemas {"PUBLIC" {3 {:query :some}}}}}
   "/db/3/schema/PUBLIC/table/4/query/segmented/" {3 {:schemas {"PUBLIC" {4 {:query :some}}}}}
   "/db/5/schema/PUBLIC/table/4/query/segmented/" {5 {:schemas {"PUBLIC" {4 {:query :some}}}}}})

;; try it out
(->> graphs
     keys
     (sort-by count)
     (drop 0)
     permissions->graph)
