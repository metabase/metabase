(ns metabase.app-db.query
  "Honey SQL builders for the application database, which run nothing: the queries themselves live in
  [[metabase.app-db.db]]."
  (:refer-clojure :exclude [compile])
  (:require
   [metabase.app-db.connection :as mdb.connection]
   [metabase.funnysql.core :as funnysql]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.model :as t2.model]
   [toucan2.pipeline :as t2.pipeline])
  (:import
   (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(methodical/defmethod t2.pipeline/build :around [:toucan.query-type/select.exists :default clojure.lang.IPersistentMap]
  "Mark the subquery that `t2/exists?` wraps in `[:exists ...]` with `^:allow-subquery`, which Funny SQL requires."
  [query-type model parsed-args resolved-query]
  (update-in (next-method query-type model parsed-args resolved-query)
             [:select 0 0 1] vary-meta assoc :allow-subquery true))

(def ^:private NamespacedKeyword
  [:and :keyword [:fn (comp seq namespace)]])

(mu/defn type-keyword->descendants :- [:set {:min 1} ms/NonBlankString]
  "Return a set of descendents of Metabase `type-keyword`. This includes `type-keyword` itself, so the set will always
  have at least one element.

     (type-keyword->descendants :Semantic/Coordinate) ; -> #{\"type/Latitude\" \"type/Longitude\" \"type/Coordinate\"}"
  [type-keyword :- NamespacedKeyword]
  (set (map u/qualified-name (cons type-keyword (descendants type-keyword)))))

(defn isa
  "Convenience for generating an HoneySQL `IN` clause for a keyword and all of its descendents.
   Intended for use with the type hierarchy in [[metabase.types.core]].

     (t2/select Field :semantic_type (mdb/isa :type/URL))
      ->
     (t2/select Field :semantic_type [:in #{\"type/URL\" \"type/ImageURL\" \"type/AvatarURL\"}])

   Also accepts optional `expr` for use directly in a HoneySQL `where`:

     (t2/select Field {:where (mdb/isa :semantic_type :type/URL)})
     ->
     (t2/select Field {:where [:in :semantic_type #{\"type/URL\" \"type/ImageURL\" \"type/AvatarURL\"}]})"
  ([type-keyword]
   [:in (type-keyword->descendants type-keyword)])
  ;; when using this with an `expr` (e.g. `(isa :semantic_type :type/URL)`) just go ahead and take the results of the
  ;; one-arity impl above and splice expr in as the second element
  ;;
  ;;    [:in #{"type/URL" "type/ImageURL"}]
  ;;
  ;; becomes
  ;;
  ;;    [:in :semantic_type #{"type/URL" "type/ImageURL"}]
  ([expr type-keyword]
   [:in expr (type-keyword->descendants type-keyword)]))

(defn qualify
  "Returns a qualified field for [modelable] with [field-name]."
  ^clojure.lang.Keyword [modelable field-name]
  (if (vector? field-name)
    [(qualify modelable (first field-name)) (second field-name)]
    (let [model (t2.model/resolve-model modelable)]
      (keyword (str (name (t2.model/table-name model)) \. (name field-name))))))

(defn join
  "Convenience for generating a HoneySQL `JOIN` clause.

     (t2/select-pks-set FieldValues
       (mdb/join [FieldValues :field_id] [Field :id])
       :active true)"
  [[source-entity fk] [dest-entity pk]]
  {:left-join [(t2/table-name (t2.model/resolve-model dest-entity))
               [:= (qualify source-entity fk) (qualify dest-entity pk)]]})

(defmulti compile
  "Compile a `query` (e.g. a Honey SQL map) to `[sql & args]`."
  {:arglists '([query])}
  type)

(defmethod compile String
  [sql]
  (compile [sql]))

(defmethod compile clojure.lang.IPersistentVector
  [sql-args]
  sql-args)

(defmethod compile clojure.lang.IPersistentMap
  [honeysql]
  (funnysql/format honeysql (mdb.connection/db-type)))

(defmacro with-conflict-retry
  "Retry a database mutation a single time if it fails due to concurrent insertions.
   May retry for other reasons."
  [& body]
  `(try
     ~@body
     (catch ExceptionInfo e#
       ;; The underlying exception thrown by the driver is database specific and opaque, so we treat any exception as a
       ;; possible database conflict due to a concurrent insert. If we want to be more conservative, we would need
       ;; a per-driver or driver agnostic way to test the exception.
       ~@body)))

(def create-partition-size
  "The number of rows one pass of a create write function takes."
  1000)

(def delete-partition-size
  "The number of ids one DELETE statement of a write function takes, below the parameter limit of every app DB."
  10000)

(def update-partition-size
  "The number of rows one pass of an update write function takes."
  1000)

(def select-partition-size
  "The number of ids one SELECT statement of a read function takes, below the parameter limit of every app DB."
  10000)

(mu/defn upsert-query :- [:fn {:description "a Honey SQL upsert statement"} map?]
  "The Honey SQL statement that inserts `row` into `table` or, when a row with the same values of the unique
  `key-columns` exists, sets its other columns to those of `row`: `ON CONFLICT` on Postgres, `ON DUPLICATE KEY UPDATE`
  on MySQL and MariaDB, and `MERGE ... KEY` on H2."
  [table       :- :keyword
   key-columns :- [:sequential {:min 1} :keyword]
   row         :- [:fn {:description "a map of column keyword to value"} map?]]
  (let [columns (vec (keys row))
        updated (remove (set key-columns) columns)]
    (case (mdb.connection/db-type)
      :postgres {:insert-into   table
                 :values        [row]
                 :on-conflict   key-columns
                 :do-update-set (into {} (map (fn [column] [column (u/qualified-key :excluded column)])) updated)}
      :mysql    {:insert-into             table
                 :values                  [row]
                 :on-duplicate-key-update (into {} (map (fn [column] [column [:values column]])) updated)}
      :h2       {:merge-into table
                 :columns    columns
                 :key        key-columns
                 :values     [(mapv row columns)]})))
