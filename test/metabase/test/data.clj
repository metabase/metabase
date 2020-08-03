(ns metabase.test.data
  "Super-useful test utility functions.

  Basic way stuff in here, which you'll see everywhere in the tests, is:

  1. Get the DB you're currently testing by calling `db`. Get IDs of the DB or of its Fields and Tables in that DB by
     calling `id`.

      (data/db)                 ; -> Get current test DB
      (data/id)                 ; -> Get ID of current test DB
      (data/id :table)          ; -> Get ID of Table named `table` in current test DB
      (data/id :table :field)   ; -> Get ID of Field named `field` belonging to Table `table` in current test DB

     Normally this database is the `test-data` database for the current driver, and is created the first time `db` or
     `id` is called.

  2. Bind the current driver with `driver/with-driver`. Defaults to `:h2`

       (driver/with-driver :postgres
         (data/id))
       ;; -> Get ID of Postgres `test-data` database, creating it if needed

  3. Bind a different database for use with for `db` and `id` functions with `with-db`.

      (data/with-db [db some-database]
        (data/id :table :field)))
       ;; -> Return ID of Field named `field` in Table `table` in `some-db`

  4. You can use helper macros like `$ids` to replace symbols starting with `$` (for Fields) or `$$` (for Tables) with
     calls to `id` in a form:

      ($ids {:source-table $$venues, :fields [$venues.name]})
      ;; -> {:source-table (data/id :venues), :fields [(data/id :venues :name)]}

     (There are several variations of this macro; see documentation below for more details.)"
  (:require [cheshire.core :as json]
            [clojure.test :as t]
            [colorize.core :as colorize]
            [medley.core :as m]
            [metabase
             [query-processor :as qp]
             [util :as u]]
            [metabase.driver.util :as driver.u]
            [metabase.models
             [dimension :refer [Dimension]]
             [field-values :refer [FieldValues]]]
            [metabase.test.data
             [dataset-definitions :as defs]
             [impl :as impl]
             [interface :as tx]
             [mbql-query-impl :as mbql-query-impl]]
            [toucan.db :as db]))

;;; ------------------------------------------ Dataset-Independent Data Fns ------------------------------------------

;; These functions offer a generic way to get bits of info like Table + Field IDs from any of our many driver/dataset
;; combos.

