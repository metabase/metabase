(ns metabase.lib.metadata.ident
  "Helpers for working with `:ident` fields on columns."
  (:require
   [clojure.string :as str]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.util :as lib.util]))

(defn table-prefix
  "Given the DB name and a `table` with `:name` and optional `:schema`, returns a string prefix for the `:ident`s
  of fields in this table."
  [db-name {tbl-name :name, :keys [schema] :as _table}]
  (str/join "__" ["field"
                  db-name
                  (or schema "!noschema!")
                  tbl-name]))

(defn ident-for-field
  "Given a database name, table with `:name` and optional `:schema`, and column with `:name`, construct the `:ident`
  for Fields from the user's DWH. (Other kinds of columns get randomly generated NanoIDs as `:ident`s.)"
  ([prefix {col-name :name :as _column}]
   (str prefix "__" col-name))
  ([db-name table column]
   (ident-for-field (table-prefix db-name table) column)))

(defn attach-ident
  "Generates and attaches an `:ident` to a column, if it doesn't already have one.

  Either takes a prefix for the database, schema and table, or the DB name and table."
  ([prefix-or-fn column]
   (if (:ident column)
     column
     (let [prefix (if (ifn? prefix-or-fn)
                    (prefix-or-fn column)
                    prefix-or-fn)]
       (assoc column :ident (ident-for-field prefix column)))))
  ([db-name table column]
   (cond-> column
     (not (:ident column)) (assoc :ident (ident-for-field db-name table column)))))

(defn attach-idents
  "Generates and attaches an `:ident` to each of the `columns`, if it doesn't have one already.

  2-arity version takes a function from table IDs to the `:ident` prefix for that table.

  1-arity version takes the same function and returns a transducer.

  If you want to memoize or cache the calls to `prefix-fn`, you need to handle that externally! Some callers just have
  a map or constant value, so caching inside this function is redundant and wasteful."
  ([prefix-fn]
   (map #(attach-ident (prefix-fn (:table-id %)) %)))
  ([prefix-fn columns]
   (sequence (attach-idents prefix-fn) columns)))

(defmulti column-maps-of-type
  "Given a `query`, `stage-number` and a `column-type` keyword, returns a sequence of all column maps of that type on
  the given stage. There might be only one map (eg. aggregations, expressions) or several (eg. joins).

  This is a multimethod to allow each part of the code to override it."
  (fn [_query _stage-number column-type]
    column-type)
  :hierarchy lib.hierarchy/hierarchy)

;; The default is for the key to exist at the top level on the stage.
(defmethod column-maps-of-type :default [query stage-number column-type]
  (some-> (lib.util/query-stage query stage-number)
          (get column-type)
          vector))

(defn lookup-column-of-type
  "Looks up a column by ident, in the given column-type map.

  This handles both one-layer nesting (eg. aggregations) and two-layer nesting (eg. join + column)."
  [query stage-number column-type ident]
  (let [maps    (column-maps-of-type query stage-number column-type)
        matches (keep #(get % ident) maps)]
    (case (count matches)
      0 nil ;; XXX: Maybe this should be an error? Two functions?
      1 (first matches)
      (throw (ex-info "Can't happen! Ambiguous column ident" {:query        query
                                                              :stage-number stage-number
                                                              :column-type  column-type
                                                              :ident        ident
                                                              :matches      matches})))))

#_(defn lookup-column
  "Looks up a column (of any type) by ident on the given query and stage."
  [query stage-number ident]
  )
