(ns metabase.driver.interface)

(def ^:const max-sync-lazy-seq-results
  "The maximum number of values we should return when using `field-values-lazy-seq`.
   This many is probably fine for inferring special types and what-not; we don't want
   to scan millions of values at any rate."
  10000)

(def ^:const connection-error-messages
  "Generic error messages that drivers should return in their implementation of `humanize-connection-error-message`."
  {:cannot-connect-check-host-and-port "Hmm, we couldn't connect to the database. Make sure your host and port settings are correct."
   :database-name-incorrect            "Looks like the database name is incorrect."
   :invalid-hostname                   "It looks like your host is invalid. Please double-check it and try again."
   :password-incorrect                 "Looks like your password is incorrect."
   :password-required                  "Looks like you forgot to enter your password."
   :username-incorrect                 "Looks like your username is incorrect."
   :username-or-password-incorrect     "Looks like the username or password is incorrect."})

(def ^:private ^:const feature->required-fns
  "Map of optional driver features (as keywords) to a set of functions drivers that support that feature must define."
  {:foreign-keys                       #{:table-fks}
   :nested-fields                      #{:active-nested-field-name->type}
   :set-timezone                       nil
   :standard-deviation-aggregations    nil
   :unix-timestamp-special-type-fields nil})

(def ^:private ^:const optional-features
  (set (keys feature->required-fns)))

(def ^:private ^:const required-fns
  #{:can-connect?
    :active-table-names
    :active-column-names->type
    :table-pks
    :field-values-lazy-seq
    :process-query})

(def ^:private ^:const optional-fns
  #{:humanize-connection-error-message
    :sync-in-context
    :process-query-in-context
    :table-rows-seq
    :field-avg-length
    :field-percent-urls
    :driver-specific-sync-field!})

