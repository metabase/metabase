(ns metabase.db.util
  "Utility functions for querying the application database."
  (:require
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]
   [toucan2.model :as t2.model])
  (:import
   (clojure.lang ExceptionInfo)))

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

(defmacro select-or-insert!
  "Create or update some database state, typically a single row, atomically.

   This is more general than using `UPSERT`, `MERGE` or `INSERT .. ON CONFLICT`, and t also  avoids calculating the

   It also allows us to avoid expensive or side-effecting calculations only needed when inserting new values.

   The usage is just like the naive pattern `(or select-expr insert-expr)`, just papering over a number of sharp edges.
   One should be careful about side-effects in `select-expr`, as the expression could be executed up to 3 times.

   The mechanism is agnostic whether there is an underlying db constraint to prevent duplicates."
  {:style/indent 2}
  [model select-map insert-fn]
  `(with-conflict-retry
    (let [select-map# ~select-map
          select-kvs# (mapcat identity select-map#)
          validate#   (fn [updated#]
                        (assert (= select-map# (merge select-map# (select-keys updated# (keys select-map#))))
                                "This macro should not change any of the identifying values")
                        ;; For convenience, we allow the insert-fn to omit fields in the search-map
                        (merge updated# select-map#))]
      (or (apply t2/select-one ~model select-kvs#)
          (t2/insert-returning-instance! ~model (validate# (~insert-fn)))))))

(defmacro update-or-insert!
  "sdfsdf. Returns the primary key."
  {:style/indent 2}
  [model select-map update-fn]
  `(with-conflict-retry
    (let [select-map# ~select-map
          update-fn#  ~update-fn
          select-kvs# (mapcat identity select-map#)
          pks#        (t2/primary-keys ~model)
          _#          (assert (= 1 (count pks#)) "This macro does not currently support compound keys")
          pk-key#     (keyword (first pks#))
          validate#   (fn [updated#]
                        (assert (= select-map# (merge select-map# (select-keys updated# (keys select-map#))))
                                "This macro should not change any of the identifying values")
                        ;; For convenience, we allow the update-fn to omit fields in the search-map
                        (merge updated# select-map#))]
      (if-let [entity# (apply t2/select-one ~model select-kvs#)]
        (let [pk# (pk-key# entity#)
              updated# (validate# (update-fn# entity#))]
          (t2/update! ~model pk# (validate# (update-fn# entity#)))
          ;; we allow this operation to change the private key
          (pk-key# updated#))
        (t2/insert-returning-pk! ~model (validate# (update-fn# nil)))))))
