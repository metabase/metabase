(ns metabase-enterprise.data-complexity-score.metrics.nominal
  "Nominal-consistency dimension — string-level naming disorder. Operates on the raw text layer;
   no embeddings involved. Two tables both called `Orders` are a nominal collision even if they
   mean different things semantically, and vice versa `Gross_Revenue` and `Net_Sales` are
   nominally consistent (no collision) despite overlapping semantics.

   Variables:
     :name-collisions          (scored)  name-occurrences past the first
     :repeated-measures        (scored)  measure-names appearing on >1 table
     :field-level-collisions   (scored)  field names that appear on >1 distinct table
     :name-collisions-density  (value)   collisions / entity-count × 100
     :name-concentration       (value)   1 − Pielou's evenness over name frequencies

  All tier 1."
  (:require
   [metabase-enterprise.data-complexity-score.metrics.common :as common]))

(set! *warn-on-reflection* true)

(def weights
  "Per-variable weights contributing to the dimension sub-total."
  {:name-collisions        100
   :repeated-measures      2
   :field-level-collisions 5})

(defn- name-collisions [entities]
  (common/scored (:name-collisions weights) (common/repeated-names (map :name entities))))

(defn- repeated-measures [entities]
  (common/scored (:repeated-measures weights) (common/repeated-names (mapcat :measure-names entities))))

(defn- field-level-collisions
  "Count distinct normalized field names that appear on more than one distinct table. Only scans
   `:fields` on `:table` entities (Cards' :fields vectors are empty)."
  [entities]
  (let [name->tables (reduce (fn [acc e]
                               (if-let [fields (seq (:fields e))]
                                 (reduce (fn [acc f]
                                           (if-let [n (common/normalize-name (:name f))]
                                             (update acc n (fnil conj #{}) (:id e))
                                             acc))
                                         acc
                                         fields)
                                 acc))
                             {}
                             entities)
        collisions   (count (filter (fn [[_ tables]] (> (count tables) 1)) name->tables))]
    (common/scored (:field-level-collisions weights) collisions)))

(defn- name-collisions-density
  "Collisions per 100 entities. nil when the catalog is empty (ratio is undefined)."
  [entities]
  (let [collisions (common/repeated-names (map :name entities))]
    (common/value (some-> (common/safe-ratio collisions (count entities))
                          (* 100.0)))))

(defn- name-concentration
  "`1 − Pielou's evenness` on entity-name frequencies. 0 = perfectly even (every name unique);
   approaching 1 = highly concentrated (one or two names dominate). nil when there are no
   named entities. When all entities share one name, evenness is defined as 1 (the distribution
   over one category is trivially 'even'), so concentration is 0 by convention — this differs
   from the Shannon-only view but matches the intuition that one-category cases have no
   unevenness to report."
  [entities]
  (let [freqs (->> entities
                   (keep (comp common/normalize-name :name))
                   frequencies)
        total (reduce + 0 (vals freqs))
        s     (count freqs)]
    (cond
      (zero? total) (common/value nil)
      (<= s 1)      (common/value 0.0)
      :else
      (let [log-s (Math/log s)
            h     (reduce (fn [acc c]
                            (let [p (/ (double c) total)]
                              (- acc (* p (Math/log p)))))
                          0.0
                          (vals freqs))
            j     (/ h log-s)]
        (common/value (max 0.0 (min 1.0 (- 1.0 j))))))))

(defn score
  "Compute the Nominal dimension block for `entities`."
  [entities]
  (common/dimension-block
   [[:name-collisions         (name-collisions entities)]
    [:repeated-measures       (repeated-measures entities)]
    [:field-level-collisions  (field-level-collisions entities)]
    [:name-collisions-density (name-collisions-density entities)]
    [:name-concentration      (name-concentration entities)]]))
