(ns metabase.sync.analyze.fingerprint.sample
  "Analysis sub-step that fetches a sample of values for a given Field, which is used to generate a fingerprint for it.
   Currently this is dumb and just fetches a contiguous sequence of values, but in the future we plan to make this
   more sophisticated and have different types of samples for different Fields."
  (:require [metabase.driver :as driver]
            [metabase.models.table :refer [Table]]
            [metabase.sync.interface :as i]
            [schema.core :as s]
            [toucan.db :as db]))

(s/defn ^:always-validate basic-sample :- (s/maybe i/ValuesSample)
  "Procure a sequence of non-nil values, up to `max-sync-lazy-seq-results` (10,000 at the time of this writing), for use
   in the various tests above. Maybe return `nil` if no values are available."
  [field :- i/FieldInstance]
  ;; TODO - we should make `->driver` a method so we can pass things like Fields into it
  (->> (driver/field-values-lazy-seq (driver/->driver (db/select-one-field :db_id Table :id (:table_id field)))
                                     field)
       (take driver/max-sync-lazy-seq-results)
       (filter (complement nil?))
       seq))
