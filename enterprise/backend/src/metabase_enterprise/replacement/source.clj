(ns metabase-enterprise.replacement.source
  (:require
   [clojure.data :as data]
   [medley.core :as m]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [toucan2.core :as t2]))

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

(defn- format-column [col]
  {:name          (or (:lib/desired-column-alias col) (:name col))
   :database_type (or (:database-type col) "")})

(defn- missing-semantic-type-columns
  "Returns formatted columns that have `sem-type` in `from-by-name` but not in `to-by-name`
  for columns present in both maps."
  [sem-type from-by-name to-by-name]
  (let [common-names (filter to-by-name (keys from-by-name))]
    (into []
          (comp (filter #(= sem-type (:semantic-type (from-by-name %))))
                (remove #(= sem-type (:semantic-type (to-by-name %))))
                (map from-by-name)
                (map format-column))
          common-names)))

(defn- fetch-source
  "Fetch source metadata and its database ID."
  [entity-type entity-id]
  (case entity-type
    :card  (let [mp   (lib-be/application-database-metadata-provider
                       (t2/select-one-fn :database_id :model/Card :id entity-id))
                 card (lib.metadata/card mp entity-id)]
             {:mp mp :source card :database-id (:database-id card)})
    :table (let [db-id (t2/select-one-fn :db_id :model/Table :id entity-id)
                 mp    (lib-be/application-database-metadata-provider db-id)
                 table (lib.metadata/table mp entity-id)]
             {:mp mp :source table :database-id (:db-id table)})))

(defn check-replace-source
  "Check whether `old-source` can be replaced by `new-source`. Returns a sequence of error
  maps describing incompatibilities. An empty sequence means the sources are compatible.
  Arguments match `swap-source`: each is a `[entity-type entity-id]` pair."
  [[old-type old-id] [new-type new-id]]
  (let [{source-mp :mp old-source :source} (fetch-source old-type old-id)
        {new-source :source}               (fetch-source new-type new-id)
        old-cols    (lib/returned-columns (lib/query source-mp old-source))
        new-cols    (lib/returned-columns (lib/query source-mp new-source))
        old-by-name (m/index-by :lib/desired-column-alias old-cols)
        new-by-name (m/index-by :lib/desired-column-alias new-cols)
        [missing-names _] (data/diff (set (keys old-by-name)) (set (keys new-by-name)))
        missing-cols (mapv (comp format-column old-by-name) missing-names)
        common-names (filter new-by-name (keys old-by-name))
        type-mismatches (into []
                              (comp (remove #(= (:effective-type (old-by-name %))
                                                (:effective-type (new-by-name %))))
                                    (map (fn [col-name]
                                           {:name                 (or (:lib/desired-column-alias (old-by-name col-name)) col-name)
                                            :source_database_type (or (:database-type (old-by-name col-name)) "")
                                            :target_database_type (or (:database-type (new-by-name col-name)) "")})))
                              common-names)
        missing-pks  (missing-semantic-type-columns :type/PK old-by-name new-by-name)
        extra-pks    (missing-semantic-type-columns :type/PK new-by-name old-by-name)
        missing-fks  (missing-semantic-type-columns :type/FK old-by-name new-by-name)
        fk?          #(= :type/FK (:semantic-type %))
        fk-mismatches (into []
                            (comp (filter (comp fk? old-by-name))
                                  (filter (comp fk? new-by-name))
                                  (remove #(= (:fk-target-field-id (old-by-name %))
                                              (:fk-target-field-id (new-by-name %))))
                                  (map new-by-name)
                                  (map format-column))
                            common-names)]
    (cond-> []
      (seq missing-cols)
      (conj {:type :missing-column :columns missing-cols})

      (seq type-mismatches)
      (conj {:type :column-type-mismatch :columns type-mismatches})

      (seq missing-pks)
      (conj {:type :missing-primary-key :columns missing-pks})

      (seq extra-pks)
      (conj {:type :extra-primary-key :columns extra-pks})

      (seq missing-fks)
      (conj {:type :missing-foreign-key :columns missing-fks})

      (seq fk-mismatches)
      (conj {:type :foreign-key-mismatch :columns fk-mismatches}))))
