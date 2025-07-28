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
  (:require
   [clojure.set :as set]
   [clojure.test :as t]
   [colorize.core :as colorize]
   [mb.hawk.init :as hawk.init]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.schema-migrations-test.impl :as schema-migrations-test.impl]
   [metabase.driver :as driver]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.driver.util :as driver.u]
   [metabase.lib-be.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.query-processor :as qp]
   [metabase.test.data.env :as tx.env]
   [metabase.test.data.impl :as data.impl]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.mbql-query-impl :as mbql-query-impl]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [next.jdbc]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------ Dataset-Independent Data Fns ------------------------------------------

;; These functions offer a generic way to get bits of info like Table + Field IDs from any of our many driver/dataset
;; combos.

(mu/defn db :- [:map
                [:id       ::lib.schema.id/database]
                [:engine   :keyword]
                [:name     :string]
                [:settings [:map
                            [:database-source-dataset-name :string]]]]
  "Return the current database.
   Relies on the dynamic variable [[metabase.test.data.impl/*db-fn*]], which can be rebound with [[with-db]]."
  []
  (data.impl/db))

(defmacro with-db
  "Run body with `db` as the current database. Calls to `db` and `id` use this value."
  [db & body]
  `(data.impl/do-with-db ~db (^:once fn* [] ~@body)))

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

  Use `*<field>` to generate a `:field` with a string name based on a Field in the application DB:

    *venue_id -> [:field \"VENUE_ID\" {:base-type :type/Integer}]

  Use `*<field>/type` to generate a `:field` with a string name for an aggregation or native query result:

    *count/Integer -> [:field \"count\" {:base-type :type/Integer}]

  Use `&<alias>.<field>` to add `:join-alias` information to a `<field>` clause:

    &my_venues.venues.id -> [:field (data/id :venues :id) {:join-alias \"my_venues\"}]

  Use `!<unit>.<field>` to add `:temporal-unit` information to a `:field` clause:

    `!month.checkins.date` -> [:field (data/id :checkins :date) {:temporal-unit :month}]


  For both `&` and `!`, if the wrapped Field does not have a sigil, it is handled recursively as if it had `$` (i.e.,
  it generates a `:field` ID clause); you can explicitly specify a sigil to wrap a different type of clause instead:

    `!month.*checkins.date` -> [:field \"DATE\" {:base-type :type/DateTime, :temporal-unit :month}]

  NOTES:

    *  Only symbols that end in alphanumeric characters will be parsed, so as to avoid accidentally parsing things that
       do not refer to Fields."
  {:style/indent :defn}
  ([form]
   `($ids nil ~form))

  ([table-name & body]
   (mbql-query-impl/parse-tokens table-name `(do ~@body))))

(defmacro mbql-query
  "Macro for easily building MBQL queries for test purposes.

  *  `$`  = `:field` clause wrapping Field ID
  *  `$$` = table ID
  *  `%`  = raw Field ID
  *  `*`  = `:field` clause wrapping Field name for a Field in app DB; use `*field/type` for others
  *  `&`  = include `:join-alias`
  *  `!`  = bucket by `:temporal-unit`

  (The 'cheatsheet' above is listed first so I can easily look at it with `autocomplete-mode` in Emacs.) This macro
  does the following:

  *  Expands symbols like `$field` into calls to `id`, and wraps them in `:field-id`. See the dox for [[$ids]] for
     complete details.
  *  Wraps 'inner' query with the standard `{:database (data/id), :type :query, :query {...}}` boilerplate
  *  Adds `:source-table` clause if `:source-table` or `:source-query` is not already present"
  {:style/indent :defn}
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

(declare id)

(defn native-query
  "Like `mbql-query`, but for native queries."
  [inner-native-query]
  {:database (id)
   :type     :native
   :native   inner-native-query})

(defn run-mbql-query* [query]
  ;; catch the Exception and rethrow with the query itself so we can have a little extra info for debugging if it fails.
  (try
    (qp/process-query query)
    (catch Throwable e
      (throw (ex-info (ex-message e)
                      {:query query}
                      e)))))

(defmacro run-mbql-query
  "Like `mbql-query`, but runs the query as well."
  {:style/indent :defn}
  [table-name & [query]]
  `(run-mbql-query* (mbql-query ~table-name ~(or query {}))))

(def ^:private FormattableName
  [:or
   :keyword
   :string
   :symbol
   [:fn
    {:error/message (str "Cannot format `nil` name -- did you use a `$field` without specifying its Table? "
                         "(Change the form to `$table.field`, or specify a top-level default Table to "
                         "`$ids` or `mbql-query`.)")}
    (constantly false)]])

(mu/defn format-name :- :string
  "Format a SQL schema, table, or field identifier in the correct way for the current database by calling the current
  driver's implementation of [[ddl.i/format-name]]. (Most databases use the default implementation of `identity`; H2
  uses [[clojure.string/upper-case]].) This function DOES NOT quote the identifier."
  [a-name :- FormattableName]
  (ddl.i/format-name (tx/driver) (name a-name)))

(defn id
  "Get the ID of the current database or one of its Tables or Fields. Relies on the dynamic
  variable [[metabase.test.data.impl/*db-fn*]], which can be rebound with [[with-db]]."
  ([]
   (hawk.init/assert-tests-are-not-initializing "(mt/id ...) or (data/id ...)")
   (data.impl/db-id))

  ([table-name]
   (data.impl/the-table-id (id) (format-name table-name)))

  ([table-name field-name & nested-field-names]
   (apply data.impl/the-field-id (id table-name) (map format-name (cons field-name nested-field-names)))))

(defn metadata-provider
  "Get a metadata-provider for the current database."
  []
  (lib.metadata.jvm/application-database-metadata-provider (id)))

(defmacro dataset
  "Create a database and load it with the data defined by `dataset`, then do a quick metadata-only sync; make it the
  current DB (for [[metabase.test.data]] functions like [[id]] and [[db]]), and execute `body`.

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
  {:style/indent :defn}
  [dataset & body]
  `(t/testing (colorize/magenta ~(str (if (symbol? dataset)
                                        (format "using %s dataset" dataset)
                                        "using inline dataset")
                                      \newline))
     (data.impl/do-with-dataset ~(if (and (symbol? dataset)
                                          (not (get &env dataset)))
                                   `(data.impl/resolve-dataset-definition '~(ns-name *ns*) '~dataset)
                                   dataset)
                                (^:once fn* [] ~@body))))

(defmacro with-temp-copy-of-db
  "Run `body` with the current DB (i.e., the one that powers `data/db` and `data/id`) bound to a temporary copy of the
  current DB. Tables and Fields are copied as well."
  {:style/indent 0}
  [& body]
  `(data.impl/do-with-temp-copy-of-db (^:once fn* [] ~@body)))

(def h2-app-db-script
  "To save time during tests, instead of running all migrations for each new empty H2 app db, we perform the
  migrations once and dump the schema into a script. Subsequently, this script can be used to instantiate new copies
  of H2 app db. The result is a dereffable temp file."
  (delay
    (schema-migrations-test.impl/with-temp-empty-app-db [conn :h2]
      ;; since the actual group defs are not dynamic, we need with-redefs to change them here
      (with-redefs [perms-group/all-users (#'perms-group/magic-group perms-group/all-users-magic-group-type)
                    perms-group/admin     (#'perms-group/magic-group perms-group/admin-magic-group-type)]
        (mdb/setup-db! :create-sample-content? false)
        (let [f (java.io.File/createTempFile "db-export" ".sql")]
          (next.jdbc/execute! conn ["SCRIPT TO ?" (str f)])
          f)))))

(defmacro with-empty-h2-app-db!
  "Runs `body` under a new, blank, H2 application database (randomly named), in which all model tables have been
  created from `h2-app-db-script`. After `body` is finished, the original app DB bindings are restored.

  Makes use of functionality in the [[metabase.app-db.schema-migrations-test.impl]] namespace since that already does what
  we need."
  {:style/indent 0}
  [& body]
  `(schema-migrations-test.impl/with-temp-empty-app-db [conn# :h2]
     (next.jdbc/execute! conn# ["RUNSCRIPT FROM ?" (str @h2-app-db-script)])
     (mdb/finish-db-setup!)
     ~@body))

;; Non-"normal" timeseries drivers are tested in [[metabase.timeseries-query-processor-test]] and elsewhere
(def timeseries-drivers
  "Drivers that are so weird that we can't use the standard dataset loading against them."
  #{:druid :druid-jdbc})

(mr/def ::driver-selector
  [:map {:closed true}
   [:+features {:optional true} [:sequential :keyword]]
   [:-features {:optional true} [:sequential :keyword]]
   [:+conn-props {:optional true} [:sequential :string]]
   [:-conn-props {:optional true} [:sequential :string]]
   [:+parent {:optional true} :keyword]
   [:+fns {:optional true} [:sequential [:function [:=> [:cat :keyword] :any]]]]
   [:-fns {:optional true} [:sequential [:function [:=> [:cat :keyword] :any]]]]])

(mu/defn driver-select :- [:set :keyword]
  "Select drivers to be tested.

   +features - a list of features that the drivers should support.
   -features - a list of features that drivers should not support.

   +conn-props - a list of connection-property names that drivers should have.
   -conn-props - a list of connection-property names that drivers should not have.

   +parent - only include drivers whose parent is this.
   -parent - do not include drivers whose parent is this.

   +fns - only include drivers that returns truthy for each fn `(fn driver)`.
   -fns - exclude drivers that returns truthy for any fn `(fn driver)`."
  ([]
   (driver-select {}))
  ([{:keys [+features -features -fns +fns +conn-props -conn-props +parent] :as selector} :- ::driver-selector]
   (hawk.init/assert-tests-are-not-initializing (pr-str (list* 'driver-select selector)))
   (set
    (for [driver (tx.env/test-drivers)
          :let [driver (tx/the-driver-with-test-extensions driver)
                conn-prop-names (when (or (seq +conn-props) (seq -conn-props))
                                  (into #{} (map :name (driver/connection-properties driver))))]
          :when (driver/with-driver driver
                  (let [the-db (delay (db))]
                    (cond-> true
                      +parent
                      (and (isa? driver/hierarchy (driver/the-driver driver) (driver/the-driver +parent)))

                      (seq +fns)
                      (and (every? (fn [f] (f driver)) +fns))

                      (seq -fns)
                      (and (not (some (fn [f] (f driver)) -fns)))

                      (seq +conn-props)
                      (and (set/superset? conn-prop-names (set +conn-props)))

                      (seq -conn-props)
                      (and (empty? (set/intersection conn-prop-names (set -conn-props))))

                      (seq +features)
                      (and (every? #(driver.u/supports? driver % @the-db) +features))

                      (seq -features)
                      (and (not (some #(driver.u/supports? driver % @the-db) -features))))))]
      driver))))

(mu/defn normal-driver-select :- [:set :keyword]
  "Select drivers to be tested. Excludes timeseries drivers because they can only be tested with special datasets.

   +features - a list of features that the drivers should support.
   -features - a list of features that drivers should not support.

   +conn-props - a list of connection-property names that drivers should have.
   -conn-props - a list of connection-property names that drivers should not have.

   +parent - only include drivers whose parent is this.

   +fns - only include drivers that returns truthy for each fn `(f driver)`.
   -fns - exclude drivers that returns truthy for any fn `(f driver)`."
  ([]
   (normal-driver-select {}))
  ([selector :- ::driver-selector]
   (driver-select (update selector :-fns (fnil conj []) #(contains? timeseries-drivers %)))))
