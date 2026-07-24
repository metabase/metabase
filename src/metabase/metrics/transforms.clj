(ns metabase.metrics.transforms
  "Shared JSON transform functions for dimension and dimension-mapping columns
   used by both Card and Measure models."
  (:require
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]))

(defn normalize-dimension
  "Normalize a dimension after JSON parsing, converting string values to keywords."
  [dim]
  (cond-> dim
    (:status dim)         (update :status keyword)
    (:effective-type dim) (update :effective-type keyword)
    (:semantic-type dim)  (update :semantic-type keyword)
    (:sources dim)        (update :sources (fn [srcs] (mapv #(update % :type keyword) srcs)))))

(defn normalize-target-ref
  "Normalize a target ref after JSON parsing. Converts [\"field\" {...} id] to [:field {...} id]."
  [[clause-type opts & rest]]
  (into [(keyword clause-type)
         (cond-> opts
           (:base-type opts)      (update :base-type keyword)
           (:effective-type opts) (update :effective-type keyword))]
        rest))

(defn normalize-dimension-mapping
  "Normalize a dimension mapping after JSON parsing."
  [mapping]
  (-> mapping
      (update :type keyword)
      (update :target normalize-target-ref)))

(def transform-dimensions
  "Transform for dimensions column. Handles JSON serialization/deserialization."
  {:in mi/json-in
   :out (fn [dims]
          (some->> dims
                   mi/json-out-with-keywordization
                   (mapv normalize-dimension)))})

(def transform-dimension-mappings
  "Transform for dimension_mappings column. Handles JSON serialization/deserialization."
  {:in mi/json-in
   :out (fn [mappings]
          (some->> mappings
                   mi/json-out-with-keywordization
                   (mapv normalize-dimension-mapping)))})

;;; ------------------------------------------------- Serialization -------------------------------------------------
;;; Dimensions and dimension-mappings embed instance-specific Field and Table IDs that must be turned into portable
;;; references on export and resolved back to local IDs on import. Only curated (metric v2) entities serialize these;
;;; others re-derive them from their query on the far side.

(defn- export-dimension
  "Convert the Field IDs embedded in a persisted dimension's `:sources` to portable references."
  [dimension]
  (cond-> dimension
    (seq (:sources dimension))
    (update :sources (fn [sources]
                       (mapv (fn [source]
                               (cond-> source
                                 (pos-int? (:field-id source))
                                 (update :field-id serdes/*export-field-fk*)))
                             sources)))))

(defn- import-dimension
  "Inverse of [[export-dimension]]."
  [dimension]
  (cond-> dimension
    (seq (:sources dimension))
    (update :sources (fn [sources]
                       (mapv (fn [source]
                               (cond-> source
                                 (vector? (:field-id source))
                                 (update :field-id serdes/*import-field-fk*)))
                             sources)))))

(defn export-dimensions
  "Serialize a curated entity's `:dimensions`: convert the Field IDs embedded in each dimension's `:sources` to
   portable references. `nil` in, `nil` out (so the column is elided for non-curated entities); an empty vector is
   preserved, so a fully cleared dimension set round-trips as cleared rather than being re-seeded on import."
  [dimensions]
  (when (some? dimensions)
    (mapv export-dimension dimensions)))

(defn import-dimensions
  "Inverse of [[export-dimensions]]."
  [dimensions]
  (when (some? dimensions)
    (mapv import-dimension dimensions)))

(defn export-dimension-mappings
  "Serialize a curated entity's `:dimension_mappings`: convert `:table-id` and the Field IDs inside each mapping's
   `:target` field ref to portable references. `nil`/empty handled as in [[export-dimensions]]."
  [mappings]
  (when (some? mappings)
    (mapv (fn [mapping]
            (cond-> mapping
              (pos-int? (:table-id mapping)) (update :table-id serdes/*export-table-fk*)
              (:target mapping)              (update :target serdes/export-mbql)))
          mappings)))

(defn import-dimension-mappings
  "Inverse of [[export-dimension-mappings]]."
  [mappings]
  (when (some? mappings)
    (mapv (fn [mapping]
            (cond-> mapping
              (vector? (:table-id mapping)) (update :table-id serdes/*import-table-fk*)
              (:target mapping)             (update :target serdes/import-mbql)))
          mappings)))

(defn dimension-mappings-deps
  "Serdes dependencies contributed by an entity's `:dimension_mappings` — the Fields/Tables referenced by each
   mapping's `:target`."
  ([mappings]
   (dimension-mappings-deps false mappings))
  ([allow-int-ids? mappings]
   (into #{} (comp (map :target)
                   (mapcat #(serdes/mbql-deps allow-int-ids? %)))
         mappings)))
