(ns metabase-enterprise.replacement.source
  (:require
   [medley.core :as m]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(mr/def ::source-ref
  "A reference to a card or table, e.g. [:card 123] or [:table 45].

   Called 'source-ref' because these are things that can be a query's :source-card or
   :source-table. This is distinct from 'entity keys' in the dependency system —
   dashboards, transforms, etc. can *depend on* sources (and appear in `usages` output)
   but cannot themselves *be* sources."
  [:tuple
   [:enum :card :table]
   pos-int?])

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

(defn- column-match-key [col]
  (or (:lib/desired-column-alias col) (:name col)))

(defn- format-column [col]
  {:id             (:id col)
   :name           (column-match-key col)
   :display_name   (or (:display-name col) "")
   :base_type      (some-> (:base-type col) u/qualified-name)
   :effective_type (some-> (:effective-type col) u/qualified-name)
   :semantic_type  (some-> (:semantic-type col) u/qualified-name)})

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

(defn- column-errors
  "Compute errors for a source/target column pair. `new-col` may be nil when the column
   is missing from the target."
  [old-col new-col]
  (cond-> []
    (nil? new-col)
    (conj :missing-column)

    (and new-col (not= (:effective-type old-col) (:effective-type new-col)))
    (conj :column-type-mismatch)

    (and new-col
         (= :type/PK (:semantic-type old-col))
         (not= :type/PK (:semantic-type new-col)))
    (conj :missing-primary-key)

    (and new-col
         (not= :type/PK (:semantic-type old-col))
         (= :type/PK (:semantic-type new-col)))
    (conj :extra-primary-key)

    (and new-col
         (= :type/FK (:semantic-type old-col))
         (not= :type/FK (:semantic-type new-col)))
    (conj :missing-foreign-key)

    (and new-col
         (= :type/FK (:semantic-type old-col))
         (= :type/FK (:semantic-type new-col))
         (not= (:fk-target-field-id old-col)
               (:fk-target-field-id new-col)))
    (conj :foreign-key-mismatch)))

(defn check-replace-source
  "Check whether `old-source` can be replaced by `new-source`. Returns a map with
  `:success` and `:column_mappings` — a sequence of column mapping entries pairing source
  and target columns with per-entry errors.
  Arguments match `swap-source`: each is a `[entity-type entity-id]` pair."
  [[old-type old-id] [new-type new-id]]
  (let [{source-mp :mp old-source :source} (fetch-source old-type old-id)
        {target-mp :mp new-source :source} (fetch-source new-type new-id)
        ;; TODO (Alex P 2026-02-13): Perhaps filtering out remaps should go into the lib
        old-cols    (into [] (remove :remapped-from) (lib/returned-columns (lib/query source-mp old-source)))
        new-cols    (into [] (remove :remapped-from) (lib/returned-columns (lib/query target-mp new-source)))
        old-by-name (m/index-by column-match-key old-cols)
        new-by-name (m/index-by column-match-key new-cols)
        all-names   (distinct (concat (map column-match-key old-cols)
                                      (map column-match-key new-cols)))
        all-mappings (mapv (fn [col-name]
                             (let [old-col (get old-by-name col-name)
                                   new-col (get new-by-name col-name)
                                   errors  (when old-col (column-errors old-col new-col))]
                               (cond-> {}
                                 old-col      (assoc :source (format-column old-col))
                                 new-col      (assoc :target (format-column new-col))
                                 (seq errors) (assoc :errors errors))))
                           all-names)
        has-errors?     (boolean (some :errors all-mappings))]
    {:success         (not has-errors?)
     :column_mappings all-mappings}))
