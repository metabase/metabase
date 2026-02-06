(ns metabase-enterprise.replacement.source
  (:require
   [metabase.lib.core :as lib]))

(def ^:private swappable-sources
  "The types of sources that can be swapped"
  #{:metadata/card :metadata/table})

(def ^:private required-matched-column-keys
  "When checking if a column is equivalent, these keys must match"
  [:lib/desired-column-alias :fk-target-field-id])

(def ^:private matchable-types
  "When checking if a column is equivalent, if one of the column's types is in this set, the other column must have the
  same type"
  #{:type/PK :type/FK})

(defn equivalent-column? [old-col new-col]
  (and (every? #(= (% old-col) (% new-col))
               required-matched-column-keys)
       (or (and (not (matchable-types (:effective-type old-col)))
                (not (matchable-types (:effective-type old-col))))
           (= (:effective-type old-col)
              (:effective-type new-col)))))

(defmulti ^:private columns (fn [_mp metadata]
                              (:lib/type metadata)))

(defmethod columns :metadata/card
  [mp card]
  (lib/returned-columns (lib/query mp card)))

(defmethod columns :metadata/table
  [mp table]
  (lib/fields mp (:id table)))

(defn can-swap-source? [mp old-source new-source]
  (when (and (swappable-sources (:lib/type old-source))
             (swappable-sources (:lib/type new-source)))
    (let [old-cols (lib/returned-columns (lib/query mp old-source))
          new-cols (lib/returned-columns (lib/query mp new-source))]
      (and (= (count old-cols) (count new-cols))
           (->> (map equivalent-column? old-cols new-cols)
                (every? identity))))))
