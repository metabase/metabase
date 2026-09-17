(ns metabase-enterprise.transform-testing.expectations.protocol
  "The protocol every expectation type implements, and the multimethod that builds one.

  A type needing more than one round of probes is not precluded, but every round has to run inside
  the test connection, while the temp tables still exist."
  (:require
   [metabase-enterprise.transform-testing.errors :as transform-testing.errors]
   [metabase-enterprise.transform-testing.schema :as transform-testing.schema]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(defprotocol Expectation
  "One check on the output of the transform under test."
  (temp-tables [this context]
    "The queries this expectation needs materialized before its probes run, as `{id compiled-query}`.

  The runner creates each one as a temp table on the test connection and passes their names to [[probes]] as
  `:temp-tables` in its context, `{id table}`. Pure.")
  (probes [this context]
    "The queries this expectation needs, as `{probe-id {:query :params :max-rows}}`.

  `context` carries the driver, the name of the output temp table, the columns that table actually
  has, the input-table replacements, and this expectation's own [[temp-tables]] by name. Pure.")
  (interpret [this context results]
    "This expectation's result map, given `context` and `{probe-id {:rows :columns}}` from the probes.

  Always carries `:name`, `:type` and `:status`; what else it says about a failure is the type's
  own business. Pure."))

(defmulti build
  "The validated record for an already-normalized `m`, of the appropriate expectation type."
  {:arglists '([m])}
  (comp keyword :type))

(defmethod build :default
  [m]
  (mu/validate-throw ::transform-testing.schema/expectation m)
  (throw (transform-testing.errors/ex
          ::transform-testing.errors/unsupported-format
          (tru "Expectation {0} is of type {1}, which is not implemented yet."
               (pr-str (:name m)) (pr-str (:type m)))
          {:expectation (:name m) :type (:type m)})))
