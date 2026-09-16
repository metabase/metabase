(ns metabase.transform-testing.expectations.protocol
  "The protocol every expectation type implements, and the multimethod that builds one.

  A type needing more than one round of probes is not precluded, but every round has to run inside
  the test connection, while the temp tables still exist.")

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
  (interpret [this results]
    "This expectation's result map, given `{probe-id {:rows :columns}}` from the probes.

  Always carries `:name`, `:type` and `:status`; what else it says about a failure is the type's
  own business. Pure."))

(defmulti build
  "The record for one already-normalized, already-validated expectation `m`, from the type that owns it."
  {:arglists '([m])}
  (comp keyword :type))
