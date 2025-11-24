(ns metabase.api-routes.routes-test
  (:require
   [clojure.string :as str]
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

(defn- find-route-map-def [file-zloc map-def-name]
  (-> file-zloc
      (z/find-next (fn [zloc]
                     (when (= (z/tag zloc) :list)
                       (let [first-child (z/down zloc)]
                         (when (= (z/sexpr first-child) 'def)
                           (let [next-child (z/right first-child)]
                             (= (z/sexpr next-child) map-def-name)))))))))

(defn- find-route-map [file-zloc map-def-name]
  (-> file-zloc
      (find-route-map-def map-def-name)
      z/down
      (z/find-next #(= (z/tag %) :map))))

(defn check-routes-map
  ([]
   (check-routes-map
    {:filename                  "src/metabase/api_routes/routes.clj"
     :map-def-name              'route-map
     :legacy-snake-cased-routes #{"/preview_embed"}}))
  ([{:keys [^String filename map-def-name legacy-snake-cased-routes]}]
   (with-open [r (clojure.lang.LineNumberingPushbackReader. (java.io.FileReader. filename))]
     (let [zloc        (z/of-node (rewrite-clj.parser/parse-all r))
           route-map   (find-route-map zloc map-def-name)
           actual-keys (find-map-keys route-map)]
       (assert (seq actual-keys))
       (testing "route-map keys should be sorted"
         (is (= (sort actual-keys)
                actual-keys)))
       (testing "REST API routes should use kebab-case names"
         (doseq [route actual-keys
                 :when (not (contains? legacy-snake-cased-routes route))]
           (is (= (str/replace route #"_" "-")
                  route))))))))

(deftest ^:parallel check-route-map-test
  (check-routes-map))
