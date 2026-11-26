(ns metabase.query-processor.card-writes
  "The multimethods by which the query processor writes the Cards it runs, which the Card model, whose namespace
  requires the query processor, implements with its own write functions.")

(defmulti touch-last-used!
  "Move `last_used_at` of each row of `model` in `id->timestamp` forward to its timestamp, in one plain statement."
  {:arglists '([model id->timestamp])}
  (fn [model _id->timestamp] model))

(defmulti save-result-metadata!
  "Store `metadata`, the result metadata of a run, as the `result_metadata` of the row of `model` with `id`."
  {:arglists '([model id metadata])}
  (fn [model _id _metadata] model))
