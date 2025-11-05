(ns metabase.deps-edn-test
  (:require
   [clojure.test :refer :all]
   [rewrite-clj.node :as r.node]
   [rewrite-clj.parser :as r.parser]))

(set! *warn-on-reflection* true)

(defn- map-node? [node]
  (= (r.node/tag node) :map))

(defn- map-pairs [node]
  (loop [pairs [], current-key nil, [child & more] (r.node/children node)]
    (cond
      (not child)
      pairs

      (r.node/whitespace-or-comment? child)
      (recur pairs current-key more)

      (nil? current-key)
      (recur pairs child more)

      (some? current-key)
      (recur (conj pairs [current-key child]) nil more))))

(defn- check-pairs-at-path [path pairs]
  (when (#{:deps :extra-deps :replace-deps} (last path))
    (testing path
      (let [ks (map (comp r.node/sexpr first) pairs)]
        (is (= (sort ks)
               ks))))))

(declare check-node)

(defn- check-children [path node]
  (when (r.node/inner? node)
    (doseq [child (r.node/children node)]
      (check-node path child))))

(defn- check-map [path node]
  (let [pairs (map-pairs node)]
    (check-pairs-at-path path pairs)
    (doseq [[k v] pairs
            :when (r.node/sexpr-able? k)]
      (check-node (conj path (r.node/sexpr k)) v))))

(defn- check-node [path node]
  (let [f (if (map-node? node)
            check-map
            check-children)]
    (f path node)))

(defn- check-deps-edn []
  (with-open [r (clojure.lang.LineNumberingPushbackReader. (java.io.FileReader. "deps.edn"))]
    (check-node [] (r.parser/parse-all r))))

(deftest ^:parallel keep-deps-edn-sorted-test
  (testing "deps should be sorted"
    (check-deps-edn)))
