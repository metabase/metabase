(ns metabase.agent-lib.mbql-integration.field-resolution
  "Field-resolution helpers for the agent-lib MBQL bridge."
  (:require
   [clojure.set :as set]
   [metabase.agent-lib.mbql-integration.common :as common]
   [metabase.lib.core :as lib]
   [metabase.lib.util :as lib.util]))

(set! *warn-on-reflection* true)

(defn fields-by-table-id
  "Group metadata fields by table id for lookup-heavy resolution helpers."
  [fields-by-id]
  (reduce-kv (fn [acc _field-id field]
               (update acc (:table-id field) (fnil conj []) field))
             {}
             fields-by-id))

(defn field-target-table-id
  "Return the table id reached by following a field's FK target metadata."
  [fields-by-id field-id]
  (when-let [target-field-id (some-> (get fields-by-id field-id) :fk-target-field-id)]
    (:table-id (get fields-by-id target-field-id))))

(defn field-path-start-ids
  "Return the field ids that can anchor lineage for a surfaced query column."
  [column]
  (->> [(:source-field column)
        (:fk-field-id column)
        (:lib/original-fk-field-id column)
        (:id column)]
       (filter pos-int?)
       distinct))

(defn fk-path-to-table
  "Return the unique FK chain from `start-field-id` to `target-table-id`, or
  nil when none or more than one plausible path exists.

  The local `walk-path` stays nested because it is the only genuinely recursive
  helper left in this file."
  [fields-by-id start-field-id target-table-id]
  (let [fields-by-table (fields-by-table-id fields-by-id)]
    (letfn [(walk-path [field-id visited depth]
              (when (and (pos-int? field-id)
                         (not (visited field-id))
                         (< depth 4))
                (when-let [next-table-id (field-target-table-id fields-by-id field-id)]
                  (if (= next-table-id target-table-id)
                    [[field-id]]
                    (not-empty
                     (mapcat (fn [candidate]
                               (map #(into [field-id] %)
                                    (or (walk-path (:id candidate)
                                                   (conj visited field-id)
                                                   (inc depth))
                                        [])))
                             (get fields-by-table next-table-id)))))))]
      (let [paths (vec (walk-path start-field-id #{} 0))]
        (when (= 1 (count paths))
          (first paths))))))

(defn numeric-type?
  "True when `type` is one of the numeric MBQL types agent-lib treats as
  interchangeable for previous-stage reuse."
  [type]
  (contains? #{"type/BigInteger"
               "type/Decimal"
               "type/Float"
               "type/Integer"
               "type/Number"}
             (cond
               (keyword? type) (str (namespace type) "/" (name type))
               (string? type) type
               :else nil)))

(defn types-compatible?
  "True when `raw-field` and `candidate` can safely stand in for each other by
  type."
  [raw-field candidate]
  (let [raw-type       ((some-fn :effective-type :base-type) raw-field)
        candidate-type ((some-fn :effective-type :base-type) candidate)]
    (or (nil? raw-type)
        (nil? candidate-type)
        (= raw-type candidate-type)
        (and (numeric-type? raw-type)
             (numeric-type? candidate-type)))))

(defn candidate-has-resolution-lineage?
  "True when a candidate column carries lineage metadata that makes it a better
  resolution target than a bare id/name match."
  [column]
  (boolean
   (or (:fk-field-id column)
       (:fk-field-name column)
       (:fk-join-alias column)
       (:lib/original-fk-field-id column)
       (:lib/original-fk-field-name column)
       (:lib/original-fk-join-alias column)
       (common/column-join-alias column)
       (:lib/source-uuid column)
       (:lib/expression-name column)
       (= :source/previous-stage (:lib/source column)))))

(defn source-column-field-name
  "Return the best human-readable field name carried by a surfaced source
  column."
  [column]
  ((some-fn :lib/source-column-alias
            :name
            :lib/original-name
            :fk-field-name
            :lib/original-fk-field-name)
   column))

(defn source-column-field-join-alias
  "Return the most specific join alias associated with a surfaced source
  column."
  [column]
  ((some-fn common/column-join-alias :fk-join-alias :lib/original-fk-join-alias) column))

(defn source-column-original-field-id
  "Return the original field id carried by a surfaced source column."
  [column]
  ((some-fn :lib/original-fk-field-id :source-field) column))

(defn source-column-original-field-name
  "Return the original field name carried by a surfaced source column."
  [column]
  ((some-fn :lib/original-fk-field-name :source-field-name) column))

(defn source-column-original-field-join-alias
  "Return the original join alias carried by a surfaced source column."
  [column]
  ((some-fn :lib/original-fk-join-alias :source-field-join-alias) column))

(defn candidate-join-alias-for-field-id
  "Return a unique join alias for columns whose lineage includes `field-id`."
  [candidates field-id]
  (when (pos-int? field-id)
    (let [matches (->> candidates
                       (keep (fn [candidate]
                               (when (some #{field-id} (field-path-start-ids candidate))
                                 ((some-fn common/column-join-alias
                                           :fk-join-alias
                                           :lib/original-fk-join-alias)
                                  candidate))))
                       distinct
                       vec)]
      (when (= 1 (count matches))
        (first matches)))))

(defn synthesize-chained-related-field
  "Project lineage from a surfaced source column back onto the requested raw
  field shape.

  This is the agent-lib-specific bridge for multi-hop related fields until lib
  exposes a canonical helper for the same behavior."
  [fields-by-id candidates raw-field source-column path]
  (let [immediate-field-id   (last path)
        immediate-field      (get fields-by-id immediate-field-id)
        original-field-id    (or (source-column-original-field-id source-column)
                                 (when (> (count path) 1)
                                   (first path)))
        original-field       (get fields-by-id original-field-id)
        original-field-name  (or (source-column-original-field-name source-column)
                                 (:name original-field))
        immediate-field-name (or (:name immediate-field)
                                 (source-column-field-name source-column))
        immediate-join-alias (or (source-column-field-join-alias source-column)
                                 (candidate-join-alias-for-field-id candidates immediate-field-id)
                                 (candidate-join-alias-for-field-id candidates original-field-id))
        original-join-alias  (or (source-column-original-field-join-alias source-column)
                                 (candidate-join-alias-for-field-id candidates original-field-id)
                                 immediate-join-alias)]
    (cond-> raw-field
      immediate-field-id (assoc :fk-field-id immediate-field-id)
      immediate-field-name (assoc :fk-field-name immediate-field-name)
      immediate-join-alias (assoc :fk-join-alias immediate-join-alias)
      original-field-id (assoc :lib/original-fk-field-id original-field-id)
      original-field-name (assoc :lib/original-fk-field-name original-field-name)
      original-join-alias (assoc :lib/original-fk-join-alias original-join-alias))))

(defn multi-hop-lineage-candidate?
  "True when a synthesized related field captures more than one hop of lineage."
  [column]
  (boolean
   (or (let [immediate-field-id (:fk-field-id column)
             original-field-id  (:lib/original-fk-field-id column)]
         (and (pos-int? immediate-field-id)
              (pos-int? original-field-id)
              (not= immediate-field-id original-field-id)))
       (let [immediate-field-name (:fk-field-name column)
             original-field-name  (:lib/original-fk-field-name column)]
         (and (string? immediate-field-name)
              (string? original-field-name)
              (not= immediate-field-name original-field-name)))
       (let [immediate-join-alias (:fk-join-alias column)
             original-join-alias  (:lib/original-fk-join-alias column)]
         (and (string? immediate-join-alias)
              (string? original-join-alias)
              (not= immediate-join-alias original-join-alias))))))

(defn previous-stage-name-matches
  "Return previous-stage candidates whose comparable names overlap the requested
  raw field."
  [raw-field previous-stage-candidates]
  (let [raw-field-names (common/column-names raw-field)]
    (->> previous-stage-candidates
         (filter (fn [candidate]
                   (seq (set/intersection raw-field-names (common/column-names candidate)))))
         vec)))

(defn previous-stage-lineage-matches
  "Return previous-stage candidates whose lineage points back to `raw-field`.

  This is stricter than `types-compatible?`: appended stages may expose only
  aggregations, and agent-lib should only treat those as substitutes for a raw
  field when lib metadata preserves a real source-field lineage for that field."
  [raw-field previous-stage-candidates]
  (let [raw-field-id (:id raw-field)]
    (->> previous-stage-candidates
         (filter (fn [candidate]
                   (and (pos-int? raw-field-id)
                        (some #{raw-field-id} (field-path-start-ids candidate)))))
         vec)))

(defn previous-stage-aggregation-matches
  "Return previous-stage columns whose `:lib/source-uuid` comes from an
  aggregation over `raw-field`."
  [query raw-field previous-stage-candidates]
  (when-let [previous-stage-number (some-> query (lib.util/previous-stage-number -1))]
    (let [raw-field-id   (:id raw-field)
          matching-uuids (->> (map vector
                                   (lib/aggregations query previous-stage-number)
                                   (lib/aggregations-metadata query previous-stage-number))
                              (keep (fn [[aggregation metadata]]
                                      (when (and (pos-int? raw-field-id)
                                                 (some #{raw-field-id} (common/extract-field-ids aggregation)))
                                        (:lib/source-uuid metadata))))
                              set)]
      (->> previous-stage-candidates
           (filter #(contains? matching-uuids (:lib/source-uuid %)))
           vec))))

(defn- chained-related-candidates
  "Compute chained related-field candidates by walking FK paths from each
  candidate back to the raw field's table."
  [fields-by-id candidates raw-field]
  (let [target-table-id (:table-id raw-field)]
    (->> candidates
         (keep (fn [column]
                 (when-let [path (some #(fk-path-to-table fields-by-id % target-table-id)
                                       (field-path-start-ids column))]
                   (synthesize-chained-related-field fields-by-id candidates raw-field column path))))
         common/dedupe-candidate-columns
         vec)))

(defn- previous-stage-candidates
  "Compute previous-stage candidates that are type-compatible with `raw-field`."
  [candidates raw-field]
  (->> candidates
       (filter #(and (= :source/previous-stage (:lib/source %))
                     (types-compatible? raw-field %)))
       vec))

(defn- try-strategies
  "Try resolution strategies in priority order, returning the first match."
  [strategies]
  (some (fn [{:keys [resolve-fn]}] (resolve-fn)) strategies))

(defn resolve-field-in-query
  "Resolve a metadata field against what the current query stage actually
  exposes.

  Resolution strategies are tried in priority order; each is computed lazily
  so we stop as soon as one succeeds."
  ([fields-by-id query raw-field]
   (resolve-field-in-query fields-by-id query raw-field (common/current-query-field-candidates query)))
  ([fields-by-id query raw-field candidates]
   (let [query      (when (common/query? query) query)
         by-id+tbl  (fn [] (filterv #(and (= (:id raw-field) (:id %))
                                          (= (:table-id raw-field) (:table-id %)))
                                    candidates))
         by-id      (fn [] (filterv #(= (:id raw-field) (:id %)) candidates))
         lined      (fn [cs] (filterv candidate-has-resolution-lineage? cs))
         chained    (delay (chained-related-candidates fields-by-id candidates raw-field))
         prev-stage (delay (previous-stage-candidates candidates raw-field))]
     (or (try-strategies
          [{:name :multi-hop-chained-lineage
            :resolve-fn #(common/unique-query-candidate (filterv multi-hop-lineage-candidate? @chained))}
           {:name :exact-id+table-with-lineage
            :resolve-fn #(common/unique-query-candidate (lined (by-id+tbl)))}
           {:name :exact-id-with-lineage
            :resolve-fn #(common/unique-query-candidate (lined (by-id)))}
           {:name :previous-stage-lineage-or-aggregation
            :resolve-fn #(common/unique-query-candidate
                          (->> (concat (previous-stage-lineage-matches raw-field @prev-stage)
                                       (previous-stage-aggregation-matches query raw-field @prev-stage))
                               common/dedupe-candidate-columns vec))}
           {:name :previous-stage-name
            :resolve-fn #(common/unique-query-candidate (previous-stage-name-matches raw-field @prev-stage))}
           {:name :chained-related-fields
            :resolve-fn #(common/unique-query-candidate @chained)}
           {:name :lib-find-matching-column
            :resolve-fn #(when query (lib/find-matching-column query -1 raw-field candidates))}
           {:name :exact-id+table
            :resolve-fn #(common/unique-query-candidate (by-id+tbl))}
           {:name :exact-id
            :resolve-fn #(common/unique-query-candidate (by-id))}])
         (throw (ex-info (str "Field " (pr-str (:name raw-field))
                              " (id " (pr-str (:id raw-field))
                              ") is not available in the current query stage.")
                         {:field raw-field
                          :query query}))))))
