(ns metabase.driver.workarounds
  "Driver specific workarounds. These extensions points should not normally be
  used, as the default implementations cover normal drivers."
  (:require [metabase.db.metadata-queries :as metadata-queries]
            [metabase.driver :as driver]))

(defmulti table-rows-sample
  "Processes a sample of rows produced by `driver`, from the `table`'s `fields`
  using the query result processing function `rff`.
  The default implementation runs a row sampling MBQL query using the regular
  query processor to produce the sample rows.
  `opts` is a map that may contain additional parameters:
  `:truncation-size`: size to truncate text fields to if the driver supports
  expressions."
  {:arglists '([driver table fields rff opts]), :style/indent 1}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod table-rows-sample :default
  [_driver table fields rff opts]
  (metadata-queries/table-rows-sample table fields rff opts))
