(ns metabase.linters.shards
  "Splits the namespaces a linter checks across parallel CI jobs."
  (:require
   [clojure.java.io :as io]
   [clojure.tools.namespace.file :as ns.file]
   [clojure.tools.namespace.find :as ns.find]
   [clojure.tools.namespace.parse :as ns.parse]))

(set! *warn-on-reflection* true)

(defn namespace-weights
  "Map of each namespace in the `.clj` and `.cljc` files under `dirs` to its file's line count."
  [dirs]
  (into {}
        (for [dir   dirs
              file  (ns.find/find-sources-in-dir (io/file dir))
              :let  [decl (ns.file/read-file-ns-decl file)]
              :when decl]
          [(ns.parse/name-from-ns-decl decl)
           (with-open [r (io/reader file)]
             (count (line-seq r)))])))

(defn- lightest
  "Index of the shard with the least weight, the lowest index on a tie."
  [weights]
  (reduce (fn [best i]
            (if (< (nth weights i) (nth weights best)) i best))
          0
          (range (count weights))))

(defn shard
  "The namespaces of shard `k` (counting from 0) when `ns->weight` is split into `n` shards of about equal total
  weight, sorted.
  Every namespace lands in exactly one shard, and the same input always gives the same split."
  [ns->weight k n]
  {:pre [(nat-int? k) (pos-int? n) (< k n)]}
  ;; heaviest first, each to the lightest shard so far; the name breaks ties in weight, so the order is total
  (let [heaviest-first (sort-by (juxt (comp - val) (comp str key)) ns->weight)
        {:keys [members]} (reduce (fn [{:keys [weights] :as acc} [ns-sym weight]]
                                    (let [i (lightest weights)]
                                      (-> acc
                                          (update-in [:weights i] + weight)
                                          (update-in [:members i] conj ns-sym))))
                                  {:weights (vec (repeat n 0))
                                   :members (vec (repeat n []))}
                                  heaviest-first)]
    (sort (nth members k))))
