(ns metabase.lib.metadata.ident
  "Helpers for working with `:ident` fields on columns."
  (:require
   [clojure.string :as str]))

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
