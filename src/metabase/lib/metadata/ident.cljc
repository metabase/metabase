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

(defn model-ident
  "Returns the `:ident` for this column on a model.

  Needs the `entity_id` for the model's card and the column's `:ident`."
  [target-ident card-entity-id]
  (str "model__" card-entity-id "__" target-ident))

(defn native-ident
  "Returns the `:ident` for a given field name on a native query.

  Requires the `entity_id` of the card and the name of the column."
  [column-name card-entity-id]
  (str "native__" card-entity-id "__" column-name))

(def ^:dynamic *enforce-idents-present*
  "The [[assert-idents-present!]] check is sometimes too zealous; this dynamic var can be overridden whe we know the
  query is in a broken state, such as during the cleanup of dangling references in `remove-clause`.

  Defaults to false in production, true in dev and test."
  ;; TODO: Enable this in tests once the QP is adding `:ident`s to `result_metadata`.
  false
  #_#?(:clj      (not config/is-prod?)
       :cljs-dev true
       :default  false))

(defn assert-idents-present!
  "Given a list of columns and map of data for [[ex-info]], throw if any columns in the output lack `:ident`s.

  Return nil if there's no trouble."
  [columns ex-map]
  (when *enforce-idents-present*
    (when-let [missing (seq (remove :ident columns))]
      (throw (ex-info "Some columns are missing :idents"
                      (assoc ex-map :missing-ident missing))))))
