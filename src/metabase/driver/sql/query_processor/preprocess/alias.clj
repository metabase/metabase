(ns metabase.driver.sql.query-processor.preprocess.alias
  (:require [metabase.driver :as driver]
            [metabase.mbql.schema :as mbql.s]
            [metabase.mbql.util :as mbql.u]
            [metabase.query-processor.store :as qp.store]
            [metabase.util.schema :as su]
            [schema.core :as s]))

(defmulti prefix-field-alias
  "Create a Field alias by combining a `prefix` string with `field-alias` string (itself is the result of the
  `field->alias` method). The default implementation just joins the two strings with `__` -- override this if you need
  to do something different."
  {:arglists '([driver prefix field]), :added "0.38.1"}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod prefix-field-alias :sql
  [_ prefix field-alias]
  (str prefix "__" field-alias))

(defmulti ^String field->alias
  "Return the string alias that should be used to for `field`, an instance of the Field model, i.e. in an `AS` clause.
  The default implementation calls `:name`, which returns the *unqualified* name of the Field.
  Return `nil` to prevent `field` from being aliased."
  {:arglists '([driver field])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod field->alias :sql
  [_ field]
  (:name field))

(s/defn ^:private unambiguous-field-alias :- su/NonBlankString
  [driver [_ field-id {:keys [join-alias]}] :- mbql.s/field:id]
  (let [field-alias (field->alias driver (qp.store/field field-id))]
    (if (and join-alias field-alias
             #_(not= join-alias *table-alias*)
             #_(not *joined-field?*))
      (prefix-field-alias driver join-alias field-alias)
      field-alias)))

(defmulti clause-alias
  {:arglists '([driver clause])}
  (fn [driver clause]
    [(driver/dispatch-on-initialized-driver driver) (mbql.u/dispatch-by-clause-name-or-class clause)])
  :hierarchy #'driver/hierarchy)

(defmethod clause-alias [:sql :expression]
  [_ [_ expression-name]]
  expression-name)

(defmethod clause-alias [:sql :field]
  [driver [_ name-or-id :as field-clause]]
  (if (string? name-or-id)
    name-or-id
    (unambiguous-field-alias driver field-clause)))

(defmethod clause-alias [:sql :aggregation-options]
  [_ [_ _ {ag-name :name}]]
  ag-name)
