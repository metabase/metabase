(ns metabase.sync.analyze.classifiers.category
  "Classifier that determines whether a Field should be marked as a `:type/Category` based on its type and the number of distinct values it has."
  (:require [clojure.tools.logging :as log]
            [metabase.models.field-values :as field-values]
            [metabase.sync
             [interface :as i]
             [util :as sync-util]]
            [metabase.util.schema :as su]
            [schema.core :as s]))


(def ^:const ^:Integer category-string-length-threshold
  "Maximum average string length for a field to be considered a category."
  20)

(s/defn ^:private category-candidate? :- s/Bool
  [{:keys [base_type special_type database_type]}]
  (and (nil? special_type)
       (or (isa? base_type :type/Integer)
           (isa? base_type :type/Text))
       (not= database_type "metric")))

(s/defn infer-is-category :- (s/maybe i/FieldInstance)
  "Classifier that attempts to determine whether FIELD ought to be marked as a Category based on its distinct count."
  [field :- i/FieldInstance, fingerprint :- (s/maybe i/Fingerprint)]
  (when (category-candidate? field)
    (let [distinct-count (get-in fingerprint [:global :distinct-count])
          average-length (-> field :type :type/Text :average-length)]
      (when (and (some-> distinct-count (< field-values/low-cardinality-threshold))
                 (or (nil? average-length)
                     (<  average-length category-string-length-threshold)))
        (log/debug (format "%s has %d distinct values. Since that is less than %d, we're marking it as a category."
                           (sync-util/name-for-logging field)
                           distinct-count
                           field-values/low-cardinality-threshold))
        (assoc field
          :special_type :type/Category)))))
