(ns metabase.sync.analyze.fingerprint.sample
  "Analysis sub-step that fetches a sample of rows for a given Table and some set of Fields belonging to it, which is
   used to generate fingerprints for those Fields. Currently this is dumb and just fetches a contiguous sequence of
   rows, but in the future we plan to make this more sophisticated and have different types of samples for different
   Fields, or do a better job getting a more-random sample of rows."
  (:require [metabase.driver :as driver]
            [metabase.sync.interface :as i]
            [schema.core :as s]))

(s/defn sample-fields :- (s/maybe i/TableSample)
  "Procure a sequence of table rows, up to `max-sample-rows` (10,000 at the time of this writing), for
   use in the fingerprinting sub-stage of analysis."
  [table :- i/TableInstance, fields :- [i/FieldInstance]]
  (driver/table-rows-sample table fields))
