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

(defn- format-column [col]
  {:name          (or (:lib/desired-column-alias col) (:name col))
   :effective_type (some-> (:effective-type col) name)
   :semantic_type  (some-> (:semantic-type col) name)
   :database_type  (or (:database-type col) "")})

(defn- column-type-matches?
  "Returns true if the effective types of two columns are equal."
  [old-col new-col]
  (= (:effective-type old-col) (:effective-type new-col)))

(defn- column-type-mismatches
  "Returns a seq of type mismatch maps for columns present in both source and target
  but with different effective types."
  [old-by-name new-by-name]
  (into []
        (comp (filter new-by-name)
              (keep (fn [col-name]
                      (let [old-col (old-by-name col-name)
                            new-col (new-by-name col-name)]
                        (when-not (column-type-matches? old-col new-col)
                          {:name           col-name
                           :source_column  (format-column old-col)
                           :target_column  (format-column new-col)})))))
        (keys old-by-name)))

(defn check-replace-source
  "Check whether `old-source` can be replaced by `new-source`. Returns a sequence of error
  maps describing incompatibilities. An empty sequence means the sources are compatible."
  [mp old-source new-source]
  (let [old-cols    (lib/returned-columns (lib/query mp old-source))
        new-cols    (lib/returned-columns (lib/query mp new-source))
        old-by-name (into {} (map (juxt :lib/desired-column-alias identity)) old-cols)
        new-by-name (into {} (map (juxt :lib/desired-column-alias identity)) new-cols)
        old-names   (set (keys old-by-name))
        new-names   (set (keys new-by-name))
        missing     (into [] (comp (filter old-names) (remove new-names) (map old-by-name) (map format-column)) (keys old-by-name))
        extra       (into [] (comp (filter new-names) (remove old-names) (map new-by-name) (map format-column)) (keys new-by-name))
        type-mismatches (column-type-mismatches old-by-name new-by-name)]
    (cond-> []
      (or (seq missing) (seq extra))
      (conj (cond-> {:type "column-mismatch"}
              (seq missing) (assoc :missing_columns missing)
              (seq extra)   (assoc :extra_columns extra)))
      (seq type-mismatches)
      (conj {:type    "column-type-mismatch"
             :columns type-mismatches}))))
