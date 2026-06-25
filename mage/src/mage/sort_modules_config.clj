(ns mage.sort-modules-config
  "Sort the modules Kondo config (.clj-kondo/config/modules/config.edn) so it never trips
  the sortedness assertions in [[metabase.core.modules-test]]:

  - modules are ordered by name, with `enterprise/` modules last
  - each module's `:model-imports` and `:model-exports` sets are sorted

  Sorting is done in place: existing whitespace/comment nodes stay put and only the values are
  reordered into their sorted slots, so the file's formatting is preserved."
  (:require
   [clojure.string :as str]
   [mage.color :as c]
   [mage.util :as u]
   [rewrite-clj.node :as n]
   [rewrite-clj.parser :as r.parser]))

(set! *warn-on-reflection* true)

(def ^:private config-path ".clj-kondo/config/modules/config.edn")

(defn- module-sort-key
  "Same ordering the test uses: enterprise/ modules sort last, then alphabetical."
  [module-name]
  [(if (str/starts-with? (str module-name) "enterprise/") 1 0)
   (str module-name)])

(defn- reorder-values
  "Reorder the value (sexpr-able) children of `node` into `sorted-values`, leaving whitespace and
  comment nodes in their original positions. `sorted-values` must contain exactly the node's
  current value children, just in the desired order."
  [node sorted-values]
  (let [slots (atom sorted-values)]
    (n/replace-children
     node
     (mapv (fn [child]
             (if (n/sexpr-able? child)
               (let [v (first @slots)]
                 (swap! slots rest)
                 v)
               child))
           (n/children node)))))

(defn- sort-set-node
  "Sort a `#{...}` set node's elements, preserving formatting."
  [set-node]
  (reorder-values set-node (sort-by n/sexpr (filter n/sexpr-able? (n/children set-node)))))

(defn- sort-model-sets
  "Walk a module's config map node; sort any `:model-imports`/`:model-exports` set value."
  [config-node]
  (let [vals (vec (filter n/sexpr-able? (n/children config-node)))
        sort? #{:model-imports :model-exports}
        vals' (vec (map-indexed
                    (fn [i node]
                      ;; value of a key follows it: sort the node after a matching keyword
                      (if (and (pos? i)
                               (n/keyword-node? (nth vals (dec i)))
                               (sort? (n/sexpr (nth vals (dec i))))
                               (= :set (n/tag node)))
                        (sort-set-node node)
                        node))
                    vals))]
    (reorder-values config-node vals')))

(defn- sort-modules-map
  "Sort the modules map node: sort key/value pairs by module name (enterprise last) and sort each
  module's model sets."
  [map-node]
  (let [vals    (vec (filter n/sexpr-able? (n/children map-node)))
        pairs   (partition 2 vals)
        sorted  (->> pairs
                     (sort-by (fn [[k _]] (module-sort-key (n/sexpr k))))
                     (mapcat (fn [[k v]] [k (sort-model-sets v)]))
                     vec)]
    (reorder-values map-node sorted)))

(defn- sort-root
  "Sort the modules config in the parsed top-level forms node."
  [forms-node]
  (n/replace-children
   forms-node
   (mapv (fn [node]
           (if (= :map (n/tag node))
             ;; the single top-level {:metabase/modules {...}} map
             (n/replace-children
              node
              (mapv (fn [child]
                      (if (= :map (n/tag child))
                        (sort-modules-map child)
                        child))
                    (n/children node)))
             node))
         (n/children forms-node))))

(defn sort-string
  "Sort the modules config given as a string; return the sorted string. Pure; used in tests."
  [content]
  (n/string (sort-root (r.parser/parse-string-all content))))

(defn sort-config
  "CLI entry point. Sorts the modules config file in place. Run this when
  `metabase.core.modules-test` complains the config is not sorted."
  [_parsed]
  (println (c/cyan (str "Sorting " config-path "...")))
  (let [path    (str u/project-root-directory "/" config-path)
        content (slurp path)
        sorted  (sort-string content)]
    (if (= content sorted)
      (println (c/green "Modules config already sorted."))
      (do (spit path sorted)
          (println (c/green "Sorted modules config."))))))
