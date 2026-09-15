(ns metabase.transform-testing.expectations.protocol
  "The protocol every expectation type implements.

  A type needing more than one round of probes is not precluded, but every round has to run inside
  the test connection, while the temp tables still exist.")

(set! *warn-on-reflection* true)

(defprotocol Expectation
  "One check on the output of the transform under test."
  (probes [this context]
    "The queries this expectation needs, as `{probe-id {:query :params :max-rows}}`.

  `context` carries the driver, the name of the output temp table, the columns that table actually
  has, and the input-table replacements. Pure.")
  (interpret [this results]
    "This expectation's result map, given `{probe-id rows}` from the probes.

  Always carries `:name`, `:type` and `:status`; what else it says about a failure is the type's
  own business. Pure."))
