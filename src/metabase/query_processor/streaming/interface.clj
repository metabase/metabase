(ns metabase.query-processor.streaming.interface
  (:require [potemkin.types :as p.types]))

(defmulti stream-options
  "Options for the streaming response for this specific stream type. See `metabase.async.streaming-response` for all
  available options."
  {:arglists '([export-format])}
  keyword)

(p.types/defprotocol+ StreamingResultsWriter
  "Protocol for the methods needed to write streaming QP results. This protocol is a higher-level interface to intended
  to have multiple implementations."
  (begin! [this initial-metadata]
    "Write anything needed before writing the first row. `initial-metadata` is incomplete metadata provided before
    rows begin reduction; some metadata such as insights won't be available until we finish.")

  (write-row! [this row row-num]
    "Write a row. `row` is a sequence of values in the row. `row-num` is the zero-indexed row number.")

  (finish! [this final-metadata]
    "Write anything needed after writing the last row. `final-metadata` is the final, complete metadata available
    after reducing all rows. Very important: This method *must* `.close` the underlying OutputStream when it is
    finshed."))

(defmulti streaming-results-writer
  "Given a `export-format` and `java.io.Writer`, return an object that implements `StreamingResultsWriter`."
  {:arglists '(^metabase.query_processor.streaming.interface.StreamingResultsWriter [export-format ^java.io.OutputStream os])}
  (fn [export-format _] (keyword export-format)))
