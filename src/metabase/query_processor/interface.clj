(ns metabase.query-processor.interface
  "Dynamic variables, constants, and other things used across the query builder namespaces.")

;;; --------------------------------------------------- CONSTANTS ----------------------------------------------------

(def absolute-max-results
  "Maximum number of rows the QP should ever return.

   This is coming directly from the max rows allowed by Excel for now ...
   https://support.office.com/en-nz/article/Excel-specifications-and-limits-1672b34d-7043-467e-8e27-269d656771c3"
  1048576)


;;; -------------------------------------------------- DYNAMIC VARS --------------------------------------------------

(def ^:dynamic ^Boolean *disable-qp-logging*
  "Should we disable logging for the QP? (e.g., during sync we probably want to turn it off to keep logs less
  cluttered)."
  false)


(def ^:dynamic *driver*
  "The driver that will be used to run the query we are currently parsing.
   Used by `assert-driver-supports` and other places.
   Always bound when running queries the normal way, e.g. via `metabase.driver/process-query`.
   Not neccesarily bound when using various functions like `fk->` in the REPL."
  nil)


;;; ------------------------------------------------------ ETC -------------------------------------------------------

;; TODO - maybe we should move these to the `query-processor.util` namespace instead

(defn driver-supports?
  "Does the currently bound `*driver*` support FEATURE?
   (This returns `nil` if `*driver*` is unbound. `*driver*` is always bound when running queries the normal way,
   but may not be when calling this function directly from the REPL.)"
  [feature]
  (when *driver*
    ((resolve 'metabase.driver/driver-supports?) *driver* feature)))

;; `assert-driver-supports` doesn't run check when `*driver*` is unbound (e.g., when used in the REPL)
;; Allows flexibility when composing queries for tests or interactive development
(defn assert-driver-supports
  "When `*driver*` is bound, assert that is supports keyword FEATURE."
  [feature]
  (when *driver*
    (when-not (driver-supports? feature)
      (throw (Exception. (str (name feature) " is not supported by this driver."))))))
