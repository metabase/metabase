(ns metabase.pivot.core
  (:require
   #?(:clj [metabase.util.json :as json])
   [flatland.ordered.map :as ordered-map]
   [medley.core :as m]
   [metabase.util :as u]))

(defn is-pivot-group-column
  "Is the given column the pivot-grouping column?"
  [col]
  (= (:name col) "pivot-grouping"))

;; TODO: Remove these JSON helpers once more logic is encapsualted in CLJC and we don't need to use
;; JSON-encoded keys in maps.
(defn- to-key
  [x]
  #?(:cljs (js/JSON.stringify (clj->js x))
     :clj x))

(defn- from-key
  [x]
  #?(:cljs (js->clj (js/JSON.parse (clj->js x)))
     :clj x))

(defn- json-parse
  [x]
  #?(:cljs (js->clj (js/JSON.parse (clj->js x)))
     :clj (json/decode x)))

(defn split-pivot-data
  "Pulls apart different aggregations that were packed into one result set returned from the QP.
  The pivot-grouping column indicates which breakouts were used to compute a given row. We used that column
  to split apart the data and convert field refs to indices"
  [data]
  (let [group-index (u/index-of is-pivot-group-column (:cols data))
        columns     (filter #(not (is-pivot-group-column %)) (:cols data))
        breakouts   (filter #(= (:source %) "breakout") columns)
        pivot-data  (->> (:rows data)
                         (group-by #(nth % group-index))
                         ;; TODO: Make this logic more understandable
                         (m/map-kv
                          (fn [k rows]
                            (let [breakout-indexes (range (count breakouts))
                                  indexes (into [] (filter #(zero? (bit-and (bit-shift-left 1 %) k)) breakout-indexes))]
                              [(to-key indexes)
                               (map #(vec (concat (subvec % 0 group-index) (subvec % (inc group-index))))
                                    rows)]))))]
    {:pivot-data pivot-data
     :columns columns}))

(defn subtotal-values
  "Returns subtotal values"
  [pivot-data value-column-indexes]
  (m/map-kv-vals
   (fn [subtotalName subtotal]
     (let [indexes (from-key subtotalName)]
       (reduce
        (fn [acc row]
          (let [value-key (to-key (map #(nth row %) indexes))]
            (assoc acc
                   value-key
                   (map #(nth row %) value-column-indexes))))
        {}
        subtotal)))
   pivot-data))

(defn- collapse-level
  "Marks all nodes at the given level as collapsed. 1 = root node; 2 = children
  of the root, etc."
  [tree level]
  (into (ordered-map/ordered-map)
        (if (= level 1)
          (m/map-vals
           #(assoc % :isCollapsed true)
           tree)
          (m/map-vals
           #(update % :children (fn [subtree] (collapse-level subtree (dec level))))
           tree))))

(defn- add-is-collapsed
  "Annotates a row tree with :isCollapsed values, based on the contents of
  collapsed-subtotals"
  [tree collapsed-subtotals]
  (let [parsed-collapsed-subtotals (map json-parse collapsed-subtotals)]
    (reduce
     (fn [tree collapsed-subtotal]
       (cond
         ;; A plain integer represents an entire level of the tree which is
         ;; collapsed (1-indexed)
         (int? collapsed-subtotal)
         (collapse-level tree collapsed-subtotal)

         ;; A seq represents a specific path in the tree which is collapsed
         (sequential? collapsed-subtotal)
         (let [key-path (conj (into [] (interpose :children collapsed-subtotal))
                              :isCollapsed)]
           (assoc-in tree key-path true))))
     tree
     parsed-collapsed-subtotals)))

(defn- add-path-to-tree
  "Adds a path of values to a row or column tree. Each level of the tree is an
  ordered map with values as keys, each associated with a sub-map like
  {:children (ordered-map/ordered-map)}."
  [path tree]
  (if (seq path)
    (let [v       (first path)
          subtree (or (get-in tree [v :children]) (ordered-map/ordered-map))]
      (-> tree
          (assoc-in [v :children] (add-path-to-tree (rest path) subtree))
          (assoc-in [v :isCollapsed] false)))
    tree))

(defn build-values-by-key
  "Replicate valuesByKey construction"
  [rows col-indexes row-indexes val-indexes col-settings cols]
  ;; Construct valueKey row[[col-indexes val-indexes]]
  (reduce (fn [acc row]
            ;; Construct valueKey
            (let [value-key    (mapv row (into col-indexes row-indexes))
                  values       (mapv row val-indexes)
                  value-cols   (mapv (fn [index]
                                       (get-in col-settings [index :column]))
                                     val-indexes)
                  data         (vec (map-indexed (fn [index value]
                                                   (sorted-map :value value
                                                               :col (nth cols index)))
                                                 row))
                  ;; @tsp
                  ;; This uses data as its starting point, which contains maps with :col as a key
                  ;; The original frontend code calculates dimensions here by repeating the `data`
                  ;; calculation but using :column as the key, then it filters
                  dimensions   (->> data
                                    (filter (fn [tmp]
                                              (= (get-in tmp [:col :source]) "breakout"))))]
              (assoc acc
                     value-key
                     (sorted-map :values values
                                 :value-cols value-cols
                                 :data data
                                 :dimensions dimensions))))
          (ordered-map/ordered-map)
          rows))

(defn build-pivot-trees
  "TODO"
  [rows col-indexes row-indexes _col-settings collapsed-subtotals]
  (let [{:keys [row-tree _col-tree]}
        (reduce
         (fn [{:keys [row-tree col-tree]} row]
           (let [row-path (mapv row row-indexes)
                 col-path (mapv row col-indexes)]
             {:row-tree (add-path-to-tree row-path row-tree)
              :col-tree (add-path-to-tree col-path col-tree)}))
         {:row-tree (ordered-map/ordered-map)
          :col-tree (ordered-map/ordered-map)}
         rows)]
    (add-is-collapsed row-tree collapsed-subtotals)))
