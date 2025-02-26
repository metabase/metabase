(ns metabase.lib.metadata.ident
  "Helpers for working with `:ident` fields on columns.")

(defn implicitly-joined-ident
  "Returns the ident for an implicitly joined column, given the idents of the foreign key column and the target column.

  Remember that `:ident` strings should never be parsed - they are opaque, but should be legible during debugging."
  [target-ident fk-ident]
  (str "implicit_via__" fk-ident "__->__" target-ident))

(defn explicitly-joined-ident
  "Returns the ident for an explicitly joined column, given the idents of the join clause and the target column.

  Remember that `:ident` strings should never be parsed - they are opaque, but should be legible during debugging."
  [target-ident join-ident]
  (str "join__" join-ident "__" target-ident))
