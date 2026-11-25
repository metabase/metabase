(ns metabase.search.appdb.specialization.api
  (:require
   [metabase.app-db.core :as mdb]))

(defn- db-type [& _] (mdb/db-type))

(defmulti table-schema
  "The HoneySQL definition for the shape of the index table for this appdb."
  {:arglists '([base-schema])}
  db-type)

(defmulti table-options
  "Options for the statement that creates the index table, such as MySQL's storage engine and collation."
  {:arglists '([])}
  db-type)

(defmethod table-options :default [] {})

(defmulti with-table-creation-settings
  "Call `thunk`, which creates an index table, with any session settings the table needs."
  {:arglists '([thunk])}
  db-type)

(defmethod with-table-creation-settings :default [thunk] (thunk))

(defmulti post-create-statements
  "Any SQL statements that should be issued after the table is created, e.g. to create indexes."
  {:arglists '([unique-prefix table-name])}
  db-type)

(defmulti table-abandoned?
  "Whether the index table `table-name` lacks some of what [[post-create-statements]] creates, and the creation that
  left it so has stopped.
  A database that creates the table and its indexes atomically never abandons one."
  {:arglists '([table-name])}
  db-type)

(defmethod table-abandoned? :default [_table-name] false)

(defmulti base-query
  "Generate the basic shape of the index table query, to be augmented with rankers and filters."
  {:arglists '([table-name search-term search-ctx select-items])}
  db-type)

(defmulti batch-upsert!
  "Insert or update multiple entries in the index table."
  {:arglists '([table-name entries])}
  db-type)

(defmulti extra-entry-fields
  "Populate additional fields only present for this database driver's index table"
  {:arglists '([entity])}
  db-type)

(defmulti text-score
  "The HoneySQL expression used to calculate a text score for the given entry."
  {:arglists '([search-ctx])}
  db-type)

(defmulti view-count-percentile-query
  "Calculate the given p-value of view counts for each search model"
  {:arglists '([index-table p-value])}
  db-type)

(defmulti analyze-table!
  "Refresh statistics for the given table so [[index-size-estimate]] reflects a newly populated index.
  MySQL skips this inside transactions to avoid committing caller writes.
  Databases with exact estimates need no refresh."
  {:arglists '([table-name])}
  db-type)

(defmethod analyze-table! :default [_table-name] nil)

(defmulti index-size-estimate
  "An estimated row count for the index `table-name`, ideally without scanning the whole table (used for the
  `metabase_search_appdb_index_size` metric, which is scraped frequently)."
  {:arglists '([table-name])}
  db-type)
