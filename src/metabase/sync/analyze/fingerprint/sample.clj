(ns metabase.sync.analyze.fingerprint.sample
  "Analysis sub-step that fetches a sample of rows for a given Table and some set of Fields belonging to it, which is
   used to generate fingerprints for those Fields. Currently this is dumb and just fetches a contiguous sequence of
   rows, but in the future we plan to make this more sophisticated and have different types of samples for different
   Fields, or do a better job getting a more-random sample of rows."
  (:require [medley.core :as m]
            [metabase.driver :as driver]
            [metabase.sync.interface :as i]
            [schema.core :as s]))

(s/defn ^:private basic-sample :- (s/maybe i/TableSample)
  "Procure a sequence of table rows, up to `max-sample-rows` (10,000 at the time of this writing), for
   use in the fingerprinting sub-stage of analysis. Returns `nil` if no rows are available."
  [table :- i/TableInstance, fields :- [i/FieldInstance]]
  (seq (driver/table-rows-sample table fields)))

(s/defn ^:private table-sample->field-sample :- (s/maybe i/FieldSample)
  "Fetch a sample for the Field whose values are at INDEX in the TABLE-SAMPLE.
   Filters out `nil` values; returns `nil` if a non-empty sample cannot be obtained."
  [table-sample :- i/TableSample, i :- s/Int]
  (->> (for [row table-sample]
         (nth row i))
       (filter (complement nil?))
       seq))

(s/defn sample-fields :- [(s/pair i/FieldInstance "Field", (s/maybe i/FieldSample) "FieldSample")]
  "Fetch samples for a series of FIELDS. Returns tuples of Field and sample.
   This may return `nil` if the sample could not be fetched for some other reason."
  [table :- i/TableInstance, fields :- [i/FieldInstance]]
  (when-let [table-sample (basic-sample table fields)]
    (for [[i field] (m/indexed fields)]
      [field (table-sample->field-sample table-sample i)])))
