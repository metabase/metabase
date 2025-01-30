(ns metabase.pivot.core
  (:require
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

(defn ^:export split-pivot-data
  "Pulls apart different aggregations that were packed into one result set returned from the QP.
  The pivot-grouping column indicates which breakouts were used to compute a given row. We used that column
  to split apart the data and convert field refs to indices"
  [data]
  (let [data        #?(:cljs (js->clj data :keywordize-keys true) :clj data)
        group-index (u/index-of is-pivot-group-column (:cols data))
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
    #?(:cljs (clj->js {:pivotData pivot-data
                       :columns    columns})
       :clj [pivot-data columns])))

(defn ^:export subtotal-values
  "Returns subtotal values"
  [pivot-data value-column-indexes]
  (let [pivot-data           #?(:cljs (js->clj pivot-data) :clj pivot-data)
        value-column-indexes #?(:cljs (js->clj value-column-indexes) :clj value-column-indexes)
        subtotal-values-map
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
         pivot-data)]
    #?(:cljs (clj->js subtotal-values-map)
       :clj  subtotal-values-map)))
