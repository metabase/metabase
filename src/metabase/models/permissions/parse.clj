(ns metabase.models.permissions.parse
  "Parses sets of permissions to create a permission graph. Strategy is:

  - Convert strings to parse tree
  - Convert parse tree to path, e.g. ['3' :all] or ['3' :schemas :all]
  - Convert set of paths to a map, the permission graph"
  (:require
   [clojure.core.match :refer [match]]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [instaparse.core :as insta]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private grammar
  "Describes permission strings like /db/3/ or /collection/root/read/"
  "permission = ( all | db | block | download | data-model | details | collection | data-v2 | query-v2)
  all         = <'/'>
  data-v2     = <'/data/db/'> #'\\d+' <'/'> ( native | schemas )?
  query-v2    = <'/query/db/'> #'\\d+' <'/'> ( native | schemas )?
  db          = <'/db/'> #'\\d+' <'/'> ( native | schemas )?
  native      = <'native/'>
  schemas     = <'schema/'> schema?
  schema      = schema-name <'/'> table?
  table       = <'table/'> #'\\d+' <'/'> (table-perm <'/'>)?
  table-perm  = ('read'|'query'|'query/segmented')

  block       = <'/block/db/'> #'\\d+' <'/'>

  download    = <'/download'> ( dl-limited | dl-db)
  dl-limited  = <'/limited'>  dl-db
  dl-db       = <'/db/'> #'\\d+' <'/'> ( dl-native | dl-schemas )?
  dl-native   = <'native/'>
  dl-schemas  = <'schema/'> dl-schema?
  dl-schema   = schema-name <'/'> dl-table?
  dl-table    = <'table/'> #'\\d+' <'/'>

  data-model  = <'/data-model'> dm-db
  dm-db       = <'/db/'> #'\\d+' <'/'> dm-schema?
  dm-schema   = <'schema/'> schema-name <'/'> dm-table?
  dm-table    = <'table/'> #'\\d+' <'/'>

  details  = <'/details'> <'/db/'> #'\\d+' <'/'>

  schema-name = #'(\\\\/|[^/])*' (* schema name can have \\/ but not /*)

  collection  = <'/collection/'> #'[^/]*' <'/'> ('read' <'/'>)?")

(def ^:private ^{:arglists '([s])} parser
  "Function that parses permission strings"
  (insta/parser grammar))

(defn- collection-id
  [id]
  (if (= id "root") :root (Long/parseUnsignedLong id)))

(defn- unescape-path-component
  "Unescape slashes for things that has been escaped before storing in DB (e.g: DB schema name).
  To find things that were being escaped: check references of [[metabase.models.permissions/escape-path-component]].

    (unescape-path-component \"a\\/b\" => \"a/b\")."
  [s]
  (some-> s
          (str/replace "\\/" "/")     ; \/ -> /
          (str/replace "\\\\" "\\"))) ; \\ -> \

(defn- append-to-all
  "If `path-or-paths` is a single path, append `x` to the end of it. If it's a vector of paths, append `x` to each path."
  [path-or-paths x]
  (if (seqable? (first path-or-paths))
    (map (fn [path] (append-to-all path x)) (seq path-or-paths))
    (into path-or-paths [x])))

(defn- path1
  [tree]
  (match tree
    [:permission t]                (path1 t)
    [:schema-name schema-name]     (unescape-path-component schema-name)
    [:all]                         [:all] ; admin permissions

    [:db db-id]                    (let [db-id (Long/parseUnsignedLong db-id)] [[:db db-id :data :native :write] [:db db-id :data :schemas :all]])
    [:db db-id db-node]            (into [:db (Long/parseUnsignedLong db-id) :data] (path1 db-node))

    [:data-v2 db-id]              (let [db-id (Long/parseUnsignedLong db-id)] [[:db db-id :data :native :write]])
    [:data-v2 db-id db-node]      (into [:db (Long/parseUnsignedLong db-id) :data] (path1 db-node))

    [:query-v2 db-id]              (let [db-id (Long/parseUnsignedLong db-id)] [[:db db-id :query :native :write] [:db db-id :query :schemas :all]])
    [:query-v2 db-id db-node]      (into [:db (Long/parseUnsignedLong db-id) :query] (path1 db-node))

    [:schemas]                     [:schemas :all]
    [:schemas schema]              (into [:schemas] (path1 schema))
    [:schema schema-name]          [(path1 schema-name) :all]
    [:schema schema-name table]    (into [(path1 schema-name)] (path1 table))

    [:table table-id]              [(Long/parseUnsignedLong table-id) :all]
    [:table table-id table-perm]   (into [(Long/parseUnsignedLong table-id)] (path1 table-perm))

    [:table-perm perm]              (case perm
                                      "read"            [:read :all]
                                      "query"           [:query :all]
                                      "query/segmented" [:query :segmented])
    [:native]                      [:native :write]
    ;; block perms. Parse something like /block/db/1/ to {:db {1 {:schemas :block}}}
    [:block db-id]                 [:db (Long/parseUnsignedLong db-id) :data :schemas :block]
    ;; download perms
    [:download
     [:dl-limited db-node]]        (append-to-all (path1 db-node) :limited)
    [:download db-node]            (append-to-all (path1 db-node) :full)
    [:dl-db db-id]                 (let [db-id (Long/parseUnsignedLong db-id)]
                                     #{[:db db-id :download :native]
                                       [:db db-id :download :schemas]})
    [:dl-db db-id db-node]         (let [db-id (Long/parseUnsignedLong db-id)]
                                     (into [:db db-id] (path1 db-node)))
    [:dl-schemas]                  [:download :schemas]
    [:dl-schemas schema]           (into [:download :schemas] (path1 schema))
    [:dl-schema schema-name]       [(path1 schema-name)]
    [:dl-schema schema-name table] (into [(path1 schema-name)] (path1 table))
    [:dl-table table-id]           [(Long/parseUnsignedLong table-id)]
    [:dl-native]                   [:download :native]
    ;; collection perms
    [:collection id]               [:collection (collection-id id) :write]
    [:collection id "read"]        [:collection (collection-id id) :read]
    ;; return nil if the tree could not be parsed, so that we can try calling `path2` instead
    :else                          nil))

(defn- path2
  [tree]
  (match tree
    (_ :guard insta/failure?)      (log/error (trs "Error parsing permissions tree {0}" (pr-str tree)))
    [:permission t]                (path2 t)
    [:schema-name schema-name]     (unescape-path-component schema-name)
    ;; data model perms
    [:data-model db-node]          (path2 db-node)
    [:dm-db db-id]                 (let [db-id (Long/parseUnsignedLong db-id)]
                                     [:db db-id :data-model :schemas :all])
    [:dm-db db-id db-node]         (let [db-id (Long/parseUnsignedLong db-id)]
                                     (into [:db db-id :data-model :schemas] (path2 db-node)))
    [:dm-schema schema-name]       [(path2 schema-name) :all]
    [:dm-schema schema-name table] (into [(path2 schema-name)] (path2 table))
    [:dm-table table-id]           [(Long/parseUnsignedLong table-id) :all]
    ;; DB details perms
    [:details db-id]            (let [db-id (Long/parseUnsignedLong db-id)]
                                  [:db db-id :details :yes])))

(defn- path
  "Recursively build permission path from parse tree. Implementation must be split between two pattern matching
  functions, because having all the clauses in a single pattern match will cause a compilation error due to CLJ-1852"
  [tree]
  (or (path1 tree) (path2 tree)))

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
                 (if (every? vector? path) ;; handle case where /db/x/ returns two vectors
                   (into paths path)
                   (conj paths path)))
               [])
       (walk/prewalk (fn [x]
                       (if (and (sequential? x) (sequential? (first x)) (seq (first x)))
                         (->> x
                              (group-by first)
                              (reduce-kv (fn [m k v]
                                           (assoc m k (->> (map rest v) (filter seq))))
                                         {}))
                         x)))
       (walk/prewalk (fn [x]
                       (or (when (map? x)
                             (some #(and (= (% x) '()) %)
                                   [:block :all :some :write :read :segmented :full :limited :yes]))
                           x)))))

(defn ->graph
  "Given a set of permission strings, return a graph that expresses the most permissions possible for the set"
  [permissions]
  (->> permissions
       (map (comp path parser))
       graph))
