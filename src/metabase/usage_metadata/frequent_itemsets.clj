(ns metabase.usage-metadata.frequent-itemsets
  "Closed frequent-itemset mining over weighted baskets.")

(def ^:private absolute-support-floor 2)
(def ^:private relative-support-floor 0.2)
(def minimum-itemset-size
  "Smallest number of atoms that can form a mined itemset."
  2)
(def ^:private maximum-itemset-size 5)
(def default-limit
  "Default maximum number of itemset candidates to return."
  20)

(defn rows->baskets
  "Project rollup rows to `{:atoms #{...} :count n}` baskets."
  [rows]
  (into []
        (keep (fn [{:keys [atom_fingerprints total_count]}]
                (when (>= (count atom_fingerprints) minimum-itemset-size)
                  {:atoms (set atom_fingerprints)
                   :count (long total_count)})))
        rows))

(defn- itemset-support
  [baskets itemset]
  (reduce (fn [acc {:keys [atoms count]}]
            (if (every? atoms itemset)
              (+ acc count)
              acc))
          0
          baskets))

(defn any-atom-support
  "Return the weighted number of baskets containing at least one atom of `itemset`."
  [baskets itemset]
  (reduce (fn [acc {:keys [atoms count]}]
            (if (some atoms itemset)
              (+ acc count)
              acc))
          0
          baskets))

(defn- frequent-singletons
  [baskets]
  (let [counts (reduce (fn [m {:keys [atoms count]}]
                         (reduce (fn [m atom]
                                   (update m atom (fnil + 0) count))
                                 m
                                 atoms))
                       {}
                       baskets)]
    (into {}
          (filter (fn [[_ count]]
                    (>= count absolute-support-floor)))
          counts)))

(defn- apriori-join
  [itemsets]
  (let [by-prefix (group-by (fn [itemset]
                              (subvec itemset 0 (dec (count itemset))))
                            itemsets)]
    (into #{}
          (mapcat (fn [group]
                    (for [a group
                          b group
                          :when (neg? (compare (peek a) (peek b)))]
                      (conj a (peek b)))))
          (vals by-prefix))))

(defn- has-all-subsets?
  [itemsets candidate]
  (let [candidate-size (count candidate)]
    (every? (fn [index]
              (contains? itemsets
                         (into (subvec candidate 0 index)
                               (subvec candidate (inc index)))))
            (range candidate-size))))

(defn- mine-itemsets
  [baskets]
  (let [singletons (frequent-singletons baskets)]
    (loop [frequent-itemsets (vec (sort (map vector (keys singletons))))
           itemset-size     1
           result           {}]
      (if (or (empty? frequent-itemsets)
              (>= itemset-size maximum-itemset-size))
        result
        (let [frequent-set (set frequent-itemsets)
              candidates   (apriori-join frequent-itemsets)
              candidates   (filterv (partial has-all-subsets? frequent-set) candidates)
              counted      (into {}
                                 (keep (fn [candidate]
                                         (let [support (itemset-support baskets (set candidate))]
                                           (when (>= support absolute-support-floor)
                                             [candidate support]))))
                                 candidates)
              next-size    (inc itemset-size)]
          (recur (vec (sort (keys counted)))
                 next-size
                 (cond-> result
                   (>= next-size minimum-itemset-size) (merge counted))))))))

(defn- closed-only
  [itemset->support]
  (let [entries (vec itemset->support)]
    (into {}
          (remove (fn [[itemset support]]
                    (let [itemset-set  (set itemset)
                          itemset-size (count itemset)]
                      (some (fn [[other other-support]]
                              (and (= support other-support)
                                   (> (count other) itemset-size)
                                   (every? (set other) itemset-set)))
                            entries))))
          entries)))

(defn mine-closed-itemsets
  "Mine closed frequent itemsets between two and five atoms from weighted baskets."
  [baskets]
  (closed-only (mine-itemsets baskets)))

(defn relative-support-ok?
  "Whether `itemset` occurs in a sufficient share of baskets containing any of its atoms."
  [baskets itemset support]
  (let [denominator (any-atom-support baskets itemset)]
    (or (zero? denominator)
        (>= (/ support (double denominator)) relative-support-floor))))
