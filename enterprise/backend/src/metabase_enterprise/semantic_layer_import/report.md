# The report

`convert!` returns a map (`::report`, in `core.clj`), every entry of which says what `:kind` of content it is about:

- `:out-dir`, the directory written to;
- `:converted`, one entry per metric written (`::converted`, which dispatches on `:kind`; `:metric` is the only kind
  today): `{:kind :name :entity-id :path :notes :unsupported-dimensions}`, the metric's name, the card's `entity_id`,
  the YAML file relative to `:out-dir`, the metric's notes, and the dimensions that could not become curated dimensions,
  each `{:name :reason}`. A note says where the metric agrees with the source only under some conditions, read off the
  finished query so that every way of writing the case is caught: a cumulative metric is a running total across whatever
  it is broken out by, so it is right only with its time dimension as the finest breakout, and a metric that buckets
  anything by week starts its weeks on the instance's first day of the week (see [the caveat on weeks](sql.md#weeks));
- `:unsupported`, one `{:kind :name :reason}` per entry that could not be converted;
- `:errors`, one `{:kind :name :unique-id :message}` per entry the import itself failed on: an unexpected exception,
  which is a bug or an input the import did not anticipate, rather than something the source can say that Metabase
  cannot. The message names the exception. A table the source could not parse is listed with `:kind :table`.

Nothing is silently dropped, and one bad entry does not stop the run: an unexpected exception is logged with its stack
and listed under `:errors`. A ratio or derived metric over a metric that was reported, or errored, is reported too,
with that metric's reason (`metric "x" was not converted: ...`), whichever stage reported it; one over a metric that
refers to itself is reported the same way, with the cycle's reason.

The files are written to a staging directory under `:out-dir` first and swapped into place only once all of them are
written, so a failure part-way (the exception carries the paths written so far and the one that failed) leaves the
previous run's files as they were. A run in which nothing converted writes nothing and leaves `:out-dir` alone, and
says so in the log; its report has an empty `:converted`.
