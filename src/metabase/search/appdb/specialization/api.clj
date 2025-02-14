(ns metabase.search.appdb.specialization.api
  (:require
   [metabase.db :as mdb]))

(defn- db-type [& _] (mdb/db-type))

(defmulti table-schema
  "The HoneySQL definition for the shape of the index table for this appdb."
  {:arglists '([base-schema])}
  db-type)

(defmulti post-create-statements
  "Any SQL statements that should be issued after the table is created, e.g. to create indexes."
  {:arglists '([unique-prefix table-name])}
  db-type)

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
