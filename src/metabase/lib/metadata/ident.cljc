(ns metabase.lib.metadata.ident
  "Helpers for working with `:ident` fields on columns.")

(defn explicitly-joined-ident
  "Returns the ident for an explicitly joined column, given the idents of the join clause and the target column.
  Remember that `:ident` strings should never be parsed - they are opaque, but should be legible during debugging."
  [target-ident join-ident]
  (str "join[" join-ident "]__" target-ident))

(defn implicit-join-clause-ident
  "Returns the ident for an implicit join **clause**.

  The join clause's ident is derived from the FK column's ident: `implicit_via__IdentOfFK`."
  [fk-ident]
  (str "implicit_via__" fk-ident))

(defn implicitly-joined-ident
  "Returns the ident for an implicitly joined column, given the idents of the foreign key column and the target column.

  Remember that `:ident` strings should never be parsed - they are opaque, but should be legible during debugging."
  [target-ident fk-ident]
  (explicitly-joined-ident target-ident (implicit-join-clause-ident fk-ident)))