(defn verify-driver
  "Verify that a Metabase DB driver contains the expected properties and that they are the correct type."
  [{:keys [driver-name details-fields features], :as driver}]
  ;; Check :driver-name is a string
  (assert driver-name
    "Missing property :driver-name.")
  (assert (string? driver-name)
    ":driver-name must be a string.")

  ;; Check the :details-fields
  (assert details-fields
    "Driver is missing property :details-fields.")
  (assert (vector? details-fields)
    ":details-fields should be a vector.")
  (doseq [f details-fields]
    (assert (map? f)
      (format "Details fields must be maps: %s" f))
    (assert (:name f)
      (format "Details field %s is missing a :name property." f))
    (assert (:display-name f)
      (format "Details field %s is missing a :display-name property." f))
    (when (:type f)
      (assert (contains? #{:string :integer :password :boolean} (:type f))
        (format "Invalid type %s in details field %s." (:type f) f)))
    (when (:default f)
      (assert (not (:placeholder f))
        (format "Fields should not define both :default and :placeholder: %s" f))
      (assert (not (:required f))
        (format "Fields that define a :default cannot be :required: %s" f))))

  ;; Check that all required functions are defined
  (doseq [f required-fns]
    (assert (f driver)
      (format "Missing fn: %s" f))
    (assert (fn? (f driver))
      (format "Not a fn: %s" (f driver))))

  ;; Check that all features declared are valid
  (when features
    (assert (and (set? features)
                 (every? keyword? features))
      ":features must be a set of keywords.")
    (doseq [feature features]
      (assert (contains? optional-features feature)
        (format "Not a valid feature: %s" feature))
      (doseq [f (feature->required-fns feature)]
        (assert (f driver)
          (format "Drivers that support feature %s must have fn %s." feature f))
        (assert (fn? (f driver))
          (format "Not a fn: %s" f)))))

  ;; Check that the optional fns, if included, are actually fns
  (doseq [f optional-fns]
    (when (f driver)
      (assert (fn? (f driver))
        (format "Not a fn: %s" f)))))

(defmacro defdriver
  "Define and validate a new Metabase DB driver.

   All drivers must include the following keys:

#### PROPERTIES

*  `:driver-name`

    A human-readable string naming the DB this driver works with, e.g. `\"PostgreSQL\"`.

*  `:details-fields`

    A vector of maps that contain information about connection properties that should
    be exposed to the user for databases that will use this driver. This information is used to build the UI for editing
    a `Database` `details` map, and for validating it on the Backend. It should include things like `host`,
    `port`, and other driver-specific parameters. Each field information map should have the following properties:

    *  `:name`

        The key that should be used to store this property in the `details` map.

    *  `:display-name`

        Human-readable name that should be displayed to the User in UI for editing this field.

    *  `:type` *(OPTIONAL)*

       `:string`, `:integer`, `:boolean`, or `:password`. Defaults to `:string`.

    *  `:default` *(OPTIONAL)*

        A default value for this field if the user hasn't set an explicit value. This is shown in the UI as a placeholder.

    *  `:placeholder` *(OPTIONAL)*

       Placeholder value to show in the UI if user hasn't set an explicit value. Similar to `:default`, but this value is
       *not* saved to `:details` if no explicit value is set. Since `:default` values are also shown as placeholders, you
       cannot specify both `:default` and `:placeholder`.

    *  `:required` *(OPTIONAL)*

       Is this property required? Defaults to `false`.

*  `:features` *(OPTIONAL)*

    A set of keyword names of optional features supported by this driver, such as `:foreign-keys`.

#### FUNCTIONS

*  `(can-connect? [details-map])`

   Check whether we can connect to a `Database` with DETAILS-MAP and perform a simple query. For example, a SQL database might
   try running a query like `SELECT 1;`. This function should return `true` or `false`.

*  `(active-table-names [database])`

   Return a set of string names of tables, collections, or equivalent that currently exist in DATABASE.

*  `(active-column-names->type [table])`

   Return a map of string names of active columns (or equivalent) -> `Field` `base_type` for TABLE (or equivalent).

*  `(table-pks [table])`

   Return a set of string names of active Fields that are primary keys for TABLE (or equivalent).

*  `(field-values-lazy-seq [field])`

   Return a lazy sequence of all values of FIELD.
   This is used to implement `mark-json-field!`, and fallback implentations of `mark-no-preview-display-field!` and `mark-url-field!`
   if drivers *don't* implement `field-avg-length` and `field-percent-urls`, respectively.

*  `(process-query [query])`

   Process a native or structured QUERY. This function is called by `metabase.driver/process-query` after performing various driver-unspecific
   steps like Query Expansion and other preprocessing.

*  `(table-fks [table])` *(REQUIRED FOR DRIVERS THAT SUPPORT `:foreign-keys`)*

   Return a set of maps containing info about FK columns for TABLE.
   Each map should contain the following keys:

     *  `fk-column-name`
     *  `dest-table-name`
     *  `dest-column-name`

*  `(active-nested-field-name->type [field])` *(REQUIRED FOR DRIVERS THAT SUPPORT `:nested-fields`)*

   Return a map of string names of active child `Fields` of FIELD -> `Field.base_type`.

*  `(humanize-connection-error-message [message])` *(OPTIONAL)*

   Return a humanized (user-facing) version of an connection error message string.
   Generic error messages are provided in the constant `connection-error-messages`; return one of these whenever possible.

*  `(sync-in-context [database f])` *(OPTIONAL)*

   Drivers may provide this function if they need to do special setup before a sync operation such as `sync-database!`. The sync
   operation itself is encapsulated as the lambda F, which must be called with no arguments.

       (defn sync-in-context [database f]
         (with-jdbc-metadata [_ database]
           (f)))

*  `(process-query-in-context [f])` *(OPTIONAL)*

   Similar to `sync-in-context`, but for running queries rather than syncing. This should be used to do things like open DB connections
   that need to remain open for the duration of post-processing. This function follows a middleware pattern and is injected into the QP
   middleware stack immediately after the Query Expander; in other words, it will receive the expanded query.
   See the Mongo and H2 drivers for examples of how this is intended to be used.

*  `(table-rows-seq [database table-name])` *(OPTIONAL)*

   Return a sequence of all the rows in a table with a given TABLE-NAME.
   Currently, this is only used for iterating over the values in a `_metabase_metadata` table. As such, the results are not expected to be returned lazily.

*  `(field-avg-length [field])` *(OPTIONAL)*

   If possible, provide an efficent DB-level function to calculate the average length of non-nil values of textual FIELD, which is used to determine whether a `Field`
   should be marked as a `:category`. If this function is not provided, a fallback implementation that iterates over results in Clojure-land is used instead.

*  `(field-percent-urls [field])` *(OPTIONAL)*

   If possible, provide an efficent DB-level function to calculate what percentage of non-nil values of textual FIELD are valid URLs, which is used to determine
   whether a `Field` should be marked as a `:url`. If this function is not provided, a fallback implementation that iterates over results in Clojure-land is used instead.

*  `(driver-specific-sync-field! [field])` *(OPTIONAL)*

   This is a chance for drivers to do custom `Field` syncing specific to their database.
   For example, the Postgres driver can mark Postgres JSON fields as `special_type = json`.
   As with the other Field syncing functions in `metabase.driver.sync`, this method should return the modified FIELD, if any, or `nil`."
  [driver-name driver-map]
  `(def ~(vary-meta driver-name assoc :metabase.driver/driver (keyword driver-name))
     (let [m# ~driver-map]
       (verify-driver m#)
       m#)))
