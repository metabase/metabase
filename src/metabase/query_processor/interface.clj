(ns metabase.query-processor.interface
  "Dynamic variables, constants, and other things used across the query builder namespaces.")
;; TODO - Not 100% sure we really need this namespace since it's almost completely empty these days. Seems like the
;; things here could be moved elsewhere

;; TODO - I think this could go in the `limit` namespace
(def absolute-max-results
  "Maximum number of rows the QP should ever return.

   This is coming directly from the max rows allowed by Excel for now ...
   https://support.office.com/en-nz/article/Excel-specifications-and-limits-1672b34d-7043-467e-8e27-269d656771c3"
  1048576)

;; TODO - maybe we should do this more generally with the help of a macro like `do-with-suppressed-output` from the
;; test utils, perhaps implemented as separate middleware (and using a `:middleware` option). Or perhaps even make QP
;; log level an option so you could do debug individual queries
(def ^:dynamic ^Boolean *disable-qp-logging*
  "Should we disable logging for the QP? (e.g., during sync we probably want to turn it off to keep logs less
  cluttered)."
  false)

(def ^:dynamic *driver*
  "The driver that will be used to run the query we are currently parsing.
   Always bound when running queries the normal way, e.g. via `metabase.driver/process-query`.
   Not neccesarily bound when using various functions like `fk->` in the REPL."
  nil)
