(ns metabase.driver.sync.fingerprint
  "Driver specific behavior related to fingerprinting operations."
  (:require [metabase.db.metadata-queries :as metadata-queries]
            [metabase.driver :as driver]))

(defmulti ^:private table-rows-sample
  "Produces a sample of rows using the given `driver`, from the given `table`'s `fields`.  The default implementation
  runs a row sampling MBQL query through the regular qp, and passes the `rff` into that, but other drivers may
  occasionally need different logic.  `opts` is an optional map that may contain additional parameters (see below).

  Note to driver developers: you should almost certainly NOT implement this method.  99% of the time, generating and
  running a regular MBQL query to fingerprint fields is the right thing to do for sampling rows.

  `opts` parameters:
  `:truncation-size`: [optional] size to truncate text fields if the driver supports expressions"
  {:arglists '([driver table fields rff opts]), :style/indent 1}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod table-rows-sample :default [_driver & args]
  (apply metadata-queries/table-rows-sample args))
