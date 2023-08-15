(ns metabase.driver.sql.query-processor.deprecated
  "Deprecated stuff that used to live in [[metabase.driver.sql.query-processor]]. Moved here so it can live out its last
  days in a place we don't have to look at it, and to discourage people from using it. Also convenient for seeing
  everything that's deprecated at a glance.

  Deprecated method impls should call [[log-deprecation-warning]] to gently nudge driver authors to stop using this
  method."
  (:require
   [honeysql.core :as hsql]
   [honeysql.format :as hformat]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [potemkin :as p]
   [pretty.core :as pretty]))

(set! *warn-on-reflection* true)

;;; This is unused at this moment in time but we can leave it around in case we want to use it again in the
;;; future (likely). See the code at `v0.45.0` for example where we were using this a lot

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

(p/deftype+ ^{:deprecated "0.46.0"} SQLSourceQuery [sql params]
  hformat/ToSql
  (to-sql [_]
    (dorun (map hformat/add-anon-param params))
    sql)

  pretty/PrettyPrintable
  (pretty [_]
    #_{:clj-kondo/ignore [:deprecated-var]}
    (list `->SQLSourceQuery sql params))

  Object
  (equals [_ other]
    #_{:clj-kondo/ignore [:deprecated-var]}
    (and (instance? SQLSourceQuery other)
         (= sql    (.sql ^SQLSourceQuery other))
         (= params (.params ^SQLSourceQuery other)))))

(defn format-honeysql-1
  "Compile a `honeysql-form` map to a vector of `[sql & params]` with Honey SQL 1. `quote-style` is something like
  `:ansi` or `:mysql`."
  {:deprecated "0.46.0"}
  [quote-style honeysql-form]
  (let [f (if (and (vector? honeysql-form)
                   (keyword? (first honeysql-form)))
            hsql/format-predicate
            hsql/format)]
    (binding [hformat/*subquery?* false]
      (f honeysql-form
         :quoting             quote-style
         :allow-dashed-names? true))))
