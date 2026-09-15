(ns metabase.transform-testing.expectations.protocol
  "The protocol every expectation type implements.

  Its own namespace because each implementation has to require it, so it cannot live alongside the
  front door that requires the implementations.

  Both methods are pure. The runner executes what [[probes]] asks for and hands the rows to
  [[interpret]], which keeps warehouse I/O in `executor` instead of scattering it across the
  expectation types. A type needing more than one round is not precluded, but every round has to
  run inside the test connection, while the temp tables still exist.")

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
