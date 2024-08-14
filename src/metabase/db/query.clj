(ns metabase.db.query
  "Honey SQL 2 replacements for [[toucan.db/query]] and [[toucan.db/reducible-query]]. These are here to ease our
  transition to Honey SQL 2 and Toucan 2. Once we switch over to the latter we can hopefully remove this namespace.

  PRO TIPS:

  1. You can enable debug logging for the compiled SQL locally by setting the log level for this namespace to
     `:trace`:

     ```
     (metabase.test/set-ns-log-level! 'metabase.db.query :trace)
     ```

  2. If using CIDER, set

     ```
     (setq cider-stacktrace-fill-column nil)
     ```

     So the nicely-formatted SQL in error messages doesn't get wrapped into a big blob in the `*cider-error*` buffer."
  (:refer-clojure :exclude [compile])
  (:require
   [clojure.string :as str]
   [honey.sql :as sql]
   [metabase.db :as mdb]
   [metabase.driver :as driver]
   [metabase.plugins.classloader :as classloader]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]
   [toucan2.jdbc.options :as t2.jdbc.options]
   [toucan2.model :as t2.model])
  (:import
   (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(defn format-sql
  "Return a nicely-formatted version of a `query` string with the current application db driver formatting."
  [sql]
  (driver/prettify-native-form (mdb/db-type) sql))

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
  [honey-sql]
  ;; make sure metabase.db.setup is loaded so the `:metabase.db.setup/application-db` gets defined
  (classloader/require 'metabase.db.setup)
  (let [sql-args (try
                   (sql/format honey-sql {:quoted true, :dialect :metabase.db.setup/application-db, :quoted-snake false})
                   (catch Throwable e
                     ;; this is not i18n'ed because it (hopefully) shouldn't be user-facing -- we shouldn't be running
                     ;; in to unexpected Honey SQL compilation errors at run time -- if we are it means we're not being
                     ;; careful enough with the Honey SQL forms we create which is a bug in the Metabase code we should
                     ;; have caught in tests.
                     (throw (ex-info (str "Error compiling Honey SQL: " (ex-message e))
                                     {:honey-sql honey-sql}
                                     e))))]
    (log/tracef "Compiled SQL:\n%s\nparameters: %s"
                (format-sql (first sql-args))
                (pr-str (rest sql-args)))
    sql-args))

;;; TODO -- we should mark this deprecated and tell people to use [[toucan2.core/query]] directly instead
(defn query
  "Replacement for [[toucan.db/query]] -- uses Honey SQL 2 instead of Honey SQL 1, to ease the transition to the
  former (and to Toucan 2).

  Query the application database and return all results at once.

  See namespace documentation for [[metabase.db.query]] for pro debugging tips."
  [sql-args-or-honey-sql-map & {:as jdbc-options}]
  ;; make sure [[metabase.db.setup]] gets loaded so default Honey SQL options and the like are loaded.
  (classloader/require 'metabase.db.setup)
  (let [sql-args (compile sql-args-or-honey-sql-map)]
    ;; catch errors running the query and rethrow with the failing generated SQL and the failing Honey SQL form -- this
    ;; will help with debugging stuff. This should mostly be dev-facing because we should hopefully not be committing
    ;; any busted code into the repo
    (try
      (binding [t2.jdbc.options/*options* (merge t2.jdbc.options/*options* jdbc-options)]
        (t2/query sql-args))
      (catch Throwable e
        (let [formatted-sql (format-sql (first sql-args))]
          (throw (ex-info (str "Error executing SQL query: " (ex-message e)
                               \newline
                               \newline
                               formatted-sql)
                          {:sql        (str/split-lines (str/trim formatted-sql))
                           :args       (rest sql-args)
                           :uncompiled sql-args-or-honey-sql-map}
                          e)))))))

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

(defn select-or-insert!
  "Return a database record if it exists, otherwise create it.

   The `select-map` is used to query the `model`, and if a result is found it is immediately returned.
   If no value is found, `insert-fn` is called to generate the entity to be inserted.

   Note that this generated entity must be consistent with `select-map`, if it disagrees on any keys then an exception
   will be thrown. It is OK for the entity to omit fields from `select-map`, they will implicitly be added on.

   This is more general than using `UPSERT`, `MERGE` or `INSERT .. ON CONFLICT`, and it also allows one to avoid
   calculating initial values that may be expensive, or require side effects.

   In the case where there is an underlying db constraint to prevent duplicates, this method takes care of handling
   rejection from the database due to a concurrent insert, and will retry a single time to pick up the existing row.
   This may result in `insert-fn` being called a second time.

   In the case where there is no underlying db constraint, concurrent calls may still result in duplicates.
   To prevent this in a database agnostic way, during an existing non-serializable transaction, would be non-trivial."
  [model select-map insert-fn]
  (let [select-kvs (mapcat identity select-map)
        insert-fn  #(let [instance (insert-fn)]
                      ;; the inserted values must be consistent with the select query
                      (assert (not (u/conflicting-keys? select-map instance))
                              "this should not be used to change any of the identifying values")
                      ;; for convenience, we allow insert-fn's result to omit fields in the search-map
                      (merge instance select-map))]
    (with-conflict-retry
      (or (apply t2/select-one model select-kvs)
          (t2/insert-returning-instance! model (insert-fn))))))

(defn update-or-insert!
  "Update a database record, if it exists, otherwise create it.

   The `select-map` is used to query the `model`, and if a result is found then we will update that entity, otherwise
   a new entity will be created. We use `update-fn` to calculate both updates and initial values - in the first case
   it will be called with the existing value, and in the second case it will be called with nil, analogous to the way
   that [[clojure.core/update]] calls its function.

   Note that the generated entity must be consistent with `select-map`, if it disagrees on any keys then an exception
   will be thrown. It is OK for the entity to omit fields from `select-map`, they will implicitly be added on.

   This is more general than using `UPSERT`, `MERGE` or `INSERT .. ON CONFLICT`, and it also allows one to avoid
   calculating initial values that may be expensive, or require side effects.

   In the case where there is an underlying db constraint to prevent duplicates, this method takes care of handling
   rejection from the database due to a concurrent insert, and will retry a single time to pick up the existing row.
   This may result in `update-fn` being called a second time.

   In the case where there is no underlying db constraint, concurrent calls may still result in duplicates.
   To prevent this in a database agnostic way, during an existing non-serializable transaction, would be non-trivial."
  [model select-map update-fn]
  (let [select-kvs (mapcat identity select-map)
        pks        (t2/primary-keys model)
        _          (assert (= 1 (count pks)) "This helper does not currently support compound keys")
        pk-key     (keyword (first pks))
        update-fn  (fn [existing]
                     (let [updated (update-fn existing)]
                       ;; the inserted / updated values must be consistent with the select query
                       (assert (not (u/conflicting-keys? select-map updated))
                               "This should not be used to change any of the identifying values")
                       ;; For convenience, we allow the update-fn to omit fields in the search-map
                       (merge updated select-map)))]
    (with-conflict-retry
      (if-let [existing (apply t2/select-one model select-kvs)]
        (let [pk      (pk-key existing)
              updated (update-fn existing)]
          (t2/update! model pk updated)
          ;; the private key may have been changed by the update, and this is OK.
          (pk-key updated pk))
        (t2/insert-returning-pk! model (update-fn nil))))))
