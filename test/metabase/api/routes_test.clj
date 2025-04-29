(ns metabase.api.routes-test
  (:require
   [clojure.test :refer :all]
   [rewrite-clj.parser]
   [rewrite-clj.zip :as z]))

(set! *warn-on-reflection* true)

(defn- find-map-keys [map-loc]
  (let [zloc (z/down map-loc)]
    (loop [ks [], zloc zloc]
      (if-not zloc
        ks
        (recur (conj ks (z/sexpr zloc))
               (-> zloc z/right z/right))))))

(defn- find-route-map-def [file]
  (-> file
      (z/find-next (fn [zloc]
                     (when (= (z/tag zloc) :list)
                       (let [first-child (z/down zloc)]
                         (when (= (z/sexpr first-child) 'def)
                           (let [next-child (z/right first-child)]
                             (= (z/sexpr next-child) 'route-map)))))))))

(defn- find-route-map [file]
  (-> file
      find-route-map-def
      z/down
      (z/find-next #(= (z/tag %) :map))))

(defn- check-routes-map []
  (with-open [r (clojure.lang.LineNumberingPushbackReader. (java.io.FileReader. "src/metabase/api/routes.clj"))]
    (let [zloc        (z/of-node (rewrite-clj.parser/parse-all r))
          route-map   (find-route-map zloc)
          actual-keys (find-map-keys route-map)]
      (is (= (sort actual-keys)
             actual-keys)))))

(deftest ^:parallel keep-routes-sorted-test
  (testing "route-map keys should be sorted"
    (check-routes-map)))
