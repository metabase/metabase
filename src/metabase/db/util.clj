(ns metabase.db.util
  "Utility functions for querying the application database."
  (:require
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]
   [toucan2.model :as t2.model])
  (:import
   (clojure.lang ExceptionInfo)
   (java.sql Connection)))

(defn toucan-model?
  "Check if `model` is a toucan model."
  [model]
  (isa? model :metabase/model))

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

(def ^:private NamespacedKeyword
  [:and :keyword [:fn (comp seq namespace)]])

(mu/defn ^:private type-keyword->descendants :- [:set {:min 1} ms/NonBlankString]
  "Return a set of descendents of Metabase `type-keyword`. This includes `type-keyword` itself, so the set will always
  have at least one element.

     (type-keyword->descendants :Semantic/Coordinate) ; -> #{\"type/Latitude\" \"type/Longitude\" \"type/Coordinate\"}"
  [type-keyword :- NamespacedKeyword]
  (set (map u/qualified-name (cons type-keyword (descendants type-keyword)))))

(defn isa
  "Convenience for generating an HoneySQL `IN` clause for a keyword and all of its descendents.
   Intended for use with the type hierarchy in `metabase.types`.

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

(defmacro idempotent-insert!
  "Create or update some database state, typically a single row, atomically.

   This is more general than an `UPSERT` or `INSERT .. ON CONFLICT`, in that it can be used for multiple entities,
   e.g. where we also upsert some parent resources. It is also useful if we want to avoid calculating the data to
   insert, e.g. because it is expensive. This can not be done when sending a single SQL command.

   The usage is just like the naive pattern `(or select-expr insert-expr)`, just papering over a number of sharp edges.

   The mechanism is agnostic as to whether there is an underlying db constraint to prevent duplicates."
  [select-expr insert-expr]
  ;; First attempt the select without a serializable transaction, since those are expensive.
  `(or ~select-expr
       (try
         (t2/with-connection [conn#]
           (.setTransactionIsolation ^Connection conn# Connection/TRANSACTION_SERIALIZABLE)
           (t2/with-transaction [~'_conn]
             ;; We need to try select the row again now that we're in the transaction to track the dependency.
             (u/or-with some?
                      ~select-expr
                      ;; ... and then we can execute the (potentially expensive) mutating branch.
                      ~insert-expr)))
         (catch ExceptionInfo e#
           ;; We cannot introspect the exception cause definitively, as it will be driver specific and typically opaque,
           ;; but we should find a result now if we try selecting again after a concurrent modification exception.
           (u/or-with some?
             ~select-expr
             (throw (ex-info "Unable to find element after attempting an idempotent-insert!"
                             {:select-expr '~select-expr :insert-expr '~insert-expr}
                             ;; Expose the exception - it might not be due to a concurrent modification.
                             e#)))))))
