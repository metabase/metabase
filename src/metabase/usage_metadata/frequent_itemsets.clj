(ns metabase.usage-metadata.frequent-itemsets
  "Closed frequent-itemset mining over weighted baskets."
  (:require
   [clojure.set :as set]))

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
                (let [atoms (set atom_fingerprints)]
                  (when (>= (count atoms) minimum-itemset-size)
                    {:atoms atoms
                     :count (long total_count)}))))
        rows))

(defn- weighted-support
  [baskets matches?]
  (transduce (comp (filter (comp matches? :atoms)) (map :count)) + 0 baskets))

(defn- itemset-support
  [baskets itemset]
  (let [itemset (set itemset)]
    (weighted-support baskets #(set/subset? itemset %))))

(defn any-atom-support
  "Return the weighted number of baskets containing at least one atom of `itemset`."
  [baskets itemset]
  (let [itemset (set itemset)]
    (weighted-support baskets #(seq (set/intersection itemset %)))))

(defn- add-singleton-support
  [supports {:keys [atoms count]}]
  (reduce #(update %1 %2 (fnil + 0) count) supports atoms))

(defn- frequent-singletons
  [baskets]
  (let [counts (reduce add-singleton-support {} baskets)]
    (into {}
          (filter (fn [[_ support]] (>= support absolute-support-floor)))
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

(defn- frequent-extensions
  [baskets itemsets]
  (let [itemset-set (set itemsets)]
    (into {}
          (keep (fn [candidate]
                  (let [support (itemset-support baskets candidate)]
                    (when (>= support absolute-support-floor)
                      [candidate support]))))
          (filter (partial has-all-subsets? itemset-set)
                  (apriori-join itemsets)))))

(defn- mine-itemsets
  [baskets]
  (let [singletons (frequent-singletons baskets)]
    (loop [itemsets (vec (sort (map vector (keys singletons))))
           result   {}]
      (if (or (empty? itemsets)
              (>= (count (first itemsets)) maximum-itemset-size))
        result
        (let [extensions (frequent-extensions baskets itemsets)
              next-size  (inc (count (first itemsets)))
              next-result (if (>= next-size minimum-itemset-size)
                            (into result extensions)
                            result)]
          (recur (vec (sort (keys extensions)))
                 next-result))))))

(defn- same-support-superset?
  [entries itemset support]
  (let [itemset-set (set itemset)
        itemset-size (count itemset)]
    (boolean
     (some (fn [[other other-support]]
             (and (= support other-support)
                  (> (count other) itemset-size)
                  (set/subset? itemset-set (set other))))
           entries))))

(defn- closed-only
  [itemset->support]
  (let [entries (vec itemset->support)]
    (into {}
          (remove (fn [[itemset support]]
                    (same-support-superset? entries itemset support)))
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