(defn db
  "Return the current database.
   Relies on the dynamic variable `*get-db*`, which can be rebound with `with-db`."
  []
  (impl/*get-db*))

(defmacro with-db
  "Run body with `db` as the current database. Calls to `db` and `id` use this value."
  [db & body]
  `(impl/do-with-db ~db (fn [] ~@body)))

(defmacro $ids
  "Convert symbols like `$field` to `id` fn calls. Input is split into separate args by splitting the token on `.`.
  With no `.` delimiters, it is assumed we're referring to a Field belonging to `table-name`, which is passed implicitly
  as the first arg. With one or more `.` delimiters, no implicit `table-name` arg is passed to `id`:

    $venue_id      -> [:field-id (id :sightings :venue_id)] ; `table-name` is implicit first arg
    $cities.id     -> [:field-id (id :cities :id)]          ; specify non-default Table

  You can use the form `$source->dest` to for `fk->` forms:

    $venue_id->venues.id -> [:fk-> [:field-id (id :sightings :venue_id)] [:field-id (id :venues :id)]]

  Use `$$<table>` to refer to a Table ID:

    $$venues -> (id :venues)

  Use `%<field>` instead of `$` for a *raw* Field ID:

    %venue_id -> (id :sightings :venue_id)

  Use `*<field>` to generate appropriate an `:field-literal` based on a Field in the application DB:

    *venue_id -> [:field-literal \"VENUE_ID\" :type/Integer]

  Use `*<field>/type` to generate a `:field-literal` for an aggregation or native query result:

    *count/Integer -> [:field-literal \"count\" :type/Integer]

  Use `&<alias>.<field>` to wrap `<field>` in a `:joined-field` clause:

    &my_venues.venues.id -> [:joined-field \"my_venues\" [:field-id (data/id :venues :id)]]

  Use `!<unit>.<field>` to wrap a field in a `:datetime-field` clause:

    `!month.checkins.date` -> [:datetime-field [:field-id (data/id :checkins :date)] :month]


  For both `&` and `!`, if the wrapped Field does not have a sigil, it is handled recursively as if it had `$` (i.e.,
  it generates a `:field-id` clause); you can explicitly specify a sigil to wrap a different type of clause instead:

    `!month.*checkins.date` -> [:datetime-field [:field-literal \"DATE\" :type/DateTime] :month]

  NOTES:

    *  Only symbols that end in alphanumeric characters will be parsed, so as to avoid accidentally parsing things that
       do not refer to Fields."
  {:style/indent 1}
  ([form]
   `($ids nil ~form))

  ([table-name & body]
   (mbql-query-impl/parse-tokens table-name `(do ~@body))))

(defmacro mbql-query
  "Macro for easily building MBQL queries for test purposes.

  Cheatsheet:

  *  `$`  = wrapped Field ID
  *  `$$` = table ID
  *  `%`  = raw Field ID
  *  `*`  = field-literal for Field in app DB; `*field/type` for others
  *  `&`  = wrap in `joined-field`
  *  `!`  = wrap in `:datetime-field`

  (The 'cheatsheet' above is listed first so I can easily look at it with `autocomplete-mode` in Emacs.) This macro
  does the following:

  *  Expands symbols like `$field` into calls to `id`, and wraps them in `:field-id`. See the dox for `$ids` for
     complete details.
  *  Wraps 'inner' query with the standard `{:database (data/id), :type :query, :query {...}}` boilerplate
  *  Adds `:source-table` clause if `:source-table` or `:source-query` is not already present"
  {:style/indent 1}
  ([table-name]
   `(mbql-query ~table-name {}))

  ([table-name inner-query]
   {:pre [(map? inner-query)]}
   (as-> inner-query <>
     (mbql-query-impl/parse-tokens table-name <>)
     (mbql-query-impl/maybe-add-source-table <> table-name)
     (mbql-query-impl/wrap-inner-query <>))))

(defmacro query
  "Like `mbql-query`, but operates on an entire 'outer' query rather than the 'inner' MBQL query. Like `mbql-query`,
  automatically adds `:database` and `:type` to the top-level 'outer' query, and `:source-table` to the 'inner' MBQL
  query if not present."
  {:style/indent 1}
  ([table-name]
   `(query ~table-name {}))

  ([table-name outer-query]
   {:pre [(map? outer-query)]}
   (merge
    {:database `(id)
     :type     :query}
    (cond-> (mbql-query-impl/parse-tokens table-name outer-query)
      (not (:native outer-query)) (update :query mbql-query-impl/maybe-add-source-table table-name)))))

(defmacro native-query
  "Like `mbql-query`, but for native queries."
  {:style/indent 0}
  [inner-native-query]
  `{:database (id)
    :type     :native
    :native   ~inner-native-query})

(defmacro run-mbql-query
  "Like `mbql-query`, but runs the query as well."
  {:style/indent 1}
  [table-name & [query]]
  `(qp/process-query
     (mbql-query ~table-name ~(or query {}))))

(defn format-name
  "Format a SQL schema, table, or field identifier in the correct way for the current database by calling the driver's
  implementation of `format-name`. (Most databases use the default implementation of `identity`; H2 uses
  `clojure.string/upper-case`.) This function DOES NOT quote the identifier."
  [a-name]
  (assert ((some-fn keyword? string? symbol?) a-name)
    (str "Cannot format `nil` name -- did you use a `$field` without specifying its Table? (Change the form to"
         " `$table.field`, or specify a top-level default Table to `$ids` or `mbql-query`.)"))
  (tx/format-name (tx/driver) (name a-name)))

(defn id
  "Get the ID of the current database or one of its Tables or Fields. Relies on the dynamic variable `*get-db*`, which
  can be rebound with `with-db`."
  ([]
   (u/get-id (db)))

  ([table-name]
   (impl/the-table-id (id) (format-name table-name)))

  ([table-name field-name & nested-field-names]
   (apply impl/the-field-id (id table-name) (map format-name (cons field-name nested-field-names)))))

(defmacro dataset
  "Load and sync a temporary Database defined by `dataset`, make it the current DB (for `metabase.test.data` functions
  like `id` and `db`), and execute `body`.

  `dataset` can be one of the following:

  *  A symbol...
     *  ...naming a dataset definition in either the current namespace, or in `metabase.test.data.dataset-definitions`.

        (data/dataset sad-toucan-incidents ...)

     *  ...qualified by a namespace, naming a dataset definition in that namespace.

        (data/dataset my-namespace/my-dataset-def ...)

     *  ...naming a local binding.

       (let [my-dataset-def (get-dataset-definition)]
         (data/dataset my-dataset-def ...)

  *  An inline dataset definition:

     (data/dataset (get-dataset-definition) ...)"
  {:style/indent 1}
  [dataset & body]
  `(t/testing (colorize/magenta ~(if (symbol? dataset)
                                   (format "using %s dataset" dataset)
                                   "using inline dataset"))
     (impl/do-with-dataset ~(if (and (symbol? dataset)
                                     (not (get &env dataset)))
                              `(impl/resolve-dataset-definition '~(ns-name *ns*) '~dataset)
                              dataset)
       (fn [] ~@body))))

(defmacro with-temp-copy-of-db
  "Run `body` with the current DB (i.e., the one that powers `data/db` and `data/id`) bound to a temporary copy of the
  current DB. Tables and Fields are copied as well."
  {:style/indent 0}
  [& body]
  `(impl/do-with-temp-copy-of-db (fn [] ~@body)))

(defmacro with-temp-objects
  "Calls `data-load-fn` to create a sequence of Toucan objects, then runs `body`; finally, deletes the objects."
  [data-load-fn & body]
  `(impl/do-with-temp-objects ~data-load-fn (fn [] ~@body)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          Rarely-Used Helper Functions                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn fks-supported?
  "Does the current driver support foreign keys?"
  []
  (contains? (driver.u/features (tx/driver)) :foreign-keys))

(defn binning-supported?
  "Does the current driver support binning?"
  []
  (contains? (driver.u/features (tx/driver)) :binning))

(defn id-field-type  [] (tx/id-field-type (tx/driver)))

;; The functions below are used so infrequently they hardly belong in this namespace.

(defn dataset-field-values
  "Get all the values for a field in a `dataset-definition`.

    (dataset-field-values \"categories\" \"name\") ; -> [\"African\" \"American\" \"Artisan\" ...]"
  ([table-name field-name]
   (dataset-field-values defs/test-data table-name field-name))

  ([dataset-definition table-name field-name]
   (some
    (fn [{:keys [field-definitions rows], :as tabledef}]
      (when (= table-name (:table-name tabledef))
        (some
         (fn [[i fielddef]]
           (when (= field-name (:field-name fielddef))
             (map #(nth % i) rows)))
         (m/indexed field-definitions))))
    (:table-definitions (tx/get-dataset-definition dataset-definition)))))

(def ^:private category-names
  (delay (vec (dataset-field-values "categories" "name"))))

;; TODO - you should always call these functions with the `with-data` macro. We should enforce this
(defn create-venue-category-remapping!
  "Returns a thunk that adds an internal remapping for category_id in the venues table aliased as `remapping-name`.
  Can be used in a `with-data` invocation."
  [remapping-name]
  (fn []
    [(db/insert! Dimension {:field_id (id :venues :category_id)
                            :name     remapping-name
                            :type     :internal})
     (db/insert! FieldValues {:field_id              (id :venues :category_id)
                              :values                (json/generate-string (range 1 (inc (count @category-names))))
                              :human_readable_values (json/generate-string @category-names)})]))

(defn create-venue-category-fk-remapping!
  "Returns a thunk that adds a FK remapping for category_id in the venues table aliased as `remapping-name`. Can be
  used in a `with-data` invocation."
  [remapping-name]
  (fn []
    [(db/insert! Dimension {:field_id                (id :venues :category_id)
                            :name                    remapping-name
                            :type                    :external
                            :human_readable_field_id (id :categories :name)})]))
