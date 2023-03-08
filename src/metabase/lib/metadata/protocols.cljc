(ns metabase.lib.metadata.protocols
  (:require
   [metabase.shared.util.i18n :as i18n]
   #?@(:clj
       ([potemkin :as p]
        [pretty.core :as pretty]))))

(#?(:clj p/defprotocol+ :cljs defprotocol) DatabaseMetadataProvider
  "Protocol for something that we can get information about Tables and Fields from. This can be provided in various ways
  various ways:

  1. By raw metadata attached to the query itself

  2. By the application database in Clj code

  3. By the Query Processor store in Clj code

  4. By the Redux store in JS

  5. By (hopefully cached) REST API calls

  This protocol is pretty limited at this point; in the future, we'll probably want to add:

  - methods to facilitate more fine-grained access in the future, such as methods that let us fetch more limited info
    about a large number of objects, then other methods to let you fetch more complete information for a single object
    once you make a selection. E.g. the first method might be used to power a list of Tables to choose from to join
    against, then once you choose a Table we hit the second method to get more info about it

  - methods for searching for Tables or Fields matching some string

  - paging, so if you have 10k Tables we don't do crazy requests that fetch them all at once

  But things like fine grained-access and search can be implemented with just the basic `tables` and `fields`
  methods for the time being, so we don't need to figure out all of this stuff upfront."
  (database [this]
    "Metadata about the Database we're querying. Should match the [[metabase.lib.metadata/DatabaseMetadata]] schema.
  This includes important info such as the supported `:features` and the like.")
  (tables [this]
    "Return a sequence of Tables in this Database. Tables should satisfy the [[metabase.lib.metadata/TableMetadata]]
  schema. This should also include things that serve as 'virtual' tables, e.g. Saved Questions or Models. But users of
  MLv2 should not need to know that! If we add support for Super Models or Quantum Questions in the future, they can
  just come back from this method in the same shape as everything else, the Query Builder can display them, and the
  internals can be tucked away here in MLv2.")
  (fields [this table-id]
    "Return a sequence of Fields associated with a Table with the given `table-id`. Fields should satisfy
  the [[metabase.lib.metadata/ColumnMetadata]] schema. If no such Table exists, this should error."))

(defn database-metadata-provider?
  "Whether `x` is a valid [[DatabaseMetadataProvider]]."
  [x]
  (satisfies? DatabaseMetadataProvider x))

(defrecord ^{:doc "A simple implementation of [[DatabaseMetadataProvider]] that returns data from a complete graph
  e.g. the response provided by `GET /api/database/:id/metadata`."} SimpleGraphDatabaseMetadataProvider [metadata]
  DatabaseMetadataProvider
  (database [_this]
    (dissoc metadata :tables))

  (tables [_this]
    (for [table (:tables metadata)]
      (dissoc table :fields)))

  (fields [_this table-id]
    (or (some (fn [table]
                (when (= (:id table) table-id)
                  (:fields table)))
              (:tables metadata))
        (throw (ex-info (i18n/tru "Cannot find Table {0}" (pr-str table-id))
                        {:table-id     table-id
                         :valid-tables (map #(select-keys % [:name :id])
                                            (:tables metadata))}))))
  #?@(:clj
      [pretty/PrettyPrintable
       (pretty [_this]
               ;; don't actually print the whole thing because it's going to make my eyes bleed to see all
               ;; of [[metabase.lib.test-metadata]] every single time a test fails
               `SimpleGraphDatabaseMetadataProvider)]))
