(ns metabase.lib-be.json-schema-test
  (:require
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [metabase.lib-be.json-schema :as js]))

(defn check-node [node]
  (when (map? node)
    (is (not= false (:items node)))
    (when-let [one-of (:oneOf node)]
      (is (< 1 (count one-of)))))
  node)

(deftest fix-json-schema-test
  (let [schema (js/make-schema)]
    (testing "does it even work at all?"
      (is (map? schema)))
    (testing "it should get rid of empty and one-branched oneOfs"
      (walk/postwalk check-node schema))))
