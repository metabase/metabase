(ns metabase.driver.sql.query-processor.deprecated
  "Deprecated stuff that used to live in [[metabase.driver.sql.query-processor]]. Moved here so it can live out its last
  days in a place we don't have to look at it, and to discourage people from using it. Also convenient for seeing
  everything that's deprecated at a glance.

  Deprecated method impls should call [[log-deprecation-warning]] to gently nudge driver authors to stop using this
  method."
  (:require [clojure.tools.logging :as log]
            [metabase.driver :as driver]
            [metabase.query-processor.store :as qp.store]
            [metabase.query-processor.util.add-alias-info :as add]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs]]))

;; TODO -- this is actually pretty handy and I think we ought to use it for all the deprecated driver methods.
(defn log-deprecation-warning
  "Log a warning about usage of a deprecated method.

    (log-deprecation-warning driver 'my.namespace/method \"v0.42.0\")"
  [driver method-name deprecated-version]
  (letfn [(thunk []
            (log/warn
             (u/colorize 'red
               (trs "Warning: Driver {0} is using {1}. This method was deprecated in {2} and will be removed in a future release."
                    driver method-name deprecated-version))))]
    ;; only log each individual message once for the current QP store; by 'caching' the value with the key it is
    ;; effectively memoized for the rest of the QP run for the current query. The goal here is to avoid blasting the
    ;; logs with warnings about deprecated method calls, but still remind people regularly enough that it gets fixed
    ;; sometime in the near future.
    (if (qp.store/initialized?)
      (qp.store/cached [driver method-name deprecated-version]
        (thunk))
      (thunk))))

;;; DEPRECATED in 41

(defmulti ^String field->alias
  "Returns an escaped alias for a Field instance `field`.

  DEPRECATED as of x.41. This method is no longer used by the SQL QP itself, but is still available for existing code
  already using it. This multimethod will be removed in a future release.

  Drivers that need to access this information can look at the
  `:metabase.query-processor.util.add-alias-info/desired-alias` information in the
  `:field`/`:expression`/`:aggregation` options map. See [[metabase.query-processor.util.add-alias]] for more
  information.

  Drivers that need to customize the aliases used can override the [[metabase.driver/escape-alias]] multimethod, or
  change the values of `:metabase.query-processor.util.add-alias-info/desired-alias` or
  `:metabase.query-processor.util.add-alias-info/source-alias` in the appropriate [[->honeysql]] methods."
  {:arglists '([driver field]), :deprecated "0.41.0"}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod field->alias :sql
  [driver [_ _ {::add/keys [desired-alias]} :as field]]
  (log-deprecation-warning driver 'metabase.driver.sql.query-processor/field->alias "v0.41.0")
  (or desired-alias
      (driver/escape-alias driver (:name field))))


;;; DEPRECATED IN 42

(def ^:dynamic ^{:deprecated "0.42.0"} *field-options*
  "DEPRECATED (unused) in 0.42.0. Binding this var has no effect.

  If you need to track `:field` options for one reason or another, you can create and bind your own dynamic variable
  for doing so. See [[metabase.driver.sqlserver]] for an example.

  This var will be removed in a future release."
  nil)

(def ^:dynamic ^{:deprecated "0.42.0"} *table-alias*
  "The alias, if any, that should be used to qualify Fields when building the HoneySQL form, instead of defaulting to
  schema + Table name. Used to implement things like joined `:field`s.

  DEPRECATED (unused) in 0.42.0+. Instead of using this, use or override `::add/source-table` in the
  `:field`/`:expression`/`:aggregation` options."
  nil)

(def ^:dynamic ^{:deprecated "0.42.0"} *source-query*
  "The source-query in effect.  Used when the query processor might need to distinguish between the type of the source
  query (ex: to provide different behavior depending on whether the source query is from a table versus a subquery).

  DEPRECATED -- use [[metabase.driver.sql.query-processor/*inner-query*]] instead, which does the same thing but it
  always bound even if we are not in a source query."
  nil)

(defmulti field->identifier
  "DEPRECATED: Unused in 0.42.0+; this functionality is now handled
  by [[metabase.driver.sql.query-processor/->honeysql]]. Implementing this method has no effect. This method will be
  removed in a future release."
  {:arglists '([driver field]), :deprecated "0.42.0"}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmulti escape-alias
  "DEPRECATED -- this has been moved to [[metabase.driver/escape-alias]]."
  {:added "0.41.0", :deprecated "0.42.0", :arglists '([driver column-alias-name])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod escape-alias :sql
  [driver column-alias-name]
  ((get-method driver/escape-alias ::driver/driver) driver column-alias-name))

;; this method impl is only here to add a little bit of magic so we use the deprecated [[escape-alias]] method above, if
;; an impl for it exists. This method impl can be removed entirely when we get rid of [[escape-alias]].
(defmethod driver/escape-alias :sql
  [driver column-alias-name]
  (when-not (= (get-method escape-alias driver)
               (get-method escape-alias :sql))
    (log-deprecation-warning driver 'metabase.driver.sql.query-processor/escape-alias "0.42.0"))
  (escape-alias driver column-alias-name))

(defmulti prefix-field-alias
  "DEPRECATED and no longer used in 0.42.0. Previously, this method was used to tell the SQL QP how to combine to
  strings in order to generate aliases for columns coming from joins. Its primary use was to escape the resulting
  identifier if needed.

  In Metabase 0.42.0+ you can implement [[metabase.driver/escape-alias]] instead, which is now called when such an
  alias is generated."
  {:arglists '([driver prefix column-alias]), :added "0.38.1", :deprecated "0.42.0"}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod prefix-field-alias :sql
  [driver prefix column-alias]
  (log-deprecation-warning driver 'metabase.driver.sql.query-processor/prefix-field-alias "0.42.0")
  (add/prefix-field-alias prefix column-alias))
